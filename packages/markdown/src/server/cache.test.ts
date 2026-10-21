import { describe, expect, it, vi } from 'vitest'
import { createMarkdownServerContext } from './cache'

describe('Markdown server context', () => {
  it('does not invoke plugin property accessors for cache accounting', async () => {
    const title = vi.fn(() => 'Title')
    const context = createMarkdownServerContext()
    const options = {
      plugins: [
        {
          name: 'accessor',
          rehypePlugins: [
            () => (tree: { children: unknown[] }) => {
              tree.children.push({
                type: 'element',
                tagName: 'span',
                properties: {
                  get title() {
                    return title()
                  }
                },
                children: []
              })
            }
          ]
        }
      ]
    }
    await context.prepare('# Accessor', options)
    expect(title).not.toHaveBeenCalled()
  })
  it('does not retain oversized trees or analysis', async () => {
    const context = createMarkdownServerContext()
    const transform = vi.fn((tree: { children: unknown[] }) => {
      tree.children.push({ type: 'text', value: 'x'.repeat(9 * 1024 * 1024) })
    })
    const options = { plugins: [{ name: 'large', rehypePlugins: [() => transform] }] }
    const first = context.prepare('# Large', options)
    await first
    const second = context.prepare('# Large', options)
    expect(second).not.toBe(first)
    await second
    await context.analyze('# Large', options)
    await context.analyze('# Large', options)
    expect(transform).toHaveBeenCalledTimes(4)
  })
  it.each(['markdown', 'mdx'] as const)(
    'retains compact %s analysis independently of render eviction',
    async (mode) => {
      const transform = vi.fn()
      const options = { plugins: [{ name: 'count', remarkPlugins: [() => transform] }] }
      const context = createMarkdownServerContext({ maxEntries: 1 })
      const first = context.analyze('# First', options, mode)
      expect(context.analyze('# First', options, mode)).toBe(first)
      await first
      await context.analyze('# Second', options, mode)
      expect(await context.analyze('# First', options, mode)).toMatchObject({ text: 'First' })
      expect(transform).toHaveBeenCalledTimes(2)
      await context.analyze('# First', { ...options, locale: 'en' }, mode)
      expect(transform).toHaveBeenCalledTimes(3)
      context.clear()
      await context.analyze('# First', options, mode)
      expect(transform).toHaveBeenCalledTimes(4)
    }
  )

  it('does not resurrect analysis cleared while a plugin is pending', async () => {
    let finish!: () => void
    let blocked = true
    const transform = vi.fn(async () => {
      if (blocked)
        await new Promise<void>((resolve) => {
          finish = resolve
        })
    })
    const options = { plugins: [{ name: 'pending', remarkPlugins: [() => transform] }] }
    const context = createMarkdownServerContext()
    const first = context.analyze('# First', options)
    await vi.waitFor(() => expect(transform).toHaveBeenCalledTimes(1))
    context.clear()
    blocked = false
    const fresh = context.analyze('# First', options)
    finish()
    await Promise.all([first, fresh])
    expect(context.analyze('# First', options)).toBe(fresh)
    expect(transform).toHaveBeenCalledTimes(2)
  })

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
