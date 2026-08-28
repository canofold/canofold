import { describe, expect, it } from 'vitest'
import { analyzeMarkdown } from './analyze'

describe('analyzeMarkdown', () => {
  it('extracts headings, search text, and code examples from the parser tree', () => {
    const result = analyzeMarkdown(`# API

See [guide](/guide).

\`\`\`ts {2}
const value = 1
\`\`\`
`)

    expect(result.headings).toEqual([{ level: 1, text: 'API', slug: 'api' }])
    expect(result.text).toContain('See guide')
    expect(result.text).not.toContain('const value')
    expect(result.codeExamples).toEqual([{ language: 'ts', meta: '{2}', code: 'const value = 1' }])
    expect(result.links).toEqual(['/guide'])
    expect(result.missingCodeBlockLanguages).toBe(0)
  })

  it('supports Setext headings and deduplicates slugs like rendered headings', () => {
    expect(analyzeMarkdown('Intro\n=====\n\n## Intro').headings).toEqual([
      { level: 1, text: 'Intro', slug: 'intro' },
      { level: 2, text: 'Intro', slug: 'intro-1' }
    ])
  })

  it('defaults code fences without a language to text', () => {
    const result = analyzeMarkdown('```\nplain\n```')
    expect(result.codeExamples).toEqual([{ language: 'text', code: 'plain' }])
    expect(result.missingCodeBlockLanguages).toBe(1)
  })

  it('resolves reference-style links and images for validation', () => {
    const result = analyzeMarkdown(
      '[Guide][docs]\n\n![Preview][image]\n\n[docs]: /guide\n[image]: /preview.png'
    )

    expect(result.links).toEqual(['/guide'])
    expect(result.images).toEqual(['/preview.png'])
  })

  it('keeps optional math syntax as searchable text without loading the math plugin', () => {
    const result = analyzeMarkdown('# Formula $E = mc^2$\n\nInline $x + y$.')

    expect(result.headings).toEqual([{ level: 1, text: 'Formula $E = mc^2$', slug: 'formula-e--mc2' }])
    expect(result.text).toContain('Inline $x + y$.')
  })

  it('reports malformed built-in and undeclared directives', () => {
    const result = analyzeMarkdown(
      [':::gallery[Preview]', 'Visible prose', ':::', '', '::custom[Plugin content]{value="one"}'].join('\n')
    )

    expect(result.directiveIssues).toEqual([
      {
        message: 'Each Gallery item must contain exactly one Markdown image',
        line: 2,
        column: 1
      },
      {
        message: 'Unknown Markdown directive `custom`',
        line: 5,
        column: 1
      }
    ])
  })

  it('accepts directive names declared by an active plugin', () => {
    const result = analyzeMarkdown('::custom[Plugin content]{value="one"}', {
      plugins: [{ name: 'custom-directive', directiveNames: ['custom'] }]
    })

    expect(result.directiveIssues).toEqual([])
  })
})
