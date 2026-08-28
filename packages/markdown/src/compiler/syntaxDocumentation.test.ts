import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { analyzeMarkdown } from './analyze'
import { prepareMarkdown } from './prepareMarkdown'

const documents = [
  new URL('../../../../site/docs/zh/markdown/syntax.md', import.meta.url),
  new URL('../../../../site/docs/en/markdown/syntax.md', import.meta.url)
]

describe('Markdown syntax documentation', () => {
  it('keeps both locales complete and every authoring example compilable', async () => {
    const exampleSets = await Promise.all(
      documents.map(async (document) => {
        const source = await readFile(document, 'utf8')
        return analyzeMarkdown(source).codeExamples.filter((example) => example.language === 'markdown')
      })
    )

    expect(exampleSets[0]?.length).toBeGreaterThanOrEqual(16)
    expect(exampleSets[1]).toHaveLength(exampleSets[0]?.length ?? 0)

    for (const examples of exampleSets) {
      for (const example of examples) {
        await expect(
          prepareMarkdown(example.code, { code: { unknownLanguage: 'plain-text' } })
        ).resolves.toBeDefined()
      }
    }
  })
})
