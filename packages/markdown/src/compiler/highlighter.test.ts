import { describe, expect, it, vi } from 'vitest'
import { toString } from 'hast-util-to-string'
import { visit } from 'unist-util-visit'
const { tokenizations } = vi.hoisted(() => ({ tokenizations: vi.fn() }))
vi.mock('shiki/core', async (original) => {
  const actual = await original<typeof import('shiki/core')>()
  return {
    ...actual,
    createHighlighterCore: async (...args: Parameters<typeof actual.createHighlighterCore>) => {
      const highlighter = await actual.createHighlighterCore(...args)
      const highlight = highlighter.codeToHast.bind(highlighter)
      highlighter.codeToHast = (...options) => {
        tokenizations()
        return highlight(...options)
      }
      return highlighter
    }
  }
})
import { prepareMarkdown } from './prepareMarkdown'

describe('Code-block preparation', () => {
  it('stops superseded documents between blocks without poisoning shared highlighted output', async () => {
    tokenizations.mockClear()
    const controller = new AbortController()
    const source = '```ts\nconst abortedFirst = 1\n```\n\n```ts\nconst abortedSecond = 2\n```'
    tokenizations.mockImplementationOnce(() => controller.abort())
    await expect(
      prepareMarkdown(source, undefined, {
        warnedLanguages: new Set(),
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(tokenizations).toHaveBeenCalledTimes(1)
    const restored = await prepareMarkdown(source)
    expect(toString(restored.document)).toContain('const abortedSecond = 2')
    expect(tokenizations).toHaveBeenCalledTimes(2)
  })
  it('reuses unchanged blocks across body edits and invalidates changed metadata, code and themes', async () => {
    tokenizations.mockClear()
    const source = '```ts\nexport const reusableBlock = true\n```'
    await prepareMarkdown(source)
    expect(tokenizations).toHaveBeenCalledTimes(1)
    await prepareMarkdown('## Edited paragraph\n\n' + source)
    expect(tokenizations).toHaveBeenCalledTimes(1)
    await prepareMarkdown(source.replace('```ts', '```ts {1}'))
    expect(tokenizations).toHaveBeenCalledTimes(2)
    await prepareMarkdown(source.replace('true', 'false'))
    expect(tokenizations).toHaveBeenCalledTimes(3)
    await prepareMarkdown(source, { code: { themes: { light: 'github-light' } } })
    expect(tokenizations).toHaveBeenCalledTimes(4)
  })

  it('does not let a later plugin corrupt a block retained for another preparation', async () => {
    const source = '```ts\nexport const isolatedBlock = true\n```'
    await prepareMarkdown(source, {
      plugins: [
        {
          name: 'mutate-tokens',
          rehypePlugins: [
            () => (tree) => {
              visit(tree, 'element', (node) => {
                if (node.tagName === 'span') node.children = [{ type: 'text', value: 'CORRUPTED' }]
              })
            }
          ]
        }
      ]
    })
    const next = await prepareMarkdown(source)
    expect(toString(next.document)).toContain('export const isolatedBlock = true')
    expect(toString(next.document)).not.toContain('CORRUPTED')
  })
})
