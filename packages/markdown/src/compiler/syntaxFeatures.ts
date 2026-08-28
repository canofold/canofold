export interface MarkdownSyntaxFeatures {
  highlightedCode: boolean
  codeLanguages: readonly string[]
}

const PLAIN_TEXT_LANGUAGES = new Set(['text', 'plaintext', 'txt', 'plain'])
const RICH_BLOCK_LANGUAGES = new Set(['terminal'])

interface OpenFence {
  marker: '`' | '~'
  size: number
}

interface ContainerState {
  listIndent: number
}

function stripColumns(value: string, columns: number) {
  let index = 0
  let consumed = 0
  while (index < value.length && consumed < columns) {
    if (value[index] === ' ') consumed += 1
    else if (value[index] === '\t') consumed += 4 - (consumed % 4)
    else break
    index += 1
  }
  return consumed >= columns ? value.slice(index) : undefined
}

function containerContent(line: string, state: ContainerState) {
  let value = line
  while (true) {
    const quote = value.match(/^ {0,3}>[ \t]?/)
    if (!quote) break
    value = value.slice(quote[0].length)
  }

  const continued = state.listIndent > 0 ? stripColumns(value, state.listIndent) : undefined
  const content = continued ?? value
  const item = content.match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])([ \t]+)(.*)$/)
  if (item) {
    const body = item[2] ?? ''
    state.listIndent = (continued === undefined ? 0 : state.listIndent) + content.length - body.length
    return body
  }
  if (continued !== undefined || value.trim() === '') return content
  state.listIndent = 0
  return value
}

function openingFence(line: string): (OpenFence & { language: string }) | undefined {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
  if (!match?.[1]) return undefined
  const marker = match[1][0] as OpenFence['marker']
  const info = match[2]?.trim() ?? ''
  if (marker === '`' && info.includes('`')) return undefined
  return {
    marker,
    size: match[1].length,
    language: info.split(/\s+/, 1)[0]?.toLowerCase() || 'text'
  }
}

function closesFence(line: string, fence: OpenFence) {
  const match = line.match(/^ {0,3}(`+|~+)[ \t]*$/)
  return Boolean(match?.[1]?.[0] === fence.marker && match[1].length >= fence.size)
}

/**
 * Cheap line scan used to skip transforms that cannot match. Tracking the
 * opening marker prevents fenced examples inside longer fences from being
 * mistaken for real code blocks.
 */
export function detectMarkdownSyntax(
  source?: string,
  pluginFenceLanguages: ReadonlySet<string> = new Set()
): MarkdownSyntaxFeatures {
  if (source === undefined) return { highlightedCode: true, codeLanguages: [] }

  const languages = new Set<string>()
  let openFence: OpenFence | undefined
  const container = { listIndent: 0 }

  for (const line of source.split(/\r?\n/)) {
    const content = containerContent(line, container)
    if (openFence) {
      if (closesFence(content, openFence)) openFence = undefined
      continue
    }

    const opening = openingFence(content)
    if (!opening) continue
    openFence = opening
    const { language } = opening
    if (
      !RICH_BLOCK_LANGUAGES.has(language) &&
      !PLAIN_TEXT_LANGUAGES.has(language) &&
      !pluginFenceLanguages.has(language)
    ) {
      languages.add(language)
    }
  }

  const codeLanguages = [...languages]
  return { highlightedCode: codeLanguages.length > 0, codeLanguages }
}
