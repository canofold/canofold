import { createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Markdown, type MarkdownLabels, type RenderMarkdownOptions } from '@docfuse/markdown'

declare global {
  interface Window {
    __docfuseBootstrapMarkdown?: () => Promise<void>
    __docfuseEnhanceMarkdown?: (root: ParentNode) => Promise<() => void>
    __docfuseMarkdownDispose?: () => void
    __docfuseMarkdownReady?: Promise<void>
  }
}

export interface PlaygroundClientOptions {
  basePath: string
  markdown: Omit<RenderMarkdownOptions, 'labels'>
}

function parseLabels(playground: HTMLElement): Partial<MarkdownLabels> {
  try {
    return JSON.parse(playground.dataset.docfusePlaygroundLabels ?? '{}') as Partial<MarkdownLabels>
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
          className="df-playground-status df-playground-error"
          role="alert"
          data-docfuse-playground-error=""
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
            <div className="df-playground-status" role="status" aria-live="polite">
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
    const root = anchor.closest<HTMLElement>('[data-df-root="markdown"]') ?? preview
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
    }
  }
}

function mountPlayground(playground: HTMLElement, clientOptions: PlaygroundClientOptions) {
  if (playground.dataset.docfusePlaygroundReady !== undefined) return
  const source = playground.querySelector<HTMLTextAreaElement>('[data-docfuse-playground-source]')
  const preview = playground.querySelector<HTMLElement>('[data-docfuse-playground-preview]')
  if (!source || !preview) return

  const labels = parseLabels(playground)
  const options: RenderMarkdownOptions = {
    ...clientOptions.markdown,
    labels,
    locale: document.documentElement.lang || clientOptions.markdown.locale
  }
  const loadingLabel = `${playground.dataset.docfusePlaygroundPreviewLabel ?? 'Preview'}…`
  let debounceTimer: number | undefined
  let revision = 0
  let activeStage: PreviewStage | undefined
  let staticPreviewActive = true
  const scrolling = setupSynchronizedScrolling(source, preview)

  const discardStage = (stage: PreviewStage) => {
    stage.dispose?.()
    stage.root.unmount()
    stage.element.remove()
  }

  const activate = async (stage: PreviewStage, renderRevision: number) => {
    if (stage.activating) return
    stage.activating = true
    if (revision !== renderRevision) {
      discardStage(stage)
      return
    }

    try {
      stage.dispose = await window.__docfuseEnhanceMarkdown?.(stage.element)
    } catch (error) {
      discardStage(stage)
      console.error('[docfuse] Playground preview enhancement failed:', error)
      return
    }

    if (revision !== renderRevision) {
      discardStage(stage)
      return
    }

    scrolling.replacePreview(() => {
      if (staticPreviewActive) {
        stage.element.remove()
        window.__docfuseMarkdownDispose?.()
        window.__docfuseMarkdownDispose = undefined
        for (const child of [...preview.childNodes]) child.remove()
        staticPreviewActive = false
        stage.element.hidden = false
        preview.append(stage.element)
      } else {
        stage.element.hidden = false
        activeStage?.dispose?.()
        activeStage?.root.unmount()
        activeStage?.element.remove()
      }
      activeStage = stage
    })
  }

  const render = async (renderRevision: number) => {
    await window.__docfuseMarkdownReady
    if (revision !== renderRevision) return
    const element = preview.ownerDocument.createElement('div')
    element.className = 'df-playground-live-preview'
    element.hidden = true
    preview.append(element)
    const stage: PreviewStage = { element, root: createRoot(element), activating: false }
    stage.root.render(
      createElement(LivePreview, {
        source: source.value,
        options,
        basePath: clientOptions.basePath,
        loadingLabel,
        onReady: () => void activate(stage, renderRevision),
        onFailure: (error) => {
          console.error('[docfuse] Playground preview render failed:', error)
          queueMicrotask(() => discardStage(stage))
        }
      })
    )
  }

  const scheduleRender = () => {
    const renderRevision = ++revision
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => void render(renderRevision), 120)
  }

  source.addEventListener('input', scheduleRender)
  source.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end')
    scheduleRender()
  })
  playground.dataset.docfusePlaygroundReady = ''
}

export function mountPlaygrounds(options: PlaygroundClientOptions) {
  document
    .querySelectorAll<HTMLElement>('[data-docfuse-playground]')
    .forEach((playground) => mountPlayground(playground, options))
}
