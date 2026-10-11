import { tokenize } from '../search/tokenize'

export interface SearchResultDocument {
  title: string
  description: string
  excerpt?: string
  routePath: string
}

export interface PagefindSubResult {
  title?: string
  url?: string
  excerpt?: string
  plain_excerpt?: string
}

export interface PagefindResultData {
  url: string
  meta?: Record<string, string | undefined>
  excerpt?: string
  plain_excerpt?: string
  sub_results?: PagefindSubResult[]
}

/**
 * Pagefind returns both a page result and the matching heading fragments. Keep
 * the page title for orientation, but use the best matching fragment for the
 * visible explanation and destination. Pagefind may match different query
 * terms in different sections, so a short excerpt cannot prove the absence
 * of a match.
 */
export function createPagefindSearchDocument(
  query: string,
  data: PagefindResultData
): SearchResultDocument | undefined {
  const plainText = (value: unknown) =>
    String(value ?? '')
      .replace(/<\/?mark\b[^>]*>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(?:nbsp|#160);/gi, ' ')
      .replace(/&(?:amp|#38);/gi, '&')
      .replace(/&(?:lt|#60);/gi, '<')
      .replace(/&(?:gt|#62);/gi, '>')
      .replace(/\s+/g, ' ')
      .trim()
  const terms = plainText(query).toLowerCase().split(/\s+/).filter(Boolean)
  const countTerms = (...values: unknown[]) => {
    const haystack = values.map(plainText).join(' ').toLowerCase()
    return terms.filter((term) => haystack.includes(term)).length
  }
  const hasMeaningfulHighlight = (value: unknown) => {
    const marked = String(value ?? '').matchAll(/<mark\b[^>]*>(.*?)<\/mark>/gi)
    return Array.from(marked, (match) => plainText(match[1]).toLowerCase()).some((highlight) =>
      terms.some(
        (term) =>
          (term.includes(highlight) || highlight.includes(term)) &&
          Math.min(term.length, highlight.length) >= Math.ceil(term.length / 2)
      )
    )
  }
  const withoutRepeatedLead = (value: string, lead: string) => {
    if (!lead || !value.toLowerCase().startsWith(lead.toLowerCase())) return value
    return (
      value
        .slice(lead.length)
        .replace(/^[\s·:：.\-—]+/, '')
        .trim() || value
    )
  }
  const score = (title: string, excerpt: string) => countTerms(title, excerpt) * 8 + countTerms(title) * 2

  const fragments = (data.sub_results ?? [])
    .map((fragment, index) => {
      const title = plainText(fragment.title)
      const excerpt = plainText(fragment.plain_excerpt || fragment.excerpt)
      return {
        fragment,
        title,
        excerpt,
        index,
        score: score(title, excerpt),
        highlighted: hasMeaningfulHighlight(fragment.excerpt)
      }
    })
    .filter((item) => item.score > 0 || item.highlighted)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const fragment = fragments[0]
  const pageTitle = plainText(data.meta?.title || data.url)
  const metaDescription = plainText(data.meta?.description)
  const excerpt = plainText(data.plain_excerpt || data.excerpt)

  if (
    !fragment &&
    !countTerms(pageTitle, metaDescription, excerpt) &&
    !hasMeaningfulHighlight(data.excerpt)
  ) {
    return undefined
  }

  if (fragment) {
    const heading = fragment.title === pageTitle ? '' : fragment.title
    const excerpt = withoutRepeatedLead(fragment.excerpt, fragment.title)
    const description = [heading, excerpt].filter(Boolean).join(' · ') || fragment.title || data.url
    return {
      title: pageTitle,
      description,
      excerpt,
      routePath: fragment.fragment.url || data.url
    }
  }

  const description = countTerms(pageTitle)
    ? metaDescription || excerpt || data.url
    : countTerms(metaDescription)
      ? metaDescription
      : excerpt || metaDescription || data.url

  return {
    title: pageTitle,
    description,
    excerpt,
    routePath: data.url
  }
}

export function highlightSearchText(value: string, query: string) {
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  const source = String(value)
  const needle = query.trim()
  if (!needle) return escape(source)
  const sourceLower = source.toLowerCase()
  const terms = [
    ...new Set([needle.toLowerCase(), ...tokenize(needle).filter((term) => term.length >= 2)])
  ].sort((left, right) => right.length - left.length)
  let cursor = 0
  let output = ''
  while (cursor < source.length) {
    const match = terms.find((term) => sourceLower.startsWith(term, cursor))
    if (match) {
      output += `<mark>${escape(source.slice(cursor, cursor + match.length))}</mark>`
      cursor += match.length
    } else {
      const character = String.fromCodePoint(source.codePointAt(cursor)!)
      output += escape(character)
      cursor += character.length
    }
  }
  return output
}
