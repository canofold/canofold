import { describe, expect, it } from 'vitest'
import { createMarkdownServerContext } from './cache'

describe('Markdown server context', () => {
  it('bounds, deduplicates and clears MDX compilations independently of Markdown', async () => {
    const context = createMarkdownServerContext({ maxEntries: 1 })
    const first = context.prepareMdx('# First')
    expect(context.prepareMdx('# First')).toBe(first)
    await first
    await context.prepareMdx('# Second')
    const replaced = context.prepareMdx('# First')
    expect(replaced).not.toBe(first)
    await replaced
    context.clear()
    expect(context.prepareMdx('# First')).not.toBe(replaced)
  })

  it.each(['prepare', 'prepareMdx'] as const)('does not cache failed %s plugin work', async (method) => {
    const context = createMarkdownServerContext()
    let fail = true
    const options = {
      plugins: [
        {
          name: 'retry',
          remarkPlugins: [
            () => async () => {
              if (fail) throw new Error('plugin failed')
            }
          ]
        }
      ]
    }
    await expect(context[method]('# Retry', options)).rejects.toThrow('plugin failed')
    fail = false
    await expect(context[method]('# Retry', options)).resolves.toMatchObject({ analysis: { text: 'Retry' } })
  })
  it('deduplicates concurrent work and can be cleared explicitly', async () => {
    const context = createMarkdownServerContext({ maxEntries: 2 })
    const first = context.prepare('# Hello')
    const second = context.prepare('# Hello')

    expect(first).toBe(second)
    await first

    context.clear()
    expect(context.prepare('# Hello')).not.toBe(first)
  })

  it('evicts the oldest prepared entry at the configured limit', async () => {
    const context = createMarkdownServerContext({ maxEntries: 2 })
    const first = context.prepare('# First')
    await Promise.all([first, context.prepare('# Second'), context.prepare('# Third')])

    expect(context.prepare('# First')).not.toBe(first)
  })
})
