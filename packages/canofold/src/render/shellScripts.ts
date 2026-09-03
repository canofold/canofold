/* v8 ignore next */
export const noFlashScript =
  "try{var t=localStorage.getItem('canofold-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}"

const ACTION_SUCCESS_DURATION_MS = 1500
const OUTLINE_TOP_PADDING_PX = 48
const OUTLINE_BOTTOM_PADDING_PX = 24
const DEFAULT_HEADER_HEIGHT_PX = 58
const PAGE_END_TOLERANCE_PX = 2

/* v8 ignore next */
export const shellScript = `window.__canofoldBootstrapShell = () => {
  window.__canofoldShellDispose?.()
  const controller = new AbortController()
  const signal = controller.signal
  const on = (target, event, listener, options = {}) => target.addEventListener(event, listener, { ...options, signal })
  const d = document
  const root = d.documentElement
  const q = (selector, parent = d) => parent.querySelector(selector)
  const qa = (selector, parent = d) => Array.from(parent.querySelectorAll(selector))
  let navigationController

  const homeHeader = q('.cf-header-home')
  function syncHomeHeader() {
    homeHeader?.classList.toggle('cf-header-scrolled', window.scrollY > 8)
  }
  syncHomeHeader()
  on(window, 'scroll', syncHomeHeader, { passive: true })

  function disposePage() {
    window.__canofoldSearchDispose?.()
    window.__canofoldMarkdownDispose?.()
    window.__canofoldOutlineDispose?.()
    window.__canofoldShellDispose?.()
  }

  async function bootstrapPage() {
    window.__canofoldBootstrapShell?.()
    window.__canofoldBootstrapOutline?.()
    window.__canofoldBootstrapSearch?.()
    await window.__canofoldBootstrapMarkdown?.()
    const pageRoot = q('[data-canofold-page-root]')
    const pageModule = pageRoot?.getAttribute('data-canofold-playground-client-url')
    if (pageModule) {
      const loadModule = window.__canofoldLoadPageModule || ((url) => import(url))
      await loadModule(pageModule)
      window.__canofoldBootstrapPlayground?.()
    }
  }

  function captureUpdateState(pageRoot) {
    const readingLine = 64
    const headings = qa('[id]', pageRoot)
    let anchor
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= readingLine) anchor = heading
      else break
    }
    const maximum = Math.max(1, root.scrollHeight - window.innerHeight)
    return {
      anchorId: anchor?.id || null,
      anchorTop: anchor?.getBoundingClientRect().top || 0,
      ratio: window.scrollY / maximum,
      details: qa('details', pageRoot).map((item) => item.open),
      tabs: qa('[data-cf-behavior="tabs"]', pageRoot).map((item) => ({
        id: item.getAttribute('data-cf-tabs-id'),
        value: q('[role="tab"][data-cf-tab][aria-selected="true"]', item)?.getAttribute('data-cf-tab') || null
      }))
    }
  }

  function restoreUpdateStructure(pageRoot, state) {
    qa('details', pageRoot).forEach((item, index) => {
      if (state.details[index] !== undefined) item.open = state.details[index]
    })
  }

  function restoreUpdateTabs(pageRoot, state) {
    state.tabs.forEach((saved) => {
      if (!saved.id || !saved.value) return
      const tabs = qa('[data-cf-behavior="tabs"]', pageRoot).find(
        (item) => item.getAttribute('data-cf-tabs-id') === saved.id
      )
      const trigger = tabs && qa('[role="tab"][data-cf-tab]', tabs).find(
        (item) => item.getAttribute('data-cf-tab') === saved.value
      )
      trigger?.click()
    })
  }

  function restoreReadingPosition(state) {
    requestAnimationFrame(() => {
      const anchor = state.anchorId && d.getElementById(state.anchorId)
      if (anchor) {
        window.scrollBy(0, anchor.getBoundingClientRect().top - state.anchorTop)
        return
      }
      const maximum = Math.max(0, root.scrollHeight - window.innerHeight)
      window.scrollTo(0, state.ratio * maximum)
    })
  }

  function syncPageHead(nextDocument) {
    d.title = nextDocument.title
    const currentNodes = qa('[data-canofold-page-head]', d.head)
    const nextNodes = qa('[data-canofold-page-head]', nextDocument.head)
    const available = new Map()
    currentNodes.forEach((node) => {
      const nodes = available.get(node.outerHTML) || []
      nodes.push(node)
      available.set(node.outerHTML, nodes)
    })
    const retained = new Set()
    nextNodes.forEach((node) => {
      const matches = available.get(node.outerHTML)
      const current = matches?.shift()
      if (current) retained.add(current)
      else d.head.appendChild(d.importNode(node, true))
    })
    currentNodes.forEach((node) => {
      if (!retained.has(node)) node.remove()
    })
  }

  function syncDocumentElement(nextDocument) {
    const dark = root.classList.contains('dark')
    root.className = nextDocument.documentElement.className
    if (dark) root.classList.add('dark')
    root.lang = nextDocument.documentElement.lang
    const direction = nextDocument.documentElement.getAttribute('dir')
    if (direction) root.setAttribute('dir', direction)
    else root.removeAttribute('dir')
    d.body.className = nextDocument.body.className
  }

  function syncSidebarState(currentSidebar, nextSidebar) {
    const currentLinks = qa('[data-canofold-sidebar-link]', currentSidebar)
    const nextLinks = qa('[data-canofold-sidebar-link]', nextSidebar)
    const currentDetails = qa('details', currentSidebar)
    const nextDetails = qa('details', nextSidebar)
    if (
      currentLinks.length !== nextLinks.length ||
      currentDetails.length !== nextDetails.length ||
      currentLinks.some((link, index) => link.getAttribute('href') !== nextLinks[index]?.getAttribute('href'))
    ) return false
    currentLinks.forEach((link, index) => {
      const nextLink = nextLinks[index]
      link.className = nextLink.className
      const current = nextLink.getAttribute('aria-current')
      if (current) link.setAttribute('aria-current', current)
      else link.removeAttribute('aria-current')
    })
    currentDetails.forEach((details, index) => {
      if (nextDetails[index]?.open) details.open = true
    })
    return true
  }

  async function applyPageDocument(nextDocument, options = {}) {
    const currentRoot = q('[data-canofold-page-root]')
    const nextRoot = q('[data-canofold-page-root]', nextDocument)
    if (!currentRoot || !nextRoot) return false
    const updateState = options.mode === 'update' ? captureUpdateState(currentRoot) : null
    const sidebarScrollTop = options.sidebarScrollTop ?? q('[data-canofold-sidebar]', currentRoot)?.scrollTop ?? 0
    disposePage()
    const imported = d.importNode(nextRoot, true)
    if (options.mode === 'navigation') {
      const currentSidebar = q('[data-canofold-sidebar]', currentRoot)
      const nextSidebar = q('[data-canofold-sidebar]', imported)
      if (
        currentSidebar &&
        nextSidebar &&
        currentSidebar.getAttribute('data-canofold-sidebar-key') &&
        currentSidebar.getAttribute('data-canofold-sidebar-key') ===
          nextSidebar.getAttribute('data-canofold-sidebar-key') &&
        syncSidebarState(currentSidebar, nextSidebar)
      ) {
        nextSidebar.replaceWith(currentSidebar)
      }
    }
    currentRoot.replaceWith(imported)
    syncPageHead(nextDocument)
    syncDocumentElement(nextDocument)
    if (updateState) restoreUpdateStructure(imported, updateState)
    const nextSidebar = q('[data-canofold-sidebar]', imported)
    if (!updateState && nextSidebar) nextSidebar.scrollTop = sidebarScrollTop
    await bootstrapPage()
    if (updateState) {
      restoreUpdateTabs(imported, updateState)
      restoreReadingPosition(updateState)
    } else {
      if (nextSidebar) nextSidebar.scrollTop = sidebarScrollTop
      if (options.focus) q('#canofold-main', imported)?.focus({ preventScroll: true })
      if (options.hash) {
        let id = options.hash.slice(1)
        try { id = decodeURIComponent(id) } catch {}
        d.getElementById(id)?.scrollIntoView()
      } else {
        window.scrollTo(0, options.scrollY ?? 0)
      }
    }
    return true
  }
  window.__canofoldApplyPageDocument = applyPageDocument

  function currentNavigationState() {
    return {
      scrollY: window.scrollY,
      sidebarScrollTop: q('[data-canofold-sidebar]')?.scrollTop || 0
    }
  }

  function historyStateWithNavigation(state) {
    const current = history.state && typeof history.state === 'object' ? history.state : {}
    return { ...current, __canofold: state }
  }

  function saveCurrentHistoryState() {
    try { history.replaceState(historyStateWithNavigation(currentNavigationState()), '', location.href) } catch {}
  }

  async function navigatePage(url, { push = true, state } = {}) {
    navigationController?.abort()
    navigationController = new AbortController()
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'text/html' },
      signal: navigationController.signal
    })
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return false
    const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html')
    if (!q('[data-canofold-page-root]', nextDocument)) return false
    const navigationState = state || {
      scrollY: 0,
      sidebarScrollTop: q('[data-canofold-sidebar]')?.scrollTop || 0
    }
    if (push) {
      saveCurrentHistoryState()
      history.pushState(historyStateWithNavigation(navigationState), '', url)
    }
    return applyPageDocument(nextDocument, {
      mode: 'navigation',
      hash: url.hash,
      scrollY: navigationState.scrollY,
      sidebarScrollTop: navigationState.sidebarScrollTop,
      focus: push
    })
  }

  function markAction(button, text) {
    if (!button) return
    const label = button.getAttribute('aria-label') || ''
    button.dataset.actionState = 'success'
    button.setAttribute('aria-label', text)
    clearTimeout(button._dfActionTimer)
    button._dfActionTimer = setTimeout(() => {
      delete button.dataset.actionState
      if (label) button.setAttribute('aria-label', label)
    }, ${ACTION_SUCCESS_DURATION_MS})
  }

  function copyFallback(text) {
    const area = d.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    d.body.appendChild(area)
    area.focus()
    area.select()
    let copied = false
    try {
      copied = d.execCommand('copy')
    } finally {
      area.remove()
    }
    return copied ? Promise.resolve() : Promise.reject(new Error('Copy command failed'))
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => copyFallback(text))
    }
    return copyFallback(text)
  }

  qa('[data-canofold-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(root.classList.contains('dark')))
    on(button, 'click', () => {
      const on = root.classList.toggle('dark')
      button.setAttribute('aria-pressed', String(on))
      try { localStorage.setItem('canofold-theme', on ? 'dark' : 'light') } catch {}
    })
  })

  const sourceSheet = q('[data-canofold-source-sheet]')
  let sourceLastFocus
  function focusable(container) {
    return qa('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])', container)
      .filter((element) => element.tabIndex >= 0 && !element.hidden && element.getAttribute('aria-hidden') !== 'true')
  }
  function setSource(value, invoker) {
    if (!sourceSheet) return
    if (value) {
      sourceLastFocus = invoker || d.activeElement
      sourceSheet.hidden = false
      root.classList.add('cf-source-open')
      requestAnimationFrame(() => (focusable(sourceSheet)[0] || q('.cf-source-panel', sourceSheet))?.focus())
    } else {
      const wasOpen = !sourceSheet.hidden
      sourceSheet.hidden = true
      root.classList.remove('cf-source-open')
      if (wasOpen && sourceLastFocus && typeof sourceLastFocus.focus === 'function') sourceLastFocus.focus()
      sourceLastFocus = undefined
    }
  }
  qa('[data-canofold-source-open]').forEach((button) => on(button, 'click', () => {
    setSource(true, button)
  }))
  qa('[data-canofold-source-close]').forEach((button) => on(button, 'click', () => {
    setSource(false)
  }))
  qa('[data-canofold-source-copy]').forEach((button) => on(button, 'click', () => {
    const source = q('[data-canofold-source-text]')
    const success = button.getAttribute('data-canofold-action-success') || 'Markdown source copied'
    if (source) copyText(source.value).then(() => markAction(button, success)).catch(() => {})
  }))

  qa('[data-canofold-playground-toggle]').forEach((button) => on(button, 'click', () => {
    const playground = button.closest('[data-canofold-playground]')
    if (!playground) return
    const nextView = playground.dataset.view === 'source' ? 'preview' : 'source'
    playground.dataset.view = nextView
    const nextLabel = nextView === 'source'
      ? button.getAttribute('data-preview-label')
      : button.getAttribute('data-source-label')
    if (nextLabel) {
      button.setAttribute('aria-label', nextLabel)
      button.setAttribute('title', nextLabel)
    }
  }))

  qa('[data-canofold-playground-resizer]').forEach((resizer) => {
    const playground = resizer.closest('[data-canofold-playground]')
    if (!playground) return
    const min = Number(resizer.getAttribute('aria-valuemin')) || 25
    const max = Number(resizer.getAttribute('aria-valuemax')) || 75
    const clamp = (value) => Math.min(max, Math.max(min, value))
    const setSplit = (value) => {
      const next = clamp(value)
      playground.style.setProperty('--cf-playground-source-width', next + '%')
      resizer.setAttribute('aria-valuenow', String(Math.round(next)))
    }
    const splitFromPointer = (event) => {
      const rect = playground.getBoundingClientRect()
      if (!rect.width) return
      const fromStart = (event.clientX - rect.left) / rect.width * 100
      setSplit(getComputedStyle(playground).direction === 'rtl' ? 100 - fromStart : fromStart)
    }
    let dragging = false
    on(resizer, 'pointerdown', (event) => {
      if (event.button !== 0) return
      dragging = true
      playground.dataset.resizing = ''
      resizer.setPointerCapture?.(event.pointerId)
      splitFromPointer(event)
      event.preventDefault()
    })
    on(resizer, 'pointermove', (event) => {
      if (dragging) splitFromPointer(event)
    })
    const stopDragging = (event) => {
      if (!dragging) return
      dragging = false
      delete playground.dataset.resizing
      if (resizer.hasPointerCapture?.(event.pointerId)) resizer.releasePointerCapture(event.pointerId)
    }
    on(resizer, 'pointerup', stopDragging)
    on(resizer, 'pointercancel', stopDragging)
    on(resizer, 'keydown', (event) => {
      const current = Number(resizer.getAttribute('aria-valuenow')) || 45
      const rtl = getComputedStyle(playground).direction === 'rtl'
      let next
      if (event.key === 'Home') next = min
      if (event.key === 'End') next = max
      if (event.key === 'ArrowLeft') next = current + (rtl ? 2 : -2)
      if (event.key === 'ArrowRight') next = current + (rtl ? -2 : 2)
      if (next === undefined) return
      setSplit(next)
      event.preventDefault()
    })
    on(resizer, 'dblclick', () => setSplit(45))
  })

  const bar = q('[data-canofold-progress]')
  function progress() {
    if (!bar) return
    const max = root.scrollHeight - window.innerHeight
    const scrollTop = window.scrollY || root.scrollTop || 0
    const ratio = max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0
    bar.style.transform = 'scaleX(' + ratio + ')'
  }
  progress()
  on(window, 'scroll', progress, { passive: true })
  on(window, 'resize', progress)

  const sidebar = q('[data-canofold-sidebar]')
  const backdrop = q('[data-canofold-sidebar-backdrop]')
  const open = q('[data-canofold-sidebar-open]')
  function setSidebar(value) {
    if (!sidebar) return
    sidebar.dataset.open = String(value)
    if (backdrop) backdrop.hidden = !value
    if (open) {
      open.setAttribute('aria-expanded', String(value))
      open.setAttribute(
        'aria-label',
        value ? open.dataset.canofoldSidebarCloseLabel : open.dataset.canofoldSidebarOpenLabel
      )
    }
  }
  if (open) {
    on(open, 'click', () => setSidebar(open.getAttribute('aria-expanded') !== 'true'))
  }
  if (backdrop) on(backdrop, 'click', () => setSidebar(false))
  qa('[data-canofold-sidebar-link]').forEach((link) => on(link, 'click', () => setSidebar(false)))

  on(d, 'click', (event) => {
    qa('[data-canofold-menu][open]').forEach((menu) => {
      if (!menu.contains(event.target)) menu.removeAttribute('open')
    })
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    ) return
    const anchor = event.target.closest('a[href]')
    if (!anchor || anchor.hasAttribute('download') || anchor.hasAttribute('data-canofold-no-navigation')) return
    if (anchor.target && anchor.target !== '_self') return
    const url = new URL(anchor.href, location.href)
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) return
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) return
      event.preventDefault()
      window.scrollTo(0, 0)
      return
    }
    event.preventDefault()
    void navigatePage(url).then((applied) => {
      if (!applied) location.assign(url.href)
    }).catch((error) => {
      if (error?.name !== 'AbortError') location.assign(url.href)
    })
  })
  on(window, 'popstate', (event) => {
    const state = event.state?.__canofold || { scrollY: 0, sidebarScrollTop: 0 }
    const url = new URL(location.href)
    void navigatePage(url, { push: false, state }).then((applied) => {
      if (!applied) location.reload()
    }).catch((error) => {
      if (error?.name !== 'AbortError') location.reload()
    })
  })
  on(d, 'keydown', (event) => {
    if (event.key === 'Tab' && sourceSheet && !sourceSheet.hidden) {
      const items = focusable(sourceSheet)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && d.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && d.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
      return
    }
    if (event.key !== 'Escape') return
    setSidebar(false)
    qa('[data-canofold-menu][open]').forEach((menu) => menu.removeAttribute('open'))
    setSource(false)
  })
  window.__canofoldShellDispose = () => {
    controller.abort()
    qa('[data-action-state]').forEach((button) => clearTimeout(button._dfActionTimer))
    root.classList.remove('cf-source-open')
  }
}
window.__canofoldBootstrapShell()`

/* v8 ignore next */
export const outlineScript = `window.__canofoldBootstrapOutline = () => {
  window.__canofoldOutlineDispose?.()
  const controller = new AbortController()
  const signal = controller.signal
  const links = Array.from(document.querySelectorAll('[data-canofold-outline-link]'))
  const map = Object.create(null)
  links.forEach((link) => {
    const href = link.getAttribute('href') || ''
    try { map[decodeURIComponent(href.slice(1))] = link } catch {}
  })
  const headings = Object.keys(map).map((id) => document.getElementById(id)).filter(Boolean)
  let current
  let queued = false
  let frame
  let hashTimer
  function setActive(link) {
    if (current === link) return
    if (current) delete current.dataset.active
    current = link
    if (!link) return
    link.dataset.active = 'true'
    const panel = link.closest('[data-canofold-outline]')
    if (!panel) return
    const linkRect = link.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    if (linkRect.top < panelRect.top + ${OUTLINE_TOP_PADDING_PX}) {
      panel.scrollTop -= panelRect.top + ${OUTLINE_TOP_PADDING_PX} - linkRect.top
    } else if (linkRect.bottom > panelRect.bottom - ${OUTLINE_BOTTOM_PADDING_PX}) {
      panel.scrollTop += linkRect.bottom - panelRect.bottom + ${OUTLINE_BOTTOM_PADDING_PX}
    }
  }
  function update() {
    queued = false
    if (!headings.length) return
    const header = document.querySelector('.cf-header')?.getBoundingClientRect().height || ${DEFAULT_HEADER_HEIGHT_PX}
    const readingLine = header + ${OUTLINE_TOP_PADDING_PX}
    let active = headings[0]
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= readingLine) active = heading
      else break
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - ${PAGE_END_TOLERANCE_PX}) {
      active = headings[headings.length - 1]
    }
    if (active) setActive(map[active.id])
  }
  function schedule() {
    if (queued) return
    queued = true
    frame = requestAnimationFrame(update)
  }
  window.addEventListener('scroll', schedule, { passive: true, signal })
  window.addEventListener('resize', schedule, { signal })
  window.addEventListener('hashchange', () => { hashTimer = setTimeout(update, 0) }, { signal })
  update()
  window.__canofoldOutlineDispose = () => {
    controller.abort()
    if (frame) cancelAnimationFrame(frame)
    if (hashTimer) clearTimeout(hashTimer)
  }
}
window.__canofoldBootstrapOutline()`
