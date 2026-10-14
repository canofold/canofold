const ICONS = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  source:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 8-4 4 4 4M18 8l4 4-4 4M14.5 4l-5 16"/></svg>',
  expand:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  'zoom-out': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  'zoom-reset':
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  'zoom-in': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
}

const DIAGRAM_SCALE_MIN = 0.5
const DIAGRAM_SCALE_MAX = 2
const DIAGRAM_SCALE_STEP = 0.25

export interface DiagramRenderRequest {
  kind: string
  language: string
  diagramType: string
  source: string
  signal: AbortSignal
}

export interface DiagramRenderResult {
  svg: string
}

export type DiagramRenderer = (
  request: DiagramRenderRequest
) => DiagramRenderResult | Promise<DiagramRenderResult>

export interface DiagramClientOptions {
  renderer?: DiagramRenderer
}

type DiagramRenderCleanup = () => void
type DiagramRender = (
  figure: HTMLElement,
  signal: AbortSignal
) => void | DiagramRenderCleanup | Promise<void | DiagramRenderCleanup>

async function copyText(value: string) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Continue to the DOM fallback when permission or context blocks Clipboard API access.
    }
  }
  if (typeof document.execCommand !== 'function') return false
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

function setupActions(figure: HTMLElement) {
  const controller = new AbortController()
  const copyTimers = new Map<HTMLButtonElement, number>()
  const dialogs = new Set<HTMLDialogElement>()
  const source = figure.dataset.cfSource ?? ''
  const preview = figure.querySelector<HTMLElement>('.cf-diagram-preview')
  const sourcePanel = figure.querySelector<HTMLElement>('.cf-diagram-source')
  const zoomControls = figure.querySelector<HTMLElement>('.cf-diagram-zoom-controls')
  const buttons = figure.querySelectorAll<HTMLButtonElement>('[data-cf-diagram-action]')
  const previewHidden = preview?.hidden
  const sourcePanelHidden = sourcePanel?.hidden
  const zoomControlsHidden = zoomControls?.hidden
  const previewZoomWidth = preview?.style.getPropertyValue('--cf-diagram-zoom-width') ?? ''
  const previewZoomMaxWidth = preview?.style.getPropertyValue('--cf-diagram-zoom-max-width') ?? ''
  const previewScale = preview?.getAttribute('data-cf-scale')
  let scale = 1
  const buttonStates = [...buttons].map((button) => ({
    button,
    innerHTML: button.innerHTML,
    ariaLabel: button.getAttribute('aria-label'),
    copied: button.getAttribute('data-copied'),
    actionError: button.getAttribute('data-cf-action-error'),
    disabled: button.disabled
  }))
  const updateScale = () => {
    if (!preview) return
    const media = preview.querySelector<HTMLImageElement | SVGSVGElement>('img, svg')
    const intrinsicWidth =
      media instanceof HTMLImageElement
        ? media.naturalWidth
        : media?.viewBox.baseVal.width || media?.width.baseVal.value || 0
    if (intrinsicWidth > 0 && preview.clientWidth > 0) {
      const width = `${Math.min(intrinsicWidth, preview.clientWidth) * scale}px`
      if (preview.style.getPropertyValue('--cf-diagram-zoom-width') !== width) {
        preview.style.setProperty('--cf-diagram-zoom-width', width)
        preview.style.setProperty('--cf-diagram-zoom-max-width', 'none')
      }
    }
    preview.dataset.cfScale = String(scale)
    for (const button of buttons) {
      const action = button.dataset.cfDiagramAction
      if (action === 'zoom-out') button.disabled = scale <= DIAGRAM_SCALE_MIN
      if (action === 'zoom-in') button.disabled = scale >= DIAGRAM_SCALE_MAX
      if (action === 'zoom-reset') button.disabled = scale === 1
    }
  }
  const resize = zoomControls && preview ? new ResizeObserver(updateScale) : undefined
  if (zoomControls && preview) {
    preview.addEventListener('load', updateScale, { capture: true, signal: controller.signal })
    resize!.observe(preview)
    updateScale()
  }
  for (const button of buttons) {
    const action = button.dataset.cfDiagramAction as keyof typeof ICONS
    button.innerHTML = ICONS[action] ?? ''
    button.addEventListener(
      'click',
      async () => {
        try {
          if (action === 'copy') {
            if (!(await copyText(source))) throw new Error('Copy command failed')
            button.innerHTML = ICONS.check
            button.dataset.copied = 'true'
            const activeTimer = copyTimers.get(button)
            if (activeTimer !== undefined) window.clearTimeout(activeTimer)
            const timer = window.setTimeout(() => {
              if (copyTimers.get(button) !== timer) return
              copyTimers.delete(button)
              button.innerHTML = ICONS.copy
              delete button.dataset.copied
            }, 1500)
            copyTimers.set(button, timer)
          } else if (action === 'source' && preview && sourcePanel) {
            const showingSource = !sourcePanel.hidden
            sourcePanel.hidden = showingSource
            preview.hidden = !showingSource
            if (zoomControls) zoomControls.hidden = !showingSource
            button.setAttribute(
              'aria-label',
              showingSource
                ? (buttonStates.find((state) => state.button === button)?.ariaLabel ?? 'Show source')
                : (button.dataset.cfDiagramPreviewLabel ?? 'Show preview')
            )
          } else if (action === 'expand' && preview) {
            const dialog = document.createElement('dialog')
            dialogs.add(dialog)
            dialog.className = 'cf-diagram-dialog'
            const close = document.createElement('button')
            close.type = 'button'
            close.className = 'cf-diagram-dialog-close'
            close.setAttribute('aria-label', button.dataset.cfDiagramCloseLabel ?? 'Close expanded diagram')
            close.textContent = '×'
            close.addEventListener('click', () => dialog.close(), { signal: controller.signal })
            const expandedPreview = preview.cloneNode(true) as HTMLElement
            expandedPreview.style.removeProperty('--cf-diagram-zoom-width')
            expandedPreview.style.removeProperty('--cf-diagram-zoom-max-width')
            delete expandedPreview.dataset.cfScale
            dialog.append(close, expandedPreview)
            dialog.addEventListener(
              'close',
              () => {
                dialogs.delete(dialog)
                dialog.remove()
              },
              { signal: controller.signal }
            )
            document.body.append(dialog)
            dialog.showModal()
          } else if (action === 'zoom-out') {
            scale = Math.max(DIAGRAM_SCALE_MIN, scale - DIAGRAM_SCALE_STEP)
            updateScale()
          } else if (action === 'zoom-reset') {
            scale = 1
            updateScale()
          } else if (action === 'zoom-in') {
            scale = Math.min(DIAGRAM_SCALE_MAX, scale + DIAGRAM_SCALE_STEP)
            updateScale()
          }
        } catch (error) {
          button.dataset.cfActionError = 'true'
          console.error('[canofold] Diagram action failed:', error)
        }
      },
      { signal: controller.signal }
    )
  }
  return () => {
    controller.abort()
    resize?.disconnect()
    copyTimers.forEach((timer) => window.clearTimeout(timer))
    dialogs.forEach((dialog) => dialog.remove())
    copyTimers.clear()
    dialogs.clear()
    if (preview && previewHidden !== undefined) preview.hidden = previewHidden
    if (sourcePanel && sourcePanelHidden !== undefined) sourcePanel.hidden = sourcePanelHidden
    if (zoomControls && zoomControlsHidden !== undefined) zoomControls.hidden = zoomControlsHidden
    if (preview) {
      if (previewZoomWidth) preview.style.setProperty('--cf-diagram-zoom-width', previewZoomWidth)
      else preview.style.removeProperty('--cf-diagram-zoom-width')
      if (previewZoomMaxWidth) preview.style.setProperty('--cf-diagram-zoom-max-width', previewZoomMaxWidth)
      else preview.style.removeProperty('--cf-diagram-zoom-max-width')
      if (previewScale == null) preview.removeAttribute('data-cf-scale')
      else preview.setAttribute('data-cf-scale', previewScale)
    }
    buttonStates.forEach(({ button, innerHTML, ariaLabel, copied, actionError, disabled }) => {
      button.innerHTML = innerHTML
      button.disabled = disabled
      if (ariaLabel === null) button.removeAttribute('aria-label')
      else button.setAttribute('aria-label', ariaLabel)
      if (copied === null) button.removeAttribute('data-copied')
      else button.setAttribute('data-copied', copied)
      if (actionError === null) button.removeAttribute('data-cf-action-error')
      else button.setAttribute('data-cf-action-error', actionError)
    })
  }
}

export function enhanceDiagrams(root: ParentNode, kind: string, render?: DiagramRender) {
  let active = true
  let disposed = false
  const figures = Array.from(root.querySelectorAll<HTMLElement>(`[data-cf-plugin-diagram="${kind}"]`))
  const actionFigures = figures.filter((figure) => figure.dataset.cfEnhanced !== 'true')
  const renderFigures = render ? figures.filter((figure) => figure.dataset.cfRenderEnhanced !== 'true') : []
  const renderStates = renderFigures.map((figure) => {
    const placeholder = figure.querySelector<HTMLElement>('.cf-diagram-placeholder')
    return {
      figure,
      renderError: figure.getAttribute('data-cf-render-error'),
      rendering: figure.getAttribute('data-cf-rendering'),
      placeholder,
      placeholderText: placeholder?.textContent ?? ''
    }
  })
  const cleanups: Array<() => void> = []
  const renders: Promise<void>[] = []
  for (const figure of actionFigures) {
    figure.dataset.cfEnhanced = 'true'
    cleanups.push(setupActions(figure))
  }
  if (render) {
    for (const figure of renderFigures) {
      figure.dataset.cfRenderEnhanced = 'true'
      const controller = new AbortController()
      let renderCleanup: DiagramRenderCleanup | undefined
      cleanups.push(() => {
        controller.abort()
        renderCleanup?.()
      })
      figure.dataset.cfRendering = 'true'
      renders.push(
        Promise.resolve(render(figure, controller.signal))
          .then((cleanup) => {
            if (typeof cleanup !== 'function') return
            if (!active || controller.signal.aborted) cleanup()
            else renderCleanup = cleanup
          })
          .then(() => {
            if (!active || controller.signal.aborted) return
            delete figure.dataset.cfRenderError
          })
          .catch((error: unknown) => {
            if (!active || controller.signal.aborted) return
            figure.dataset.cfRenderError = 'true'
            const placeholder = figure.querySelector<HTMLElement>('.cf-diagram-placeholder')
            if (placeholder) {
              placeholder.textContent =
                placeholder.dataset.cfRenderErrorLabel ?? 'Diagram preview could not be rendered.'
            }
            console.error(`[canofold] ${kind} render failed:`, error)
          })
          .finally(() => {
            if (active && !controller.signal.aborted) delete figure.dataset.cfRendering
          })
      )
    }
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    active = false
    cleanups.reverse().forEach((cleanup) => cleanup())
    actionFigures.forEach((figure) => delete figure.dataset.cfEnhanced)
    renderStates.forEach(({ figure, renderError, rendering, placeholder, placeholderText }) => {
      delete figure.dataset.cfRenderEnhanced
      if (renderError === null) figure.removeAttribute('data-cf-render-error')
      else figure.setAttribute('data-cf-render-error', renderError)
      if (rendering === null) figure.removeAttribute('data-cf-rendering')
      else figure.setAttribute('data-cf-rendering', rendering)
      if (placeholder) placeholder.textContent = placeholderText
    })
  }
  return Object.assign(dispose, {
    ready: Promise.all(renders).then(() => undefined),
    dispose
  })
}

export function renderWithClientRenderer(kind: string, renderer: DiagramRenderer): DiagramRender {
  return async (figure, signal) => {
    const preview = figure.querySelector<HTMLElement>('.cf-diagram-preview')
    if (!preview) return

    const result = await renderer({
      kind,
      language: figure.dataset.cfDiagramLanguage ?? kind,
      diagramType: figure.dataset.cfDiagramType ?? kind,
      source: figure.dataset.cfSource ?? '',
      signal
    })
    if (signal.aborted) return
    if (!result || typeof result.svg !== 'string' || result.svg.trim() === '') {
      throw new TypeError('Diagram renderer must return a non-empty SVG string.')
    }

    const objectUrl = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }))
    const image = figure.ownerDocument.createElement('img')
    image.className = 'cf-diagram-img'
    image.src = objectUrl
    image.alt = figure.dataset.cfImageAlt ?? ''
    const originalChildren = Array.from(preview.childNodes)
    preview.replaceChildren(image)

    let cleaned = false
    return () => {
      if (cleaned) return
      cleaned = true
      preview.replaceChildren(...originalChildren)
      URL.revokeObjectURL(objectUrl)
    }
  }
}
