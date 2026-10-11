import { tokenize } from './tokenize'

export interface CompactSearchDocument {
  title: string
  description: string
  excerpt?: string
  routePath: string
  tags?: string[]
}

export interface CompactSearchIndex {
  docs: CompactSearchDocument[]
  postings: Record<string, number[] | undefined>
}

function matchingTokens(queryTokens: string[], value: string) {
  const tokens = new Set(tokenize(value))
  return queryTokens.filter((token) => tokens.has(token)).length
}

/** Rank a generated compact index with the same small deterministic client algorithm. */
export function queryCompactIndex(query: string, index: CompactSearchIndex, limit = 8) {
  const queryTokens = tokenize(query)
  const lower = query.trim().toLowerCase()
  const scores = new Map<number, number>()

  queryTokens.forEach((token) => {
    const postings = Object.hasOwn(index.postings, token) ? index.postings[token] : undefined
    ;(postings ?? []).forEach((documentId) => {
      scores.set(documentId, (scores.get(documentId) || 0) + 1)
    })
  })

  return Array.from(scores, ([documentId, tokenScore]) => {
    const doc = index.docs[documentId]
    if (!doc) return undefined
    const tags = (doc.tags ?? []).join(' ')
    const score =
      tokenScore +
      matchingTokens(queryTokens, doc.title) * 4 +
      matchingTokens(queryTokens, doc.description) * 2 +
      matchingTokens(queryTokens, tags) * 3 +
      matchingTokens(queryTokens, doc.routePath) * 2 +
      (doc.title.toLowerCase().includes(lower) ? 12 : 0) +
      (doc.description.toLowerCase().includes(lower) ? 4 : 0) +
      (tags.toLowerCase().includes(lower) ? 6 : 0) +
      (doc.excerpt?.toLowerCase().includes(lower) ? 2 : 0)
    return { doc, score }
  })
    .filter((item): item is { doc: CompactSearchDocument; score: number } => Boolean(item))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.doc)
}
