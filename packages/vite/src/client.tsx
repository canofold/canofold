import React, { type ComponentType, type PropsWithChildren } from 'react'
import { createRoot, type Root } from 'react-dom/client'

type DemoModule = { default?: ComponentType; Demo?: ComponentType }
type DemoRegistry = ReadonlyMap<string, () => Promise<DemoModule>>

declare global {
  interface Window {
    __canofoldDemoDispose?: () => void
    __canofoldBootstrapDemos?: () => Promise<void>
  }
}

class DemoBoundary extends React.Component<PropsWithChildren<{ message: string }>, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="cf-demo-error" role="alert">
        {this.props.message}
      </div>
    ) : (
      this.props.children
    )
  }
}

/** Observe content, not the iframe viewport, so the frame can shrink as well as grow. */
export function fitFrame(frame: HTMLIFrameElement) {
  const frameDocument = frame.contentDocument
  const content = frameDocument?.getElementById('root')
  if (!frameDocument || !content) return () => undefined
  const update = () => {
    const style = frame.contentWindow?.getComputedStyle(frameDocument.body)
    const padding =
      Number.parseFloat(style?.paddingTop || '0') + Number.parseFloat(style?.paddingBottom || '0')
    frame.style.height = `${Math.max(192, Math.ceil(content.getBoundingClientRect().height + padding))}px`
  }
  update()
  const observer = new ResizeObserver(update)
  observer.observe(content)
  return () => observer.disconnect()
}

export function createDemoRuntime(
  registry: DemoRegistry,
  Setup: ComponentType<PropsWithChildren> | undefined,
  moduleUrl: string
) {
  const roots = new Set<Root>()
  const frameCleanups = new Set<() => void>()
  let events = new AbortController()
  let generation = 0

  function dispose() {
    generation += 1
    events.abort()
    frameCleanups.forEach((cleanup) => cleanup())
    frameCleanups.clear()
    roots.forEach((root) => root.unmount())
    roots.clear()
    document.documentElement.removeAttribute('data-cf-demo-standalone')
  }

  async function mountDemo(element: HTMLElement, id: string, failedLabel: string) {
    const revision = generation
    const load = registry.get(id)
    const module = load && (await load())
    if (revision !== generation) return
    const Demo = module?.default ?? module?.Demo
    if (!Demo) throw new Error(`Demo module ${id} must export a default React component.`)
    const content = Setup ? (
      <Setup>
        <Demo />
      </Setup>
    ) : (
      <Demo />
    )
    const root = createRoot(element)
    roots.add(root)
    root.render(<DemoBoundary message={failedLabel}>{content}</DemoBoundary>)
    return root
  }

  async function bootstrapDemos() {
    window.__canofoldDemoDispose?.()
    events = new AbortController()
    const { signal } = events
    window.__canofoldDemoDispose = dispose
    const revision = generation
    const standaloneId = new URL(location.href).searchParams.get('canofold-demo')
    if (standaloneId && registry.has(standaloneId)) {
      const preview = [...document.querySelectorAll<HTMLElement>('[data-cf-demo-preview]')].find(
        (element) => element.dataset.cfDemoId === standaloneId
      )
      const failed = preview?.dataset.cfDemoFailedLabel || 'This example could not be loaded.'
      const root = document.createElement('main')
      root.className = 'cf-demo-standalone'
      root.dataset.cfDemoId = standaloneId
      document.documentElement.setAttribute('data-cf-demo-standalone', '')
      document.body.replaceChildren(root)
      try {
        await mountDemo(root, standaloneId, failed)
      } catch (error) {
        if (revision !== generation) return
        console.error('[Canofold demo]', error)
        root.setAttribute('role', 'alert')
        root.textContent = failed
        root.dataset.cfDemoError = ''
      }
      return
    }
    document.querySelectorAll<HTMLButtonElement>('[data-cf-demo-source-toggle]').forEach((button) => {
      const source = document.getElementById(button.getAttribute('aria-controls') || '')
      if (!source) return
      const setExpanded = (expanded: boolean) => {
        const label =
          button.getAttribute(expanded ? 'data-cf-demo-hide-label' : 'data-cf-demo-show-label') || ''
        button.setAttribute('aria-expanded', String(expanded))
        button.setAttribute('aria-label', label)
        source.hidden = !expanded
        const tooltip = button.querySelector('[data-cf-demo-tooltip]')
        if (tooltip) tooltip.textContent = label
      }
      setExpanded(button.getAttribute('aria-expanded') === 'true')
      button.addEventListener('click', () => setExpanded(button.getAttribute('aria-expanded') !== 'true'), {
        signal
      })
    })
    await Promise.all(
      [...document.querySelectorAll<HTMLElement>('[data-cf-demo-preview]')].map(async (preview) => {
        const id = preview.dataset.cfDemoId
        if (!id) return
        const failed = preview.dataset.cfDemoFailedLabel || 'This example could not be loaded.'
        preview.textContent = preview.dataset.cfDemoLoadingLabel || 'Loading example…'
        try {
          const card = preview.closest<HTMLElement>('[data-cf-component="demo"]')
          if (card?.dataset.cfDemoSandbox === 'iframe') {
            const frame = document.createElement('iframe')
            frame.className = 'cf-demo-frame'
            frame.title = card.querySelector('.cf-demo-title')?.textContent || 'Component example'
            frame.loading = 'lazy'
            frame.referrerPolicy = 'no-referrer'
            frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
            frame.addEventListener(
              'load',
              () => {
                const frameDocument = frame.contentDocument
                const root = frameDocument?.getElementById('root')
                if (!frameDocument || !root) return
                root.dataset.cfDemoPreview = ''
                root.dataset.cfDemoId = id
                root.dataset.cfDemoFailedLabel = failed
                document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
                  frameDocument.head.append(frameDocument.importNode(link, true))
                })
                const script = frameDocument.createElement('script')
                script.type = 'module'
                script.src = moduleUrl
                script.addEventListener('error', () => {
                  root.setAttribute('role', 'alert')
                  root.textContent = failed
                  root.dataset.cfDemoError = ''
                })
                frameDocument.body.append(script)
                frameCleanups.add(fitFrame(frame))
              },
              { once: true, signal }
            )
            frame.srcdoc =
              '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}body{display:grid;place-items:center;padding:24px;box-sizing:border-box;font-family:system-ui,sans-serif}#root{min-width:0;max-width:100%}</style></head><body><div id="root"></div></body></html>'
            preview.replaceChildren(frame)
          } else {
            preview.textContent = ''
            await mountDemo(preview, id, failed)
          }
        } catch (error) {
          if (revision !== generation) return
          console.error('[Canofold demo]', error)
          preview.textContent = failed
          preview.dataset.cfDemoError = ''
        }
      })
    )
  }

  return { mountDemo, bootstrapDemos, dispose }
}
