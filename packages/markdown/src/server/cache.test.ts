import { describe, expect, it } from 'vitest'
import { createMarkdownServerContext } from './cache'

describe('Markdown server context', () => {
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
