import { analyzeMarkdown } from '@canofold/markdown/server/analyze'

export function createDeterministicSummary({ description, body }: { description: string; body: string }) {
  if (description.trim()) {
    return description.trim()
  }

  const paragraph = body.split(/\n\n+/).find((part) => {
    const source = part.trim()
    if (!source) return false
    const analysis = analyzeMarkdown(source)
    return analysis.text && analysis.headings.length === 0
  })

  return paragraph ? analyzeMarkdown(paragraph.trim()).text : ''
}
