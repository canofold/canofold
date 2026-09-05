// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootstrapSearch } from './searchClientRuntime'
import { noFlashScript, outlineScript, shellScript } from './shellScripts'

afterEach(() => {
  const runtime = window as typeof window & {
    __canofoldApplyPageDocument?: unknown
    __canofoldBootstrapPlayground?: unknown
    __canofoldLoadPageModule?: unknown
    __canofoldOutlineDispose?: () => void
    __canofoldSearchDispose?: () => void
    __canofoldShellDispose?: () => void
  }
  runtime.__canofoldOutlineDispose?.()
  runtime.__canofoldSearchDispose?.()
  runtime.__canofoldShellDispose?.()
  delete runtime.__canofoldApplyPageDocument
  delete runtime.__canofoldBootstrapPlayground
  delete runtime.__canofoldLoadPageModule
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.head.querySelectorAll('[data-canofold-page-head]').forEach((node) => node.remove())
  document.documentElement.className = ''
  document.documentElement.lang = ''
  window.history.replaceState(null, '', '/')
})

describe('browser shell scripts', () => {
  it.each([
    ['no-flash', noFlashScript],
    ['shell', shellScript],
    ['outline', outlineScript]
  ])('emits valid JavaScript for %s', (_name, source) => {
    expect(() => new Function(source)).not.toThrow()
  })

  it('switches the playground view without changing the rendered content', () => {
    document.body.innerHTML = `
      <div data-canofold-playground data-view="preview">
        <button
          data-canofold-playground-toggle
          data-source-label="Source"
          data-preview-label="Preview"
          aria-label="Source"
          title="Source"
        ></button>
        <pre data-canofold-playground-source># Source</pre>
        <article><h1>Source</h1></article>
      </div>`

    new Function(shellScript)()
    const toggle = document.querySelector<HTMLButtonElement>('[data-canofold-playground-toggle]')
    toggle?.click()

    expect(document.querySelector<HTMLElement>('[data-canofold-playground]')?.dataset.view).toBe('source')
    expect(toggle?.getAttribute('aria-label')).toBe('Preview')
    expect(toggle?.getAttribute('title')).toBe('Preview')
    expect(document.querySelector('article')?.textContent).toBe('Source')

    toggle?.click()
    expect(document.querySelector<HTMLElement>('[data-canofold-playground]')?.dataset.view).toBe('preview')
    expect(toggle?.getAttribute('aria-label')).toBe('Source')
  })

  it('resizes playground panes with keyboard controls and clamps the split', () => {
    document.body.innerHTML = `
      <div data-canofold-playground style="direction: ltr">
        <div
          role="separator"
          tabindex="0"
          aria-valuemin="25"
          aria-valuemax="75"
          aria-valuenow="45"
          data-canofold-playground-resizer
        ></div>
      </div>`

    new Function(shellScript)()
    const playground = document.querySelector<HTMLElement>('[data-canofold-playground]')
    const resizer = document.querySelector<HTMLElement>('[data-canofold-playground-resizer]')

    resizer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(resizer?.getAttribute('aria-valuenow')).toBe('47')
    expect(playground?.style.getPropertyValue('--cf-playground-source-width')).toBe('47%')

    resizer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    resizer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(resizer?.getAttribute('aria-valuenow')).toBe('75')

    resizer?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(resizer?.getAttribute('aria-valuenow')).toBe('45')
  })

  it('writes scroll progress to the fill element', () => {
    document.body.innerHTML = '<div class="cf-progress"><span data-canofold-progress></span></div>'
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2000
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 })

    new Function(shellScript)()

    expect(document.querySelector<HTMLElement>('[data-canofold-progress]')?.style.transform).toBe(
      'scaleX(0.5)'
    )
  })

  it('progressively strengthens the home header background as the page scrolls', () => {
    document.body.innerHTML = '<header class="cf-header cf-header-home"></header>'
    let scrollY = 0
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY
    })

    new Function(shellScript)()
    const header = document.querySelector<HTMLElement>('.cf-header-home')
    expect(header?.style.getPropertyValue('--cf-header-surface-mix')).toBe('0%')
    expect(header?.style.getPropertyValue('--cf-header-backdrop-blur')).toBe('0px')
    expect(header?.style.getPropertyValue('--cf-header-backdrop-saturation')).toBe('100%')

    scrollY = 48
    window.dispatchEvent(new Event('scroll'))
    expect(header?.style.getPropertyValue('--cf-header-surface-mix')).toBe('34%')
    expect(header?.style.getPropertyValue('--cf-header-backdrop-blur')).toBe('11px')
    expect(header?.style.getPropertyValue('--cf-header-backdrop-saturation')).toBe('130%')

    scrollY = 96
    window.dispatchEvent(new Event('scroll'))
    expect(header?.style.getPropertyValue('--cf-header-surface-mix')).toBe('68%')
    expect(header?.style.getPropertyValue('--cf-header-backdrop-blur')).toBe('22px')
    expect(header?.style.getPropertyValue('--cf-header-backdrop-saturation')).toBe('160%')

    scrollY = 0
    window.dispatchEvent(new Event('scroll'))
    expect(header?.style.getPropertyValue('--cf-header-surface-mix')).toBe('0%')
  })

  it('keeps repeated same-page fragment links under native anchor scrolling', () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '/guide/#section')
    document.body.innerHTML = '<a href="#section">Section</a><h2 id="section">Section</h2>'
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)

    new Function(shellScript)()
    const event = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true })
    document.querySelector<HTMLAnchorElement>('a')?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
    vi.clearAllTimers()
  })

  it('boots the outline runtime without relying on shell-local helpers', () => {
    ;(
      window as typeof window & {
        __canofoldOutlineDispose?: () => void
      }
    ).__canofoldOutlineDispose?.()
    document.body.innerHTML = `
      <header class="cf-header"></header>
      <aside data-canofold-outline>
        <a href="#overview" data-canofold-outline-link>Overview</a>
      </aside>
      <h2 id="overview">Overview</h2>`
    Object.defineProperty(document.querySelector('.cf-header'), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ height: 64 })
    })
    Object.defineProperty(document.querySelector('#overview'), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 80 })
    })

    expect(() => new Function(outlineScript)()).not.toThrow()
    expect(document.querySelector<HTMLElement>('[data-canofold-outline-link]')?.dataset.active).toBe('true')
  })

  it('keeps the mobile sidebar toggle state and label in sync', () => {
    document.body.innerHTML = `
      <button
        data-canofold-sidebar-open
        data-canofold-sidebar-open-label="Open sidebar"
        data-canofold-sidebar-close-label="Close"
        aria-label="Open sidebar"
        aria-expanded="false"
      ></button>
      <aside data-canofold-sidebar data-open="false"></aside>
      <button data-canofold-sidebar-backdrop hidden></button>`

    new Function(shellScript)()
    const toggle = document.querySelector<HTMLButtonElement>('[data-canofold-sidebar-open]')!
    const backdrop = document.querySelector<HTMLButtonElement>('[data-canofold-sidebar-backdrop]')!

    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('Close')
    expect(backdrop.hidden).toBe(false)

    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('Open sidebar')
    expect(backdrop.hidden).toBe(true)
  })

  it('disposes the previous shell runtime before bootstrapping again', () => {
    document.documentElement.classList.remove('dark')
    document.body.innerHTML = '<button data-canofold-theme-toggle type="button">Theme</button>'

    new Function(shellScript)()
    ;(
      window as typeof window & {
        __canofoldBootstrapShell?: () => void
      }
    ).__canofoldBootstrapShell?.()
    document.querySelector<HTMLButtonElement>('[data-canofold-theme-toggle]')?.click()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('navigates same-origin pages without reloading and preserves the sidebar position', async () => {
    document.documentElement.className = 'dark'
    document.documentElement.lang = 'zh'
    document.head.insertAdjacentHTML(
      'beforeend',
      '<meta name="description" content="Old" data-canofold-page-head><link rel="stylesheet" href="/assets/canofold-plugins/shared.css" data-canofold-page-head><link rel="stylesheet" href="/assets/canofold-plugins/old.css" data-canofold-page-head>'
    )
    document.body.innerHTML = `
      <div data-canofold-page-root>
        <aside data-canofold-sidebar data-canofold-sidebar-key="current:zh:markdown">
          <a class="cf-sidebar-link cf-sidebar-link-active" href="/current/" aria-current="page" data-canofold-sidebar-link>Current</a>
          <a class="cf-sidebar-link" href="/next/" data-canofold-sidebar-link>Next</a>
        </aside>
        <main id="canofold-main">Old page</main>
      </div>`
    const existingStyle = document.querySelector<HTMLLinkElement>(
      'link[href="/assets/canofold-plugins/shared.css"]'
    )
    const fetchPage = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => `<!doctype html>
        <html lang="en" class="cf-header-hidden">
          <head>
            <title>Next page</title>
            <meta name="description" content="Next" data-canofold-page-head>
            <link rel="stylesheet" href="/assets/canofold-plugins/shared.css" data-canofold-page-head>
            <link rel="stylesheet" href="/assets/canofold-plugins/next.css" data-canofold-page-head>
          </head>
          <body>
            <div data-canofold-page-root data-canofold-playground-client-url="/assets/canofold-playground/index.js">
              <aside data-canofold-sidebar data-canofold-sidebar-key="current:zh:markdown">
                <a class="cf-sidebar-link" href="/current/" data-canofold-sidebar-link>Current</a>
                <a class="cf-sidebar-link cf-sidebar-link-active" href="/next/" aria-current="page" data-canofold-sidebar-link>Next</a>
              </aside>
              <main id="canofold-main" tabindex="-1">Next page</main>
            </div>
          </body>
        </html>`
    }))
    vi.stubGlobal('fetch', fetchPage)
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const bootstrapPlayground = vi.fn()
    let finishPageModule!: () => void
    const pageModuleReady = new Promise<void>((resolve) => {
      finishPageModule = resolve
    })
    const loadPageModule = vi.fn(async () => {
      await pageModuleReady
      ;(
        window as typeof window & { __canofoldBootstrapPlayground?: () => void }
      ).__canofoldBootstrapPlayground = bootstrapPlayground
    })
    ;(
      window as typeof window & { __canofoldLoadPageModule?: (url: string) => Promise<void> }
    ).__canofoldLoadPageModule = loadPageModule

    new Function(shellScript)()
    const sidebar = document.querySelector<HTMLElement>('[data-canofold-sidebar]')!
    sidebar.scrollTop = 137
    const nativeReplaceWith = Element.prototype.replaceWith
    const replaceWith = vi.spyOn(Element.prototype, 'replaceWith').mockImplementation(function (
      this: Element,
      ...nodes: (Node | string)[]
    ) {
      const movedSidebar = this.matches('[data-canofold-sidebar]')
        ? nodes.find(
            (node): node is HTMLElement =>
              node instanceof HTMLElement && node.matches('[data-canofold-sidebar]')
          )
        : undefined
      nativeReplaceWith.call(this, ...nodes)
      if (movedSidebar) movedSidebar.scrollTop = 0
    })
    document
      .querySelector<HTMLAnchorElement>('[data-canofold-sidebar-link][href="/next/"]')
      ?.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(document.querySelector('#canofold-main')?.textContent).toBe('Next page'))
    expect(sidebar.scrollTop).toBe(137)
    finishPageModule()
    await vi.waitFor(() => expect(bootstrapPlayground).toHaveBeenCalledOnce())
    expect(fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/next/' }),
      expect.objectContaining({ headers: { accept: 'text/html' } })
    )
    expect(window.location.pathname).toBe('/next/')
    expect(document.querySelector<HTMLElement>('[data-canofold-sidebar]')).toBe(sidebar)
    expect(sidebar.scrollTop).toBe(137)
    expect(sidebar.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/next/')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('cf-header-hidden')).toBe(true)
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Next page')
    expect(document.activeElement).toBe(document.querySelector('#canofold-main'))
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Next')
    expect(document.querySelector('link[href="/assets/canofold-plugins/shared.css"]')).toBe(existingStyle)
    expect(document.querySelector('link[href="/assets/canofold-plugins/next.css"]')).not.toBeNull()
    expect(document.querySelector('link[href="/assets/canofold-plugins/old.css"]')).toBeNull()
    expect(loadPageModule).toHaveBeenCalledWith('/assets/canofold-playground/index.js')
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    replaceWith.mockRestore()
  })

  it('excludes controls inside hidden search sections from the focus trap', () => {
    document.body.innerHTML = `
      <div data-canofold-search data-locale="en">
        <div role="dialog" tabindex="-1">
          <input aria-label="Search">
          <div data-canofold-search-results>
            <a id="visible-result" href="/result/">Result</a>
          </div>
          <div data-canofold-search-default hidden>
            <button id="hidden-action" type="button">Hidden action</button>
          </div>
        </div>
      </div>`

    bootstrapSearch()
    const visibleResult = document.querySelector<HTMLAnchorElement>('#visible-result')!
    visibleResult.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(document.querySelector('input'))
  })

  it('disposes the previous search runtime before bootstrapping again', () => {
    document.body.innerHTML = `
      <button data-canofold-search-open type="button">Search</button>
      <div data-canofold-search data-locale="en" hidden>
        <div role="dialog" tabindex="-1"><input aria-label="Search"></div>
      </div>`

    bootstrapSearch()
    ;(
      window as typeof window & {
        __canofoldBootstrapSearch?: () => void
      }
    ).__canofoldBootstrapSearch?.()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    )

    expect(document.querySelector<HTMLElement>('[data-canofold-search]')?.hidden).toBe(false)
  })

  it('closes the search modal when a result link is selected', () => {
    document.body.innerHTML = `
      <div data-canofold-search data-locale="en">
        <div role="dialog" tabindex="-1">
          <input aria-label="Search">
          <div data-canofold-search-results>
            <a id="search-result" href="#matched-heading"><span>Matched heading</span></a>
          </div>
        </div>
      </div>`

    bootstrapSearch()
    document.querySelector<HTMLElement>('#search-result span')?.click()

    expect(document.querySelector<HTMLElement>('[data-canofold-search]')?.hidden).toBe(true)
  })

  it('loads and renders compact search results', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        docs: [
          {
            title: 'Official plugins',
            description: 'Enable plugins from one entry point',
            routePath: '/plugins/',
            excerpt: 'Plugin guide',
            tags: []
          }
        ],
        postings: { plugin: [0] }
      })
    }))
    vi.stubGlobal('fetch', fetch)
    document.body.innerHTML = `
      <div data-canofold-search data-locale="en" data-search-index-url="/search/en.json">
        <div role="dialog">
          <input aria-label="Search">
          <div data-canofold-search-default></div>
          <div data-canofold-search-results hidden></div>
        </div>
      </div>`

    bootstrapSearch()
    const input = document.querySelector<HTMLInputElement>('input')!
    input.value = 'plugin'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(150)

    expect(fetch).toHaveBeenCalledWith('/search/en.json')
    expect(document.querySelector('[data-canofold-search-results]')?.innerHTML).toContain(
      '<mark>plugin</mark>'
    )
    expect(document.querySelector<HTMLAnchorElement>('.cf-search-result')?.pathname).toBe('/plugins/')
  })

  it('renders a stable error state when the search index cannot be loaded', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }))
    )
    document.body.innerHTML = `
      <div data-canofold-search data-error-label="Search unavailable">
        <div role="dialog">
          <input aria-label="Search">
          <div data-canofold-search-default></div>
          <div data-canofold-search-results hidden></div>
        </div>
      </div>`

    bootstrapSearch()
    const input = document.querySelector<HTMLInputElement>('input')!
    input.value = 'missing'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(150)

    expect(document.querySelector('[data-canofold-search-results]')?.textContent).toBe('Search unavailable')
  })

  it('does not let a stale failed Pagefind query replace newer results', async () => {
    vi.useFakeTimers()
    let rejectFirst: ((error: Error) => void) | undefined
    const firstSearch = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject
    })
    const pagefindSearch = vi.fn((query: string) => {
      if (query === 'first') return firstSearch
      return Promise.resolve({
        results: [
          {
            data: async () => ({
              url: '/plugins/',
              meta: { title: 'Official plugins', description: 'Enable plugins' },
              plain_excerpt: 'Plugin reference'
            })
          }
        ]
      })
    })
    vi.stubGlobal('__canofoldTestPagefindSearch', pagefindSearch)
    const moduleSource =
      'export const search=(query)=>globalThis.__canofoldTestPagefindSearch(query);export const preload=()=>{};'
    document.body.innerHTML = `
      <div data-canofold-search data-search-provider="pagefind" data-error-label="Unavailable">
        <div role="dialog">
          <input aria-label="Search">
          <div data-canofold-search-default></div>
          <div data-canofold-search-results hidden></div>
        </div>
      </div>`
    document
      .querySelector('[data-canofold-search]')
      ?.setAttribute(
        'data-search-bundle-url',
        `data:text/javascript;charset=utf-8,${encodeURIComponent(moduleSource)}`
      )

    bootstrapSearch()
    const input = document.querySelector<HTMLInputElement>('input')!
    input.value = 'first'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(150)

    input.value = 'plugin'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(150)
    await vi.waitFor(() => {
      expect(document.querySelector('.cf-search-result')?.textContent).toContain('Official plugins')
    })

    rejectFirst?.(new Error('stale failure'))
    await vi.waitFor(() => {
      expect(document.querySelector('[data-canofold-search-results]')?.textContent).not.toBe('Unavailable')
    })
  })
})
