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
  document.head.innerHTML = ''
  document.documentElement.className = ''
  document.documentElement.removeAttribute('data-cf-theme')
  document.documentElement.removeAttribute('data-cf-theme-appearance')
  document.documentElement.removeAttribute('dir')
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('typed browser shell', () => {
  it('transfers a received document subtree without cloning every content node', async () => {
    document.body.innerHTML = '<div data-canofold-page-root><main>Old</main></div>'
    bootstrapShell()
    const next = parse('<div data-canofold-page-root><main>Next page</main></div>')
    const main = next.querySelector('main')
    await window.__canofoldApplyPageDocument!(next, { mode: 'navigation' })
    expect(document.querySelector('main')).toBe(main)
  })
  it.each([false, true])('preserves the reader color scheme %s across both server defaults', async (dark) => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.cfTheme = 'canofold'
    document.documentElement.dataset.cfThemeAppearance = dark ? 'dark' : 'light'
    document.body.innerHTML = '<div data-canofold-page-root>Initial</div>'
    bootstrapShell()
    for (const serverDark of [true, false]) {
      await window.__canofoldApplyPageDocument!(
        parse(
          `<html lang="en" class="cf-playground-page${serverDark ? ' dark' : ''}"><body><div data-canofold-page-root>Next</div></body></html>`
        ),
        { mode: 'navigation' }
      )
      expect(document.documentElement.classList.contains('dark')).toBe(dark)
      expect(document.documentElement.classList.contains('cf-playground-page')).toBe(true)
      expect(document.documentElement.dataset.cfThemeAppearance).toBe(dark ? 'dark' : 'light')
    }
  })

  it('reconciles page-specific styles and robots without removing global styles', async () => {
    document.head.innerHTML = '<link rel="stylesheet" href="/global.css">'
    document.body.innerHTML = '<div data-canofold-page-root>Initial</div>'
    bootstrapShell()
    const draft = parse(
      '<head><meta name="robots" content="noindex, nofollow" data-canofold-page-head><link rel="stylesheet" href="/provider.css" data-canofold-page-head></head><body><div data-canofold-page-root>Draft</div></body>'
    )
    await window.__canofoldApplyPageDocument!(draft.cloneNode(true) as Document, { mode: 'navigation' })
    const style = document.querySelector('link[href="/provider.css"]')
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
    await window.__canofoldApplyPageDocument!(draft, { mode: 'update' })
    expect(document.querySelector('link[href="/provider.css"]')).toBe(style)
    await window.__canofoldApplyPageDocument!(parse('<div data-canofold-page-root>Published</div>'), {
      mode: 'navigation'
    })
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
    expect(document.querySelector('link[href="/provider.css"]')).toBeNull()
    expect(document.querySelector('link[href="/global.css"]')).not.toBeNull()
  })
  it('reuses a single sidebar intent request without bypassing the HTTP cache', async () => {
    document.body.innerHTML =
      '<div data-canofold-page-root><a data-canofold-sidebar-link href="/next/">Next</a><main id="canofold-main">Old</main></div>'
    const fetchPage = vi.fn(
      async (_url: URL, _options?: RequestInit) =>
        new Response('<div data-canofold-page-root><main id="canofold-main">Next page</main></div>', {
          headers: { 'content-type': 'text/html' }
        })
    )
    vi.stubGlobal('fetch', fetchPage)
    bootstrapShell()
    const link = document.querySelector('a')!
    link.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(fetchPage).toHaveBeenCalledOnce()
    expect(fetchPage.mock.calls[0]?.[1]).not.toHaveProperty('cache', 'no-store')
    link.click()
    await vi.waitFor(() => expect(document.querySelector('main')?.textContent).toBe('Next page'))
    expect(fetchPage).toHaveBeenCalledOnce()
  })

  it('aborts superseded intent and prevents a stale response from replacing the latest navigation', async () => {
    document.body.innerHTML =
      '<div data-canofold-page-root><a data-canofold-sidebar-link href="/slow/">Slow</a><a data-canofold-sidebar-link href="/fast/">Fast</a><main id="canofold-main">Old</main></div>'
    let finishSlow!: (text: string) => void
    const slowText = new Promise<string>((resolve) => {
      finishSlow = resolve
    })
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL, options: RequestInit) => {
        signals.push(options.signal as AbortSignal)
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: () =>
            url.pathname === '/slow/'
              ? slowText
              : Promise.resolve('<div data-canofold-page-root><main id="canofold-main">Fast</main></div>')
        }
      })
    )
    bootstrapShell()
    const slow = document.querySelector<HTMLAnchorElement>('a[href="/slow/"]')!
    const fast = document.querySelector<HTMLAnchorElement>('a[href="/fast/"]')!
    slow.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    fast.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(signals[0]?.aborted).toBe(true)
    fast.click()
    await vi.waitFor(() => expect(document.querySelector('main')?.textContent).toBe('Fast'))
    finishSlow('<div data-canofold-page-root><main id="canofold-main">Stale</main></div>')
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('main')?.textContent).toBe('Fast')
    expect(location.pathname).toBe('/fast/')
  })

  it('does not prefetch external, opted-out, download, query or same-page sidebar links', () => {
    document.body.innerHTML =
      '<div data-canofold-page-root><a data-canofold-sidebar-link href="https://other.test/">External</a><a data-canofold-sidebar-link data-canofold-no-navigation href="/native/">Native</a><a data-canofold-sidebar-link download href="/file/">Download</a><a data-canofold-sidebar-link href="/dynamic/?query=one">Query</a><a data-canofold-sidebar-link href="#local">Local</a></div>'
    const fetchPage = vi.fn()
    vi.stubGlobal('fetch', fetchPage)
    bootstrapShell()
    document
      .querySelectorAll('a')
      .forEach((link) => link.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it('retries a failed speculative request on click and disposes unused intent', async () => {
    document.body.innerHTML =
      '<div data-canofold-page-root><a data-canofold-sidebar-link href="/retry/">Retry</a></div>'
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline during hover'))
      .mockResolvedValueOnce(
        new Response('<div data-canofold-page-root>Recovered</div>', {
          headers: { 'content-type': 'text/html' }
        })
      )
    vi.stubGlobal('fetch', fetchPage)
    bootstrapShell()
    const link = document.querySelector('a')!
    link.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await Promise.resolve()
    link.click()
    await vi.waitFor(() => expect(document.body.textContent).toBe('Recovered'))
    expect(fetchPage).toHaveBeenCalledTimes(2)
    document.body.innerHTML = '<a data-canofold-sidebar-link href="/unused/">Unused</a>'
    bootstrapShell()
    document.querySelector('a')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    const signal = fetchPage.mock.calls.at(-1)?.[1].signal
    window.__canofoldShellDispose?.()
    expect(signal.aborted).toBe(true)
  })

  it('does not turn an old intent response into a long-lived route cache', async () => {
    document.body.innerHTML =
      '<div data-canofold-page-root><a data-canofold-sidebar-link href="/fresh/">Fresh</a></div>'
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    const fetchPage = vi.fn(
      async () =>
        new Response('<div data-canofold-page-root>Fresh</div>', {
          headers: { 'content-type': 'text/html' }
        })
    )
    vi.stubGlobal('fetch', fetchPage)
    bootstrapShell()
    const link = document.querySelector('a')!
    link.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await Promise.resolve()
    now.mockReturnValue(6000)
    link.click()
    await vi.waitFor(() => expect(document.body.textContent).toBe('Fresh'))
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('ignores a superseded clicked navigation even when its body finishes late', async () => {
    document.body.innerHTML =
      '<div data-canofold-page-root><a href="/slow/">Slow</a><a href="/latest/">Latest</a><main>Old</main></div>'
    let finishSlow!: (body: string) => void
    const slow = new Promise<string>((resolve) => {
      finishSlow = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => ({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () =>
          url.pathname === '/slow/'
            ? slow
            : Promise.resolve('<div data-canofold-page-root><main>Latest</main></div>')
      }))
    )
    bootstrapShell()
    click('a[href="/slow/"]')
    click('a[href="/latest/"]')
    await vi.waitFor(() => expect(document.querySelector('main')?.textContent).toBe('Latest'))
    finishSlow('<div data-canofold-page-root><main>Stale</main></div>')
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('main')?.textContent).toBe('Latest')
    expect(location.pathname).toBe('/latest/')
  })

  it('does not bootstrap a replacement page twice when old enhancements finish late', async () => {
    document.body.innerHTML = '<div data-canofold-page-root>Initial</div>'
    let finishOld!: () => void
    const oldEnhancement = new Promise<void>((resolve) => {
      finishOld = resolve
    })
    window.__canofoldBootstrapMarkdown = vi
      .fn()
      .mockReturnValueOnce(oldEnhancement)
      .mockResolvedValue(undefined)
    window.__canofoldLoadPageModule = vi.fn(async () => {})
    window.__canofoldBootstrapDemos = vi.fn(async () => {})
    bootstrapShell()
    const old = window.__canofoldApplyPageDocument!(
      parse('<div data-canofold-page-root data-canofold-demo-client-url="/old.js">Old</div>')
    )
    await window.__canofoldApplyPageDocument!(
      parse('<div data-canofold-page-root data-canofold-demo-client-url="/new.js">New</div>')
    )
    finishOld()
    await old
    expect(window.__canofoldLoadPageModule).toHaveBeenCalledExactlyOnceWith('/new.js')
    expect(window.__canofoldBootstrapDemos).toHaveBeenCalledOnce()
    expect(document.body.textContent).toBe('New')
  })

  it('switches only the configured visual themes and persists the selected mode', () => {
    document.documentElement.dataset.cfTheme = 'canofold'
    document.documentElement.dataset.cfThemeAppearance = 'light'
    document.body.innerHTML = `<details data-canofold-menu open>
      <summary>Theme</summary>
      <button data-canofold-theme-option="canofold:light" data-canofold-theme-scheme="light"></button>
      <button data-canofold-theme-option="canofold:dark" data-canofold-theme-scheme="dark"></button>
      <button data-canofold-theme-option="neumorphism:default" data-canofold-theme-scheme="light"></button>
    </details>`
    bootstrapShell()
    click('[data-canofold-theme-option="canofold:dark"]')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('canofold-visual-theme')).toBe('canofold:dark')
    expect(document.querySelector('details')?.open).toBe(false)
    expect(document.activeElement).toBe(document.querySelector('summary'))
    click('[data-canofold-theme-option="neumorphism:default"]')
    expect(document.documentElement.dataset.cfTheme).toBe('neumorphism')
    expect(document.documentElement.dataset.cfThemeAppearance).toBe('default')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(
      document
        .querySelector('[data-canofold-theme-option="neumorphism:default"]')
        ?.getAttribute('aria-pressed')
    ).toBe('true')
  })

  it('ignores a detached page enhancement failure but still reports current-page failures', async () => {
    document.body.innerHTML = '<div data-canofold-page-root>Initial</div>'
    let failOld!: (error: Error) => void
    window.__canofoldBootstrapMarkdown = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => {
          failOld = reject
        })
      )
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Current page failed'))
    bootstrapShell()
    const old = window.__canofoldApplyPageDocument!(parse('<div data-canofold-page-root>Old</div>'))
    const oldResult = expect(old).resolves.toBe(true)
    await window.__canofoldApplyPageDocument!(parse('<div data-canofold-page-root>New</div>'))
    failOld(new Error('Old page failed'))
    await oldResult
    expect(document.body.textContent).toBe('New')
    await expect(
      window.__canofoldApplyPageDocument!(parse('<div data-canofold-page-root>Current</div>'))
    ).rejects.toThrow('Current page failed')
  })

  it('does not restore a live-update scroll position after another page replaces it', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    document.body.innerHTML = '<div data-canofold-page-root><h1 id="heading">Old</h1></div>'
    bootstrapShell()
    await window.__canofoldApplyPageDocument!(
      parse('<div data-canofold-page-root><h1 id="heading">Update</h1></div>'),
      { mode: 'update' }
    )
    await window.__canofoldApplyPageDocument!(
      parse('<div data-canofold-page-root><h1 id="heading">New</h1></div>'),
      { mode: 'navigation' }
    )
    vi.mocked(window.scrollTo).mockClear()
    frames.forEach((callback) => callback(0))
    expect(window.scrollBy).not.toHaveBeenCalled()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('manages mobile sidebar and outside-menu dismissal', () => {
    document.body.innerHTML =
      '<header class="cf-header"></header><button data-canofold-sidebar-open data-canofold-sidebar-open-label="Open" data-canofold-sidebar-close-label="Close"></button><aside data-canofold-sidebar></aside><div data-canofold-sidebar-backdrop hidden></div><details data-canofold-menu open><summary>Menu</summary></details><div data-canofold-progress></div>'
    bootstrapShell()
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

  it.each(['/back/', '/?version=previous'])(
    'restores page history at %s and leaves native links intact',
    async (backUrl) => {
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
      history.replaceState(null, '', backUrl)
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { __canofold: { scrollY: 230, sidebarScrollTop: 30 } } })
      )
      await vi.waitFor(() => expect(document.body.textContent).toBe('Back'))
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 230, behavior: 'instant' })
    }
  )

  it('keeps the current page and its interactions for fragment history changes', async () => {
    history.replaceState(null, '', '/guide/?version=current')
    document.body.innerHTML = '<div data-canofold-page-root><h2 id="section">Section</h2></div>'
    const page = document.querySelector('[data-canofold-page-root]')
    const fetchPage = vi.fn(async () => new Response('Unexpected page fetch'))
    vi.stubGlobal('fetch', fetchPage)
    bootstrapShell()
    history.pushState(null, '', '#section')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await Promise.resolve()
    expect(fetchPage).not.toHaveBeenCalled()
    expect(document.querySelector('[data-canofold-page-root]')).toBe(page)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('cancels a pending page navigation when fragment history returns to the rendered page', async () => {
    document.body.innerHTML = '<div data-canofold-page-root><a href="/next/">Next</a></div>'
    const fetchPage = vi.fn(
      (_url: URL, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
            once: true
          })
        })
    )
    vi.stubGlobal('fetch', fetchPage)
    bootstrapShell()
    click('a')
    history.pushState(null, '', '#section')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await Promise.resolve()
    expect(fetchPage).toHaveBeenCalledOnce()
    expect(fetchPage.mock.calls[0]?.[1].signal?.aborted).toBe(true)
    expect(document.querySelector('[data-canofold-page-root]')?.textContent).toBe('Next')
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
