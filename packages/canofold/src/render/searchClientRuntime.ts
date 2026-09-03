import { tokenize } from '../search/tokenize'
import {
  createPagefindSearchDocument,
  highlightSearchText,
  rankSearchDocuments,
  type PagefindResultData,
  type SearchResultDocument
} from './searchClient'

const SEARCH_RESULT_LIMIT = 8
const PAGEFIND_CANDIDATE_LIMIT = 32
const EXACT_TEXT_MATCH_SCORE = 2

interface CompactSearchDocument extends SearchResultDocument {
  tags?: string[]
}

interface CompactSearchIndex {
  docs: CompactSearchDocument[]
  postings: Record<string, number[] | undefined>
}

interface PagefindResult {
  data(): Promise<PagefindResultData>
}

interface PagefindModule {
  init?(): unknown
  preload?(query: string, options: PagefindOptions): unknown
  search(query: string, options: PagefindOptions): Promise<{ results: PagefindResult[] }>
}

interface PagefindOptions {
  filters: {
    version: string
    locale: string
  }
}

type SearchWindow = typeof window & {
  __canofoldBootstrapSearch?: () => void
  __canofoldSearchDispose?: () => void
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function bootstrapSearch() {
  const runtime = window as SearchWindow
  runtime.__canofoldSearchDispose?.()
  const controller = new AbortController()
  const signal = controller.signal
  const on = (
    target: EventTarget,
    event: string,
    listener: EventListener,
    options: AddEventListenerOptions = {}
  ) => target.addEventListener(event, listener, { ...options, signal })
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const modal = document.querySelector<HTMLElement>('[data-canofold-search]')

  if (modal) {
    const activeModal = modal
    const locale = activeModal.getAttribute('data-locale') || document.documentElement.lang || 'en'
    const version = activeModal.getAttribute('data-version') || 'current'
    const provider = activeModal.getAttribute('data-search-provider') || 'compact'
    const searchIndexUrl = activeModal.getAttribute('data-search-index-url') || `/search/${locale}.json`
    const searchBundleUrl = activeModal.getAttribute('data-search-bundle-url') || '/pagefind/pagefind.js'
    const emptyLabel = activeModal.getAttribute('data-empty-label') || 'No matching documents'
    const errorLabel = activeModal.getAttribute('data-error-label') || 'Search index is unavailable'
    const input = activeModal.querySelector<HTMLInputElement>('input')
    const defaults = activeModal.querySelector<HTMLElement>('[data-canofold-search-default]')
    const results = activeModal.querySelector<HTMLElement>('[data-canofold-search-results]')
    const openers = document.querySelectorAll<HTMLElement>('[data-canofold-search-open]')
    const closers = activeModal.querySelectorAll<HTMLElement>('[data-canofold-search-close]')
    const actions = activeModal.querySelectorAll<HTMLElement>('[data-canofold-search-action]')
    const panel = activeModal.querySelector<HTMLElement>('[role="dialog"]')
    let indexPromise: Promise<CompactSearchIndex> | undefined
    let pagefindPromise: Promise<PagefindModule> | undefined
    let lastFocus: Element | null

    async function loadLocalIndex() {
      const response = await fetch(searchIndexUrl)
      if (!response.ok) throw new Error('Search index not found')
      return (await response.json()) as CompactSearchIndex
    }

    async function searchCompact(query: string) {
      if (!indexPromise) {
        indexPromise = loadLocalIndex().catch((error: unknown) => {
          indexPromise = undefined
          throw error
        })
      }
      const index = await indexPromise
      const queryTokens = tokenize(query)
      const lower = query.toLowerCase()
      const scores = new Map<number, number>()
      queryTokens.forEach((token) => {
        ;(index.postings[token] || []).forEach((documentId) => {
          scores.set(documentId, (scores.get(documentId) || 0) + 1)
        })
      })
      return Array.from(scores, ([documentId, tokenScore]) => {
        const doc = index.docs[documentId]
        if (!doc) return undefined
        const haystack = [doc.title, doc.description, ...(doc.tags || []), doc.excerpt]
          .join(' ')
          .toLowerCase()
        const textScore = haystack.includes(lower) ? EXACT_TEXT_MATCH_SCORE : 0
        return { doc, score: tokenScore + textScore }
      })
        .filter((item): item is { doc: CompactSearchDocument; score: number } => Boolean(item))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, SEARCH_RESULT_LIMIT)
        .map((item) => item.doc)
    }

    async function loadPagefind() {
      if (!pagefindPromise) {
        pagefindPromise = import(searchBundleUrl)
          .then((module) => module as PagefindModule)
          .catch((error: unknown) => {
            pagefindPromise = undefined
            throw error
          })
      }
      return pagefindPromise
    }

    function runPagefind(action: (pagefind: PagefindModule) => unknown) {
      return loadPagefind()
        .then(action)
        .catch(() => undefined)
    }

    async function searchPagefind(query: string) {
      const pagefind = await loadPagefind()
      const response = await pagefind.search(query, { filters: { version, locale } })
      const documents = await Promise.all(
        response.results.slice(0, PAGEFIND_CANDIDATE_LIMIT).map(async (result) => {
          const data = await result.data()
          return createPagefindSearchDocument(query, data)
        })
      )
      return rankSearchDocuments(
        query,
        documents.filter((document): document is SearchResultDocument => Boolean(document))
      ).slice(0, SEARCH_RESULT_LIMIT)
    }

    function search(query: string) {
      return provider === 'pagefind' ? searchPagefind(query) : searchCompact(query)
    }

    function focusable() {
      return Array.from(
        activeModal.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.closest('[hidden]') &&
          element.getAttribute('aria-hidden') !== 'true'
      )
    }

    function openModal() {
      lastFocus = document.activeElement
      activeModal.removeAttribute('hidden')
      document.documentElement.classList.add('cf-search-open')
      defaults?.removeAttribute('hidden')
      results?.setAttribute('hidden', '')
      requestAnimationFrame(() => (input || panel)?.focus())
      if (provider === 'pagefind') void runPagefind((pagefind) => pagefind.init?.())
    }

    function closeModal() {
      activeModal.setAttribute('hidden', '')
      document.documentElement.classList.remove('cf-search-open')
      if (input) input.value = ''
      if (results) results.innerHTML = ''
      defaults?.removeAttribute('hidden')
      results?.setAttribute('hidden', '')
      if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true })
    }

    openers.forEach((button) => on(button, 'click', openModal))
    closers.forEach((button) => on(button, 'click', closeModal))
    if (results) {
      on(results, 'click', (event) => {
        const target = event.target
        if (target instanceof Element && target.closest('a[href]')) closeModal()
      })
    }
    actions.forEach((button) =>
      on(button, 'click', () => {
        const action = button.getAttribute('data-canofold-search-action')
        closeModal()
        if (action === 'source') {
          document.querySelector<HTMLElement>('[data-canofold-source-open]')?.click()
        }
        if (action === 'theme') {
          document.querySelector<HTMLElement>('[data-canofold-theme-toggle]')?.click()
        }
      })
    )
    on(document, 'keydown', (rawEvent) => {
      const event = rawEvent as KeyboardEvent
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        activeModal.hasAttribute('hidden') ? openModal() : closeModal()
      } else if (event.key === 'Escape' && !activeModal.hasAttribute('hidden')) {
        closeModal()
      } else if (event.key === 'Tab' && !activeModal.hasAttribute('hidden')) {
        const items = focusable()
        if (!items.length) {
          event.preventDefault()
          panel?.focus()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    })

    if (input && results) {
      on(input, 'input', () => {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
          const query = input.value.trim()
          if (!query) {
            results.innerHTML = ''
            results.setAttribute('hidden', '')
            defaults?.removeAttribute('hidden')
            return
          }
          defaults?.setAttribute('hidden', '')
          results.removeAttribute('hidden')
          if (provider === 'pagefind') {
            void runPagefind((pagefind) => pagefind.preload?.(query, { filters: { version, locale } }))
          }
          try {
            const matches = await search(query)
            if (disposed || input.value.trim() !== query) return

            results.innerHTML = matches.length
              ? matches
                  .map(
                    (document) =>
                      '<a class="cf-search-result" href="' +
                      escapeHtml(document.routePath) +
                      '"><span class="cf-search-result-copy"><strong>' +
                      highlightSearchText(document.title, query) +
                      '</strong><small>' +
                      highlightSearchText(document.description || document.routePath, query) +
                      '</small></span><span class="cf-search-result-arrow" aria-hidden="true">→</span></a>'
                  )
                  .join('')
              : `<p class="cf-search-empty">${escapeHtml(emptyLabel)}</p>`
          } catch {
            if (disposed || input.value.trim() !== query) return
            results.innerHTML = `<p class="cf-search-empty">${escapeHtml(errorLabel)}</p>`
          }
        }, 150)
      })
    }
  }

  runtime.__canofoldSearchDispose = () => {
    disposed = true
    controller.abort()
    clearTimeout(debounceTimer)
    document.documentElement.classList.remove('cf-search-open')
  }
}

const runtime = window as SearchWindow
runtime.__canofoldBootstrapSearch = bootstrapSearch
bootstrapSearch()
