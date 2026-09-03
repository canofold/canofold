import { enhanceDiagrams } from './shared'

let sequence = 0
export interface MermaidApi {
  initialize(options: Record<string, unknown>): void
  render(id: string, source: string): Promise<{ svg: string }>
}

const remoteModules = new Map<string, Promise<MermaidApi>>()
const renderRevisions = new WeakMap<HTMLElement, number>()
const renderQueues = new WeakMap<MermaidApi, Promise<void>>()
const cssSrgbComponent = String.raw`[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?%?`
const cssSrgbPattern = new RegExp(
  String.raw`^color\(\s*srgb\s+(${cssSrgbComponent})\s+(${cssSrgbComponent})\s+(${cssSrgbComponent})(?:\s*\/\s*(${cssSrgbComponent}))?\s*\)$`,
  'i'
)

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizedSrgbComponent(component: string) {
  const percentage = component.endsWith('%')
  const value = Number(percentage ? component.slice(0, -1) : component)
  return clamp(value, 0, percentage ? 100 : 1) / (percentage ? 100 : 1)
}

/** Mermaid's color parser does not accept CSS Color 4 `color(srgb ...)` serialization. */
export function normalizeMermaidColor(value: string, fallback: string) {
  const color = value.trim()
  const match = color.match(cssSrgbPattern)
  if (!match) return /^(?:color|oklch|oklab|lab|lch)\(/i.test(color) ? fallback : color || fallback

  const channels = match.slice(1, 4).map((channel) => Math.round(normalizedSrgbComponent(channel) * 255))
  if (channels.some((channel) => !Number.isFinite(channel))) return fallback

  const alpha = match[4] === undefined ? 1 : normalizedSrgbComponent(match[4])
  if (!Number.isFinite(alpha)) return fallback
  return alpha < 1 ? `rgba(${channels.join(', ')}, ${alpha})` : `rgb(${channels.join(', ')})`
}

function queueMermaidRender<T>(mermaidApi: MermaidApi, render: () => Promise<T>) {
  const previous = renderQueues.get(mermaidApi) ?? Promise.resolve()
  const request = previous.then(render)
  const tail = request.then(
    () => undefined,
    () => undefined
  )
  renderQueues.set(mermaidApi, tail)
  void tail.then(() => {
    if (renderQueues.get(mermaidApi) === tail) renderQueues.delete(mermaidApi)
  })
  return request
}

function resolveThemeColor(figure: HTMLElement, token: string, fallback: string) {
  const probe = figure.ownerDocument.createElement('span')
  probe.style.color = `var(${token}, ${fallback})`
  probe.style.display = 'none'
  figure.append(probe)
  const color = normalizeMermaidColor(getComputedStyle(probe).color, fallback)
  probe.remove()
  return color
}

type MermaidModule = MermaidApi | { default: MermaidApi }
type MermaidImporter = (moduleUrl: string) => Promise<MermaidModule>

export async function loadMermaidModule(
  moduleUrl: string,
  importer: MermaidImporter = (url) => import(/* @vite-ignore */ url) as Promise<MermaidModule>
) {
  const cached = remoteModules.get(moduleUrl)
  if (cached) return cached

  const pending = importer(moduleUrl).then((module) => ('default' in module ? module.default : module))
  remoteModules.set(moduleUrl, pending)
  void pending.catch(() => {
    if (remoteModules.get(moduleUrl) === pending) remoteModules.delete(moduleUrl)
  })
  return pending
}

async function resolveMermaid(figure: HTMLElement) {
  const moduleUrl =
    figure.dataset.cfModuleUrl?.trim() || new URL('./mermaid/mermaid.esm.min.mjs', import.meta.url).href
  return loadMermaidModule(moduleUrl)
}

async function renderMermaid(figure: HTMLElement) {
  const preview = figure.querySelector<HTMLElement>('.cf-diagram-preview')
  if (!preview) return
  const revision = (renderRevisions.get(figure) ?? 0) + 1
  renderRevisions.set(figure, revision)
  const isCurrent = () => figure.dataset.cfEnhanced === 'true' && renderRevisions.get(figure) === revision
  const mermaidApi = await resolveMermaid(figure)
  if (!isCurrent()) return
  const surface = resolveThemeColor(figure, '--cf-diagram-surface', '#ffffff')
  const foreground = resolveThemeColor(figure, '--cf-diagram-foreground', '#1d1d1f')
  const accent = resolveThemeColor(figure, '--cf-diagram-accent', '#0071e3')
  const muted = resolveThemeColor(figure, '--cf-diagram-muted', '#6e6e73')
  const line = resolveThemeColor(figure, '--cf-diagram-line', '#d2d2d7')

  const result = await queueMermaidRender(mermaidApi, async () => {
    if (!isCurrent()) return undefined
    mermaidApi.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        background: surface,
        primaryColor: surface,
        primaryTextColor: foreground,
        primaryBorderColor: accent,
        secondaryColor: surface,
        secondaryTextColor: foreground,
        secondaryBorderColor: line,
        tertiaryColor: surface,
        tertiaryTextColor: foreground,
        tertiaryBorderColor: line,
        lineColor: line,
        textColor: foreground,
        noteBkgColor: surface,
        noteTextColor: foreground,
        noteBorderColor: line,
        actorTextColor: foreground,
        actorBkg: surface,
        actorBorder: line,
        signalColor: muted,
        signalTextColor: foreground
      }
    })
    return mermaidApi.render(`cf-mermaid-${++sequence}`, figure.dataset.cfSource ?? '')
  })
  if (!result || !isCurrent()) return
  preview.innerHTML = result.svg
  delete figure.dataset.cfRenderError
}

export function enhance(root: ParentNode = document) {
  const diagrams = enhanceDiagrams(root, 'mermaid', renderMermaid)
  const document = root instanceof Document ? root : root.ownerDocument
  if (!document) return diagrams

  let scheduledFrame: number | undefined
  const observer = new MutationObserver(() => {
    if (scheduledFrame !== undefined) return
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = undefined
      const figures = root.querySelectorAll<HTMLElement>('[data-cf-plugin-diagram="mermaid"]')
      for (const figure of figures) {
        void renderMermaid(figure).catch((error: unknown) => {
          figure.dataset.cfRenderError = 'true'
          console.error('[canofold] Mermaid render failed:', error)
        })
      }
    })
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style']
  })

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    if (scheduledFrame !== undefined) cancelAnimationFrame(scheduledFrame)
    observer.disconnect()
    diagrams()
  }
  return Object.assign(dispose, { ready: diagrams.ready, dispose })
}
