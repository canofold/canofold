// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapOutline, bootstrapShell } from './shell'

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click()
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const key = (value: string, shiftKey = false) =>
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })
  )

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('scrollBy', vi.fn())
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => {
  window.__canofoldShellDispose?.()
  window.__canofoldOutlineDispose?.()
  delete window.__canofoldBootstrapMarkdown
  delete window.__canofoldBootstrapDemos
  delete window.__canofoldLoadPageModule
  delete window.__canofoldApplyPageDocument
  document.body.innerHTML = ''
  document.documentElement.className = ''
  document.documentElement.removeAttribute('dir')
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('typed browser shell', () => {
  it('manages theme, mobile sidebar and outside-menu dismissal', () => {
    document.body.innerHTML =
      '<header class="cf-header-home"></header><button data-canofold-theme-toggle></button><button data-canofold-sidebar-open data-canofold-sidebar-open-label="Open" data-canofold-sidebar-close-label="Close"></button><aside data-canofold-sidebar></aside><div data-canofold-sidebar-backdrop hidden></div><details data-canofold-menu open><summary>Menu</summary></details><div data-canofold-progress></div>'
    bootstrapShell()
    click('[data-canofold-theme-toggle]')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('canofold-theme')).toBe('dark')
    click('[data-canofold-theme-toggle]')
    expect(localStorage.getItem('canofold-theme')).toBe('light')
    click('[data-canofold-sidebar-open]')
    expect(document.querySelector('[data-canofold-sidebar]')?.getAttribute('data-open')).toBe('true')
    expect(document.querySelector('[data-canofold-sidebar-open]')?.getAttribute('aria-label')).toBe('Close')
    click('[data-canofold-sidebar-backdrop]')
    expect(document.querySelector('[data-canofold-sidebar]')?.getAttribute('data-open')).toBe('false')
    expect(document.querySelector('details')?.open).toBe(false)
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    key('Escape')
    window.__canofoldShellDispose?.()
    click('[data-canofold-theme-toggle]')
    expect(localStorage.getItem('canofold-theme')).toBe('light')
  })

  it('opens and traps focus in source, copies and restores feedback and focus', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    document.body.innerHTML =
      '<button data-canofold-source-open>Source</button><div data-canofold-source-sheet hidden><button data-canofold-source-copy aria-label="Copy" data-canofold-action-success="Copied">Copy</button><textarea data-canofold-source-text>original</textarea><button data-canofold-source-close>Close</button></div>'
    const copy = vi.fn(async () => {})
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { clipboard: { writeText: copy } })
    bootstrapShell()
    click('[data-canofold-source-open]')
    expect(document.activeElement).toBe(document.querySelector('[data-canofold-source-copy]'))
    key('Tab', true)
    expect(document.activeElement).toBe(document.querySelector('[data-canofold-source-close]'))
    key('Tab')
    expect(document.activeElement).toBe(document.querySelector('[data-canofold-source-copy]'))
    click('[data-canofold-source-copy]')
    await Promise.resolve()
    await Promise.resolve()
    expect(copy).toHaveBeenCalledWith('original')
    expect(document.querySelector('[data-canofold-source-copy]')?.getAttribute('aria-label')).toBe('Copied')
    await vi.advanceTimersByTimeAsync(1500)
    expect(document.querySelector('[data-canofold-source-copy]')?.getAttribute('aria-label')).toBe('Copy')
    click('[data-canofold-source-close]')
    expect(document.activeElement).toBe(document.querySelector('[data-canofold-source-open]'))
    expect(document.documentElement.classList.contains('cf-source-open')).toBe(false)
    click('[data-canofold-source-open]')
    key('Escape')
    expect(document.querySelector<HTMLElement>('[data-canofold-source-sheet]')?.hidden).toBe(true)
  })

  it('uses the non-secure clipboard path without leaving a textarea behind', async () => {
    document.body.innerHTML =
      '<button data-canofold-source-copy aria-label="Copy"></button><textarea data-canofold-source-text>text</textarea>'
    vi.stubGlobal('isSecureContext', false)
    const exec = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    bootstrapShell()
    click('[data-canofold-source-copy]')
    await Promise.resolve()
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelectorAll('textarea')).toHaveLength(1)
    expect(document.querySelector('button')?.dataset.actionState).toBe('success')
    Reflect.deleteProperty(document, 'execCommand')
  })

  it('restores document reading position and tabs during a live update', async () => {
    document.body.innerHTML =
      '<div data-canofold-page-root><h2 id="anchor">Old</h2><details open></details><div data-cf-behavior="tabs" data-cf-tabs-id="one"><button role="tab" data-cf-tab="saved" aria-selected="true"></button></div></div>'
    bootstrapShell()
    const next = parse(
      '<html dir="rtl"><body><div data-canofold-page-root data-canofold-demo-client-url="/demo.js"><h2 id="anchor">New</h2><details></details><div data-cf-behavior="tabs" data-cf-tabs-id="one"><button role="tab" data-cf-tab="saved"></button></div></div></body></html>'
    )
    const tabs = vi.spyOn(HTMLElement.prototype, 'click')
    window.__canofoldBootstrapMarkdown = vi.fn(async () => {})
    window.__canofoldLoadPageModule = vi.fn(async () => {})
    window.__canofoldBootstrapDemos = vi.fn(async () => {})
    expect(await window.__canofoldApplyPageDocument?.(next, { mode: 'update' })).toBe(true)
    expect(document.querySelector('details')?.open).toBe(true)
    expect(tabs).toHaveBeenCalledOnce()
    expect(window.scrollBy).toHaveBeenCalledWith(0, 0)
    expect(window.__canofoldLoadPageModule).toHaveBeenCalledWith('/demo.js')
    expect(window.__canofoldBootstrapDemos).toHaveBeenCalledOnce()
    expect(document.documentElement.dir).toBe('rtl')
    const noAnchor = parse('<div data-canofold-page-root>No heading</div>')
    await window.__canofoldApplyPageDocument?.(noAnchor, { mode: 'update' })
    expect(window.scrollTo).toHaveBeenCalled()
    expect(document.documentElement.hasAttribute('dir')).toBe(false)
    expect(await window.__canofoldApplyPageDocument?.(parse('<p>No page</p>'))).toBe(false)
    expect(
      await window.__canofoldApplyPageDocument?.(parse('<div id="missing" data-cf-demo-source></div>'), {
        mode: 'demo-source'
      })
    ).toBe(false)
  })

  it('uses popstate history positions and leaves native link behavior intact', async () => {
    document.body.innerHTML =
      '<div data-canofold-page-root><a href="/" id="top">Top</a><a href="#section" id="hash">Hash</a><a href="/file" download id="download">Download</a><a href="https://example.test" id="external">External</a><a href="/next" target="_blank" id="blank">Blank</a></div>'
    bootstrapShell()
    click('#top')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
    for (const id of ['hash', 'download', 'external', 'blank']) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: id === 'external' })
      let intercepted = true
      window.addEventListener(
        'click',
        (event) => {
          intercepted = event.defaultPrevented
          event.preventDefault()
        },
        { once: true }
      )
      document.getElementById(id)!.dispatchEvent(event)
      expect(intercepted).toBe(false)
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<div data-canofold-page-root>Back</div>', {
            headers: { 'content-type': 'text/html' }
          })
      )
    )
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { __canofold: { scrollY: 230, sidebarScrollTop: 30 } } })
    )
    await vi.waitFor(() => expect(document.body.textContent).toBe('Back'))
    expect(window.scrollTo).toHaveBeenCalledWith(0, 230)
  })

  it('tracks outline reading position, scrolling its panel and cleaning listeners', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    document.body.innerHTML =
      '<header class="cf-header"></header><aside data-canofold-outline><a href="#first" data-canofold-outline-link>First</a><a href="#second" data-canofold-outline-link>Second</a><a href="#%zz" data-canofold-outline-link>Invalid</a></aside><h2 id="first">First</h2><h2 id="second">Second</h2>'
    const panel = document.querySelector<HTMLElement>('aside')!
    const first = document.querySelector<HTMLElement>('a')!
    const second = document.querySelector<HTMLElement>('a[href="#second"]')!
    const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top }) as DOMRect
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(2000)
    vi.spyOn(document.getElementById('first')!, 'getBoundingClientRect').mockReturnValue(rect(0, 30))
    vi.spyOn(document.getElementById('second')!, 'getBoundingClientRect').mockReturnValue(rect(600, 630))
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(rect(0, 200))
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(0, 20))
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(rect(300, 320))
    bootstrapOutline()
    expect(first.dataset.active).toBe('true')
    expect(panel.scrollTop).toBeLessThan(0)
    vi.stubGlobal('scrollY', 2000)
    window.dispatchEvent(new Event('scroll'))
    expect(second.dataset.active).toBe('true')
    expect(first.dataset.active).toBeUndefined()
    expect(panel.scrollTop).toBeGreaterThan(0)
    window.dispatchEvent(new Event('hashchange'))
    vi.runAllTimers()
    window.dispatchEvent(new Event('resize'))
    window.__canofoldOutlineDispose?.()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
