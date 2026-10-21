// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoRuntime, fitFrame } from './client'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(async () => {
  await act(async () => window.__canofoldDemoDispose?.())
  delete window.__canofoldDemoDispose
  delete window.__canofoldReloadDemoFrame
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-cf-theme')
  document.documentElement.removeAttribute('data-cf-theme-appearance')
  document.documentElement.classList.remove('dark')
  history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Demo client', () => {
  it('wraps named demos in setup and renders component failures through the error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    document.body.innerHTML =
      '<div data-cf-demo-preview data-cf-demo-id="demo" data-cf-demo-failed-label="失败"></div>'
    const runtime = createDemoRuntime(
      new Map([
        [
          'demo',
          async () => ({
            Demo: () => {
              throw new Error('render failed')
            }
          })
        ]
      ]),
      ({ children }) => <section>{children}</section>,
      'https://example.test/demo.js'
    )
    await act(async () => runtime.bootstrapDemos())
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('失败')
  })

  it('reports import and missing-export errors without mounting a broken component', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    document.body.innerHTML =
      '<div data-cf-demo-preview data-cf-demo-id="missing" data-cf-demo-failed-label="Import failed"></div><div data-cf-demo-preview></div><button data-cf-demo-source-toggle aria-controls="absent"></button>'
    const runtime = createDemoRuntime(new Map(), undefined, 'https://example.test/demo.js')
    await act(async () => runtime.bootstrapDemos())
    expect(document.querySelector('[data-cf-demo-error]')?.textContent).toBe('Import failed')
    await expect(runtime.mountDemo(document.body, 'missing', 'Failed')).rejects.toThrow('must export')
  })

  it('creates an isolated iframe and observes its loaded content', async () => {
    let onLoad: EventListener | undefined
    vi.spyOn(HTMLIFrameElement.prototype, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'load' && typeof listener === 'function') onLoad = listener
    })
    let observed: Element | undefined
    let appearanceObserved: Node | undefined
    let syncAppearanceFromMutation: () => void = () => {}
    const disconnect = vi.fn()
    const disconnectAppearance = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(value: Element) {
          observed = value
        }
        disconnect = disconnect
      }
    )
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: MutationCallback) {
          syncAppearanceFromMutation = () => callback([], this as unknown as MutationObserver)
        }
        observe(value: Node) {
          appearanceObserved = value
        }
        disconnect = disconnectAppearance
      }
    )
    document.body.innerHTML =
      '<section data-cf-component="demo" data-cf-demo-sandbox="iframe"><h3 class="cf-demo-title">Frame</h3><div data-cf-demo-preview data-cf-demo-id="demo"></div></section>'
    document.documentElement.setAttribute('data-cf-theme', 'neumorphism')
    document.documentElement.setAttribute('data-cf-theme-appearance', 'default')
    const stylesheet = document.createElement('link')
    stylesheet.rel = 'stylesheet'
    stylesheet.href = '/assets/canofold.css'
    document.head.append(stylesheet)
    const runtime = createDemoRuntime(new Map(), undefined, 'https://example.test/demo.js')
    await runtime.bootstrapDemos()
    const frame = document.querySelector('iframe')!
    Object.assign(frame.contentWindow!, { ResizeObserver })
    expect(frame.title).toBe('Frame')
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(frame.srcdoc).not.toContain('<script')
    frame.contentDocument!.body.innerHTML = '<div id="root"></div>'
    onLoad?.call(frame, new Event('load'))
    expect(appearanceObserved).toBe(document.documentElement)
    expect(frame.contentDocument!.documentElement.dataset.cfTheme).toBe('neumorphism')
    expect(frame.contentDocument!.documentElement.dataset.cfThemeAppearance).toBe('default')
    document.documentElement.dataset.cfTheme = 'canofold'
    document.documentElement.dataset.cfThemeAppearance = 'dark'
    document.documentElement.classList.add('dark')
    syncAppearanceFromMutation()
    await vi.waitFor(() => {
      expect(frame.contentDocument!.documentElement.dataset.cfTheme).toBe('canofold')
      expect(frame.contentDocument!.documentElement.dataset.cfThemeAppearance).toBe('dark')
      expect(frame.contentDocument!.documentElement.classList.contains('dark')).toBe(true)
    })
    expect(observed).toBe(frame.contentDocument!.getElementById('root'))
    expect(frame.contentDocument!.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe(
      '/assets/canofold.css'
    )
    const script = frame.contentDocument!.querySelector<HTMLScriptElement>('script[type="module"]')!
    expect(script.src).toBe('https://example.test/demo.js')
    expect(script.textContent).toBe('')
    expect(observed?.getAttribute('data-cf-demo-id')).toBe('demo')
    script.dispatchEvent(new Event('error'))
    expect(frame.contentDocument!.querySelector('[role="alert"]')?.textContent).toBe(
      'This example could not be loaded.'
    )
    const staleReload = frame.contentWindow!.__canofoldReloadDemoFrame!
    const setSrcdoc = vi.spyOn(frame, 'srcdoc', 'set')
    staleReload()
    expect(setSrcdoc).toHaveBeenCalledOnce()
    frame.contentDocument!.body.innerHTML = '<div id="root"></div>'
    onLoad?.call(frame, new Event('load'))
    expect(disconnect).toHaveBeenCalledOnce()
    expect(disconnectAppearance).toHaveBeenCalledOnce()
    expect(frame.contentDocument!.querySelector('script[type="module"]')).not.toBeNull()
    runtime.dispose()
    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(disconnectAppearance).toHaveBeenCalledTimes(2)
    staleReload()
    expect(setSrcdoc).toHaveBeenCalledOnce()
    expect(() => fitFrame(document.createElement('iframe'))()).not.toThrow()
    stylesheet.remove()
  })

  it('clears the preview error state after repairing a failed import', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    document.body.innerHTML = '<div data-cf-demo-preview data-cf-demo-id="demo"></div>'
    const registry = new Map([
      [
        'demo',
        async (): Promise<{ default: () => React.JSX.Element }> => {
          throw new Error('broken import')
        }
      ]
    ])
    const runtime = createDemoRuntime(registry, undefined, '/demo.js')
    await act(async () => runtime.bootstrapDemos())
    const preview = document.querySelector<HTMLElement>('[data-cf-demo-preview]')!
    expect(preview.hasAttribute('data-cf-demo-error')).toBe(true)
    registry.set('demo', async () => ({ default: () => <button>Repaired</button> }))
    await act(async () => runtime.bootstrapDemos())
    expect(preview.querySelector('button')?.textContent).toBe('Repaired')
    expect(preview.hasAttribute('data-cf-demo-error')).toBe(false)
  })

  it('ignores an iframe load that finishes after the demo runtime was disposed', async () => {
    let onLoad: EventListener | undefined
    vi.spyOn(HTMLIFrameElement.prototype, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'load' && typeof listener === 'function') onLoad = listener
    })
    const observe = vi.fn()
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe = observe
        disconnect() {}
      }
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    )
    document.body.innerHTML =
      '<section data-cf-component="demo" data-cf-demo-sandbox="iframe"><div data-cf-demo-preview data-cf-demo-id="demo"></div></section>'
    const runtime = createDemoRuntime(new Map(), undefined, 'https://example.test/demo.js')

    await runtime.bootstrapDemos()
    const frame = document.querySelector('iframe')!
    frame.contentDocument!.body.innerHTML = '<div id="root"></div>'
    runtime.dispose()

    expect(() => onLoad?.call(frame, new Event('load'))).not.toThrow()
    expect(observe).not.toHaveBeenCalled()
    expect(frame.contentDocument!.querySelector('script')).toBeNull()
  })

  it('ignores an iframe load when its site document is no longer the active document', async () => {
    let onLoad: EventListener | undefined
    vi.spyOn(HTMLIFrameElement.prototype, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'load' && typeof listener === 'function') onLoad = listener
    })
    const observe = vi.fn()
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe = observe
        disconnect() {}
      }
    )
    document.body.innerHTML =
      '<section data-cf-component="demo" data-cf-demo-sandbox="iframe"><div data-cf-demo-preview data-cf-demo-id="demo"></div></section>'
    const runtime = createDemoRuntime(new Map(), undefined, 'https://example.test/demo.js')

    await runtime.bootstrapDemos()
    const frame = document.querySelector('iframe')!
    frame.contentDocument!.body.innerHTML = '<div id="root"></div>'
    vi.spyOn(document, 'defaultView', 'get').mockReturnValue({
      document: document.implementation.createHTMLDocument('replacement')
    } as unknown as Window & typeof globalThis)

    expect(() => onLoad?.call(frame, new Event('load'))).not.toThrow()
    expect(observe).not.toHaveBeenCalled()
    expect(frame.contentDocument!.querySelector('script')).toBeNull()
  })
  it('toggles highlighted source without remounting its preview', async () => {
    document.body.innerHTML =
      '<button data-cf-demo-source-toggle aria-controls="source" aria-expanded="false" data-cf-demo-show-label="Show" data-cf-demo-hide-label="Hide"><span data-cf-demo-tooltip></span></button><div id="source" hidden>code</div><div data-cf-demo-preview data-cf-demo-id="demo"></div>'
    const runtime = createDemoRuntime(
      new Map([['demo', async () => ({ default: () => <button>Demo</button> })]]),
      undefined,
      'https://example.test/demo.js'
    )
    await act(async () => runtime.bootstrapDemos())
    const preview = document.querySelector('[data-cf-demo-preview]')?.firstChild
    const button = document.querySelector<HTMLButtonElement>('[data-cf-demo-source-toggle]')!
    button.click()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Hide')
    expect(document.getElementById('source')?.hidden).toBe(false)
    button.click()
    expect(document.getElementById('source')?.hidden).toBe(true)
    expect(document.querySelector('[data-cf-demo-preview]')?.firstChild).toBe(preview)
  })

  it('does not mount a pending demo after disposal', async () => {
    document.body.innerHTML = '<div data-cf-demo-preview data-cf-demo-id="demo"></div>'
    let resolve!: (module: { default: () => React.JSX.Element }) => void
    const module = new Promise<{ default: () => React.JSX.Element }>((done) => {
      resolve = done
    })
    const runtime = createDemoRuntime(
      new Map([['demo', () => module]]),
      undefined,
      'https://example.test/demo.js'
    )
    await act(async () => {
      const pending = runtime.bootstrapDemos()
      runtime.dispose()
      resolve({ default: () => <button>Late</button> })
      await pending
    })
    expect(document.querySelector('button')).toBeNull()
  })

  it('invalidates only pending iframe imports, leaving mounted examples to Vite HMR', async () => {
    document.body.innerHTML = '<div data-cf-demo-preview data-cf-demo-id="demo"></div>'
    let resolve!: (module: { default: () => React.JSX.Element }) => void
    const module = new Promise<{ default: () => React.JSX.Element }>((done) => {
      resolve = done
    })
    const reload = vi.fn()
    window.__canofoldReloadDemoFrame = reload
    const runtime = createDemoRuntime(new Map([['demo', () => module]]), undefined, '/demo.js')
    runtime.reloadPendingFrame()
    expect(reload).not.toHaveBeenCalled()
    await act(async () => {
      const pending = runtime.bootstrapDemos()
      runtime.reloadPendingFrame()
      expect(reload).toHaveBeenCalledOnce()
      resolve({ default: () => <button>Ready</button> })
      await pending
    })
    runtime.reloadPendingFrame()
    expect(reload).toHaveBeenCalledOnce()
    expect(document.querySelector('button')?.textContent).toBe('Ready')
  })

  it('opens a standalone demo through the same registry', async () => {
    history.replaceState(null, '', '/?canofold-demo=demo')
    const runtime = createDemoRuntime(
      new Map([['demo', async () => ({ default: () => <button>Standalone</button> })]]),
      undefined,
      'https://example.test/demo.js'
    )
    await act(async () => runtime.bootstrapDemos())
    expect(document.querySelector('main')?.textContent).toBe('Standalone')
    expect(document.documentElement.hasAttribute('data-cf-demo-standalone')).toBe(true)
  })

  it('shows an accessible localized error when a standalone module fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    history.replaceState(null, '', '/?canofold-demo=broken')
    document.body.innerHTML =
      '<div data-cf-demo-preview data-cf-demo-id="broken" data-cf-demo-failed-label="示例加载失败"></div>'
    const runtime = createDemoRuntime(
      new Map([
        [
          'broken',
          async () => {
            throw new Error('chunk 404')
          }
        ]
      ]),
      undefined,
      'https://example.test/demo.js'
    )
    await expect(runtime.bootstrapDemos()).resolves.toBeUndefined()
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('示例加载失败')
  })

  it('does not render a late standalone import failure after disposal', async () => {
    history.replaceState(null, '', '/?canofold-demo=late')
    let reject!: (error: Error) => void
    const module = new Promise<never>((_, fail) => {
      reject = fail
    })
    const runtime = createDemoRuntime(
      new Map([['late', () => module]]),
      undefined,
      'https://example.test/demo.js'
    )
    const pending = runtime.bootstrapDemos()
    runtime.dispose()
    reject(new Error('late failure'))
    await expect(pending).resolves.toBeUndefined()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('shrinks the iframe to its content and disconnects its observer', () => {
    let update = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          update = callback
        }
        observe() {}
        disconnect = disconnect
      }
    )
    const frame = document.createElement('iframe')
    document.body.append(frame)
    Object.assign(frame.contentWindow!, { ResizeObserver })
    const doc = frame.contentDocument!
    doc.body.innerHTML = '<div id="root"></div>'
    doc.body.style.padding = '24px'
    let height = 30
    vi.spyOn(doc.getElementById('root')!, 'getBoundingClientRect').mockImplementation(
      () => ({ height }) as DOMRect
    )
    const cleanup = fitFrame(frame)
    expect(frame.style.height).toBe('192px')
    height = 600
    update()
    expect(frame.style.height).toBe('648px')
    height = 30
    update()
    expect(frame.style.height).toBe('192px')
    cleanup()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
