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
 * visible explanation and destination. Results that cannot explain why they
 * matched are omitted instead of showing an apparently unrelated page.
 */
export function createPagefindSearchDocument(
  query: string,
  data: PagefindResultData
): SearchResultDocument | undefined {
  const plainText = (value: unknown) =>
    String(value ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(?:nbsp|#160);/gi, ' ')
      .replace(/&(?:amp|#38);/gi, '&')
      .replace(/&(?:lt|#60);/gi, '<')
      .replace(/&(?:gt|#62);/gi, '>')
      .replace(/\s+/g, ' ')
      .trim()
  const terms = plainText(query).toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (...values: unknown[]) => {
    const haystack = values.map(plainText).join(' ').toLowerCase()
    return terms.length > 0 && terms.every((term) => haystack.includes(term))
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
  const score = (title: string, excerpt: string) =>
    (matches(title) ? 4 : 0) + (matches(excerpt) ? 2 : 0) + (matches(title, excerpt) ? 1 : 0)

  const fragments = (data.sub_results ?? [])
    .map((fragment, index) => {
      const title = plainText(fragment.title)
      const excerpt = plainText(fragment.plain_excerpt || fragment.excerpt)
      return { fragment, title, excerpt, index, score: score(title, excerpt) }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const fragment = fragments[0]
  const pageTitle = plainText(data.meta?.title || data.url)

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

  const metaDescription = plainText(data.meta?.description)
  const excerpt = plainText(data.plain_excerpt || data.excerpt)
  const description = matches(pageTitle)
    ? metaDescription || excerpt || data.url
    : matches(metaDescription)
      ? metaDescription
      : matches(excerpt)
        ? excerpt
        : undefined
  if (!description) return undefined

  return {
    title: pageTitle,
    description,
    excerpt,
    routePath: data.url
  }
}

export function rankSearchDocuments(query: string, documents: SearchResultDocument[]) {
  const needle = query.trim().toLowerCase()
  if (!needle) return documents

  return documents
    .map((document, index) => {
      const title = document.title.toLowerCase()
      const description = document.description.toLowerCase()
      const excerpt = String(document.excerpt ?? '').toLowerCase()
      const score =
        (title === needle ? 200 : title.includes(needle) ? 100 : 0) +
        (description.includes(needle) ? 24 : 0) +
        (excerpt.includes(needle) ? 8 : 0)
      return { document, index, score }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.document)
}

export function highlightSearchText(value: string, query: string) {
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  const source = String(value)
  const needle = query.trim()
  if (!needle) return escape(source)

  const sourceLower = source.toLowerCase()
  const needleLower = needle.toLowerCase()
  let cursor = 0
  let output = ''
  let match = sourceLower.indexOf(needleLower)
  while (match !== -1) {
    output += escape(source.slice(cursor, match))
    output += `<mark>${escape(source.slice(match, match + needle.length))}</mark>`
    cursor = match + needle.length
    match = sourceLower.indexOf(needleLower, cursor)
  }
  return output + escape(source.slice(cursor))
}
