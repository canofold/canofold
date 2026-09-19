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

const EXACT_TEXT_MATCH_SCORE = 2

/** Rank a generated compact index with the same small deterministic client algorithm. */
export function queryCompactIndex(query: string, index: CompactSearchIndex, limit = 8) {
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
    const haystack = [doc.title, doc.description, ...(doc.tags || []), doc.excerpt].join(' ').toLowerCase()
    const textScore = haystack.includes(lower) ? EXACT_TEXT_MATCH_SCORE : 0
    return { doc, score: tokenScore + textScore }
  })
    .filter((item): item is { doc: CompactSearchDocument; score: number } => Boolean(item))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.doc)
}
