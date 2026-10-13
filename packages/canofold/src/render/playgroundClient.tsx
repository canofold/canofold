import { createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Markdown, type MarkdownLabels, type RenderMarkdownOptions } from '@canofold/markdown'

declare global {
  interface Window {
    __canofoldBootstrapMarkdown?: () => Promise<void>
    __canofoldEnhanceMarkdown?: (root: ParentNode) => Promise<() => void>
    __canofoldMarkdownDispose?: () => void
    __canofoldMarkdownReady?: Promise<void>
  }
}

export interface PlaygroundClientOptions {
  basePath: string
  markdown: Omit<RenderMarkdownOptions, 'labels'>
}

function parseLabels(playground: HTMLElement): Partial<MarkdownLabels> {
  try {
    return JSON.parse(playground.dataset.canofoldPlaygroundLabels ?? '{}') as Partial<MarkdownLabels>
  } catch {
    return {}
  }
}

function createUrlTransform(basePath: string) {
  const base = basePath === '/' ? '' : basePath.replace(/\/$/, '')
  return (value: string) =>
    !base ||
    value === base ||
    value.startsWith(`${base}/`) ||
    !value.startsWith('/') ||
    value.startsWith('//')
      ? value
      : `${base}${value}`
}

function LivePreview({
  source,
  options,
  basePath,
  loadingLabel,
  onReady,
  onFailure
}: {
  source: string
  options: RenderMarkdownOptions
  basePath: string
  loadingLabel: string
  onReady: () => void
  onFailure: (error: unknown) => void
}) {
  const [error, setError] = useState<unknown>()
  useEffect(() => setError(undefined), [source])

  return (
    <>
      {error ? (
        <div
          className="cf-playground-status cf-playground-error"
          role="alert"
          data-canofold-playground-error=""
        >
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}
      <Markdown
        as="article"
        source={source}
        options={options}
        urlTransform={createUrlTransform(basePath)}
        onError={(nextError) => {
          setError(nextError)
          onFailure(nextError)
        }}
        onReady={onReady}
        retainPrevious
        fallback={
          error ? null : (
            <div className="cf-playground-status" role="status" aria-live="polite">
              {loadingLabel}
            </div>
          )
        }
      />
    </>
  )
}

interface PreviewStage {
  element: HTMLDivElement
  root: Root
  dispose?: () => void
  activating: boolean
}

function synchronizeScroll(source: HTMLElement, target: HTMLElement) {
  const sourceMax = Math.max(0, source.scrollHeight - source.clientHeight)
  const targetMax = Math.max(0, target.scrollHeight - target.clientHeight)
  if (source.clientHeight <= 0 || target.clientHeight <= 0) return
  const nextScrollTop = sourceMax > 0 ? (source.scrollTop / sourceMax) * targetMax : 0
  if (Math.abs(target.scrollTop - nextScrollTop) > 0.5) target.scrollTop = nextScrollTop
}

function setupSynchronizedScrolling(source: HTMLElement, preview: HTMLElement) {
  const view = source.ownerDocument.defaultView
  let paused = false
  let ignoredTarget: HTMLElement | undefined
  let unlockFrame: number | undefined
  let resumeFrame: number | undefined

  const cancelFrame = (frame: number | undefined) => {
    if (frame !== undefined) view?.cancelAnimationFrame(frame)
  }
  const pause = () => {
    paused = true
    ignoredTarget = undefined
    cancelFrame(unlockFrame)
    cancelFrame(resumeFrame)
    unlockFrame = undefined
    resumeFrame = undefined
  }
  const resumeAfterPaint = () => {
    if (!view) {
      paused = false
      return
    }
    let frames = 2
    const resume = () => {
      frames -= 1
      if (frames > 0) {
        resumeFrame = view.requestAnimationFrame(resume)
        return
      }
      resumeFrame = undefined
      paused = false
    }
    resumeFrame = view.requestAnimationFrame(resume)
  }
  const sync = (from: HTMLElement, to: HTMLElement) => {
    if (paused || ignoredTarget === from) return
    ignoredTarget = to
    synchronizeScroll(from, to)
    if (!view) {
      ignoredTarget = undefined
      return
    }
    cancelFrame(unlockFrame)
    unlockFrame = view.requestAnimationFrame(() => {
      unlockFrame = undefined
      ignoredTarget = undefined
    })
  }
  const onSourceScroll = () => sync(source, preview)
  const onPreviewScroll = () => sync(preview, source)
  const onPreviewAnchorClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return
    const origin =
      event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : undefined
    const anchor = origin?.closest<HTMLAnchorElement>('a[href^="#"]')
    const hash = anchor?.getAttribute('href')
    if (!anchor || !hash || hash === '#') return

    let id: string
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      return
    }
    const root = anchor.closest<HTMLElement>('[data-cf-root="markdown"]') ?? preview
    const target = [...root.querySelectorAll<HTMLElement>('[id]')].find((candidate) => candidate.id === id)
    if (!target) return

    event.preventDefault()
    pause()
    const nextScrollTop =
      preview.scrollTop + target.getBoundingClientRect().top - preview.getBoundingClientRect().top
    preview.scrollTop = Math.max(0, nextScrollTop)
    try {
      view?.history.pushState(null, '', hash)
    } catch {
      // A restricted host can reject history updates; scrolling should still work.
    }
    resumeAfterPaint()
  }

  source.addEventListener('scroll', onSourceScroll)
  preview.addEventListener('scroll', onPreviewScroll)
  preview.addEventListener('click', onPreviewAnchorClick)

  return {
    replacePreview(update: () => void) {
      const sourceMax = Math.max(0, source.scrollHeight - source.clientHeight)
      const progress = sourceMax > 0 ? source.scrollTop / sourceMax : 0
      pause()
      update()
      const previewMax = Math.max(0, preview.scrollHeight - preview.clientHeight)
      if (source.clientHeight > 0 && preview.clientHeight > 0) preview.scrollTop = progress * previewMax
      resumeAfterPaint()
    },
    dispose() {
      pause()
      source.removeEventListener('scroll', onSourceScroll)
      preview.removeEventListener('scroll', onPreviewScroll)
      preview.removeEventListener('click', onPreviewAnchorClick)
    }
  }
}

function mountPlayground(playground: HTMLElement, clientOptions: PlaygroundClientOptions) {
  if (playground.dataset.canofoldPlaygroundReady !== undefined) return
  const source = playground.querySelector<HTMLTextAreaElement>('[data-canofold-playground-source]')
  const preview = playground.querySelector<HTMLElement>('[data-canofold-playground-preview]')
  if (!source || !preview) return
  const view = source.ownerDocument.defaultView
  if (!view) return

  const labels = parseLabels(playground)
  const options: RenderMarkdownOptions = {
    ...clientOptions.markdown,
    labels,
    locale: source.ownerDocument.documentElement.lang || clientOptions.markdown.locale
  }
  const loadingLabel = `${playground.dataset.canofoldPlaygroundPreviewLabel ?? 'Preview'}…`
  let debounceTimer: number | undefined
  let revision = 0
  let activeStage: PreviewStage | undefined
  let staticPreviewActive = true
  let disposed = false
  const stages = new Set<PreviewStage>()
  const scrolling = setupSynchronizedScrolling(source, preview)

  const discardStage = (stage: PreviewStage) => {
    if (!stages.delete(stage)) return
    if (activeStage === stage) activeStage = undefined
    stage.dispose?.()
    stage.dispose = undefined
    stage.root.unmount()
    stage.element.remove()
  }

  const activate = async (stage: PreviewStage, renderRevision: number) => {
    if (stage.activating || disposed || !stages.has(stage)) return
    stage.activating = true
    if (revision !== renderRevision) {
      discardStage(stage)
      return
    }

    let dispose: (() => void) | undefined
    try {
      dispose = await view.__canofoldEnhanceMarkdown?.(stage.element)
    } catch (error) {
      discardStage(stage)
      if (!disposed) console.error('[canofold] Playground preview enhancement failed:', error)
      return
    }

    if (disposed || revision !== renderRevision || !stages.has(stage)) {
      dispose?.()
      discardStage(stage)
      return
    }
    stage.dispose = dispose

    scrolling.replacePreview(() => {
      if (staticPreviewActive) {
        stage.element.remove()
        view.__canofoldMarkdownDispose?.()
        view.__canofoldMarkdownDispose = undefined
        for (const child of [...preview.childNodes]) child.remove()
        staticPreviewActive = false
        stage.element.hidden = false
        preview.append(stage.element)
      } else {
        stage.element.hidden = false
        if (activeStage) discardStage(activeStage)
      }
      activeStage = stage
    })
  }

  const render = async (renderRevision: number) => {
    await view.__canofoldMarkdownReady
    if (disposed || revision !== renderRevision) return
    const element = preview.ownerDocument.createElement('div')
    element.className = 'cf-playground-live-preview'
    element.hidden = true
    preview.append(element)
    const stage: PreviewStage = { element, root: createRoot(element), activating: false }
    stages.add(stage)
    stage.root.render(
      createElement(LivePreview, {
        source: source.value,
        options,
        basePath: clientOptions.basePath,
        loadingLabel,
        onReady: () => void activate(stage, renderRevision),
        onFailure: (error) => {
          if (!disposed) console.error('[canofold] Playground preview render failed:', error)
          view.queueMicrotask(() => discardStage(stage))
        }
      })
    )
  }

  const scheduleRender = () => {
    if (disposed) return
    const renderRevision = ++revision
    if (debounceTimer !== undefined) view.clearTimeout(debounceTimer)
    debounceTimer = view.setTimeout(() => {
      debounceTimer = undefined
      void render(renderRevision)
    }, 120)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end')
    scheduleRender()
  }
  source.addEventListener('input', scheduleRender)
  source.addEventListener('keydown', onKeyDown)
  playground.dataset.canofoldPlaygroundReady = ''

  return () => {
    if (disposed) return
    disposed = true
    revision += 1
    if (debounceTimer !== undefined) view.clearTimeout(debounceTimer)
    debounceTimer = undefined
    source.removeEventListener('input', scheduleRender)
    source.removeEventListener('keydown', onKeyDown)
    scrolling.dispose()
    for (const stage of [...stages]) discardStage(stage)
    delete playground.dataset.canofoldPlaygroundReady
  }
}

export function mountPlaygrounds(options: PlaygroundClientOptions) {
  const disposers = [...document.querySelectorAll<HTMLElement>('[data-canofold-playground]')]
    .map((playground) => mountPlayground(playground, options))
    .filter((dispose): dispose is () => void => dispose !== undefined)
  if (disposers.length === 0) return
  return () => disposers.forEach((dispose) => dispose())
}
