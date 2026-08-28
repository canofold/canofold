interface MarkdownFence {
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

function openingFence(line: string): (MarkdownFence & { language: string }) | undefined {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
  if (!match?.[1]) return undefined
  const marker = match[1][0] as '`' | '~'
  const info = match[2]?.trim() ?? ''
  if (marker === '`' && info.includes('`')) return undefined
  return {
    marker,
    size: match[1].length,
    language: info.split(/\s+/, 1)[0]?.toLowerCase() ?? ''
  }
}

function closesFence(line: string, fence: MarkdownFence) {
  const match = line.match(/^ {0,3}(`+|~+)[ \t]*$/)
  return Boolean(match?.[1]?.[0] === fence.marker && match[1].length >= fence.size)
}

/** Detect only executable top-level fences, ignoring examples nested in longer fences. */
export function hasMarkdownFenceLanguage(source: string, languages: ReadonlySet<string>) {
  let open: MarkdownFence | undefined
  const container = { listIndent: 0 }
  for (const line of source.split(/\r?\n/)) {
    const content = containerContent(line, container)
    if (open) {
      if (closesFence(content, open)) open = undefined
      continue
    }
    const fence = openingFence(content)
    if (!fence) continue
    if (languages.has(fence.language)) return true
    open = fence
  }
  return false
}

function removeInlineCode(line: string) {
  let result = ''
  let index = 0
  while (index < line.length) {
    if (line[index] !== '`') {
      result += line[index]
      index += 1
      continue
    }
    let endOfOpening = index + 1
    while (line[endOfOpening] === '`') endOfOpening += 1
    const delimiter = line.slice(index, endOfOpening)
    const closing = line.indexOf(delimiter, endOfOpening)
    if (closing === -1) {
      result += delimiter
      index = endOfOpening
      continue
    }
    result += ' '.repeat(closing + delimiter.length - index)
    index = closing + delimiter.length
  }
  return result
}

/** Return prose with fenced, indented, and inline code removed. */
export function markdownProse(source: string) {
  let open: MarkdownFence | undefined
  const container = { listIndent: 0 }
  return source
    .split(/\r?\n/)
    .map((line) => {
      const content = containerContent(line, container)
      if (open) {
        if (closesFence(content, open)) open = undefined
        return ''
      }
      const fence = openingFence(content)
      if (fence) {
        open = fence
        return ''
      }
      if (/^(?: {4}|\t)/.test(content)) return ''
      return removeInlineCode(content)
    })
    .join('\n')
}
