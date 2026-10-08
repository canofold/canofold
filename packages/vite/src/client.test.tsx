// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoRuntime, fitFrame } from './client'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(async () => {
  await act(async () => window.__canofoldDemoDispose?.())
  delete window.__canofoldDemoDispose
  document.body.innerHTML = ''
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
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(value: Element) {
          observed = value
        }
        disconnect = disconnect
      }
    )
    document.body.innerHTML =
      '<section data-cf-component="demo" data-cf-demo-sandbox="iframe"><h3 class="cf-demo-title">Frame</h3><div data-cf-demo-preview data-cf-demo-id="demo"></div></section>'
    const runtime = createDemoRuntime(new Map(), undefined, 'https://example.test/demo.js')
    await runtime.bootstrapDemos()
    const frame = document.querySelector('iframe')!
    expect(frame.title).toBe('Frame')
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(frame.srcdoc).toContain('https://example.test/demo.js')
    frame.contentDocument!.body.innerHTML = '<div id="root"></div>'
    onLoad?.call(frame, new Event('load'))
    expect(observed).toBe(frame.contentDocument!.getElementById('root'))
    runtime.dispose()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(() => fitFrame(document.createElement('iframe'))()).not.toThrow()
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
