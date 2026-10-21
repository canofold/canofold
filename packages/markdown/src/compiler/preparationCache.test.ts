import { describe, expect, it, vi } from 'vitest'
import { createPreparationCache } from './preparationCache'

describe('Preparation cache bounds', () => {
  it('deduplicates pending work and evicts the least recently used entry', async () => {
    const cache = createPreparationCache<number>(2, 4096, () => 1)
    const create = vi.fn(async () => 1)
    const first = cache.get('first', create)
    expect(cache.get('first', create)).toBe(first)
    await first
    await cache.get('second', create)
    expect(cache.get('first', create)).toBe(first)
    await cache.get('third', create)
    expect(cache.get('first', create)).toBe(first)
    await cache.get('second', create)
    expect(create).toHaveBeenCalledTimes(4)
  })

  it('counts source keys as well as values against its byte budget', async () => {
    const cache = createPreparationCache<number>(10, 600, () => 1)
    const create = vi.fn(async () => 1)
    await cache.get('x'.repeat(100), create)
    await cache.get('x'.repeat(100), create)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('does not revive pending work or remove a new entry after invalidation', async () => {
    const cache = createPreparationCache<number>(2, 4096, () => 1)
    let fail!: (reason: Error) => void
    const old = cache.get(
      'key',
      () =>
        new Promise<number>((_, reject) => {
          fail = reject
        })
    )
    cache.clear()
    const fresh = cache.get('key', async () => 2)
    fail(new Error('stale'))
    await expect(old).rejects.toThrow('stale')
    await fresh
    expect(cache.get('key', async () => 3)).toBe(fresh)
  })

  it('does not republish a fulfilled entry that was cleared while pending', async () => {
    const cache = createPreparationCache<number>(2, 4096, () => 1)
    let finish!: (value: number) => void
    const old = cache.get(
      'key',
      () =>
        new Promise<number>((resolve) => {
          finish = resolve
        })
    )
    cache.clear()
    finish(1)
    expect(await old).toBe(1)
    expect(await cache.get('key', async () => 2)).toBe(2)
  })

  it('retries failures and does not retain values without a safe key', async () => {
    const cache = createPreparationCache<number>(2, 4096, () => 1)
    await expect(
      cache.get('key', async () => {
        throw new Error('failed')
      })
    ).rejects.toThrow('failed')
    expect(await cache.get('key', async () => 2)).toBe(2)
    const create = vi.fn(async () => 3)
    await cache.get(undefined, create)
    await cache.get(undefined, create)
    expect(create).toHaveBeenCalledTimes(2)
    cache.delete('key')
    expect(await cache.get('key', async () => 4)).toBe(4)
  })
})
