import { describe, expect, it } from 'vitest'
import { detectMarkdownSyntax } from './syntaxFeatures'

describe('detectMarkdownSyntax', () => {
  it.each(['\n', '\r\n', '\r'])('recognizes fenced code with every Markdown line ending: %j', (newline) => {
    expect(
      detectMarkdownSyntax(['# Document', '', '```ts', 'const ready = true', '```'].join(newline))
    ).toMatchObject({
      highlightedCode: true,
      codeLanguages: ['ts']
    })
  })
  it('excludes fenced languages consumed by active plugins', () => {
    expect(detectMarkdownSyntax('```dot\ndigraph G { a -> b }\n```', new Set(['dot']))).toMatchObject({
      highlightedCode: false,
      codeLanguages: []
    })
  })

  it('collects unique highlighted fence languages', () => {
    const syntax = detectMarkdownSyntax(
      ['```ts', 'const ready = true', '```', '', '```bash', 'pnpm test', '```', '', '```ts', '```'].join('\n')
    )

    expect(syntax).toEqual({ highlightedCode: true, codeLanguages: ['ts', 'bash'], definitionLists: false })
  })

  it('ignores rich blocks, plain text, and examples nested in longer fences', () => {
    const syntax = detectMarkdownSyntax(
      [
        '````md',
        '```tsx',
        '<Example />',
        '```',
        '$notMath$',
        '````',
        '',
        '```text',
        'plain',
        '```',
        '',
        '```mermaid',
        'flowchart LR',
        '```'
      ].join('\n')
    )

    expect(syntax).toEqual({
      highlightedCode: true,
      codeLanguages: ['md', 'mermaid'],
      definitionLists: false
    })
  })

  it('ignores dollar signs inside fenced code when collecting languages', () => {
    expect(detectMarkdownSyntax('```ts\nconst price = "$5"\n```')).toEqual({
      highlightedCode: true,
      codeLanguages: ['ts'],
      definitionLists: false
    })
  })

  it('detects fenced code indented inside an ordered list', () => {
    const syntax = detectMarkdownSyntax(
      ['10. Install', '', '    ```tsx', '    <Example />', '    ```'].join('\n')
    )

    expect(syntax).toMatchObject({ highlightedCode: true, codeLanguages: ['tsx'] })
  })

  it('detects fenced code inside blockquotes', () => {
    expect(detectMarkdownSyntax('> ```ts\n> const quoted = true\n> ```')).toEqual({
      highlightedCode: true,
      codeLanguages: ['ts'],
      definitionLists: false
    })
  })

  it('does not treat indented code as a fenced block', () => {
    expect(detectMarkdownSyntax('    ~~~brainfuck\n    +++[>+++<-]\n    ~~~')).toEqual({
      highlightedCode: false,
      codeLanguages: [],
      definitionLists: false
    })
  })

  it.each([
    ': meaning',
    '  : meaning',
    '\t: meaning',
    '> : meaning',
    '> > : meaning',
    '- : meaning',
    '> - 1. : meaning',
    ':',
    ':\r'
  ])('retains potential definition lists in containers: %s', (marker) => {
    expect(detectMarkdownSyntax(`Term\n${marker}`).definitionLists).toBe(true)
  })

  it('skips definition parsing only when no definition marker can occur', () => {
    expect(detectMarkdownSyntax(':::tip\nText with key: value\n:::').definitionLists).toBe(false)
    expect(detectMarkdownSyntax().definitionLists).toBe(true)
    expect(detectMarkdownSyntax('```md\n: Example\n```').definitionLists).toBe(true)
  })
})
