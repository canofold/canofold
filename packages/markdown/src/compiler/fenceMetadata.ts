import type { MarkdownCodeOverflow } from './types'

const titlePattern = /(?:title|filename|label)\s*=\s*["']([^"']+)["']|\[([^\]]+)\]/i
const overflowPattern = /(?:^|\s)(wrap|scroll)(?=\s|$)/i

export interface MarkdownFenceMetadata {
  filename?: string
  overflow?: MarkdownCodeOverflow
}

/** Parse the shared metadata understood by Markdown and MDX code fences. */
export function parseFenceMetadata(meta: string): MarkdownFenceMetadata {
  const titleMatch = meta.match(titlePattern)
  const overflowMatch = meta.match(overflowPattern)
  const filename = titleMatch?.[1]?.trim() || titleMatch?.[2]?.trim()
  const overflow = overflowMatch?.[1]?.toLowerCase() as MarkdownCodeOverflow | undefined

  return {
    ...(filename ? { filename } : {}),
    ...(overflow ? { overflow } : {})
  }
}
