import { describe, expect, it } from 'vitest'
import { mapConcurrent } from './concurrency'

describe('mapConcurrent', () => {
  it('preserves input order while respecting the concurrency limit', async () => {
    let active = 0
    let peak = 0
    const results = await mapConcurrent([3, 1, 2, 0], 2, async (value) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, value))
      active -= 1
      return value * 2
    })

    expect(results).toEqual([6, 2, 4, 0])
    expect(peak).toBe(2)
  })

  it('rejects invalid concurrency values', async () => {
    await expect(mapConcurrent([1], 0, async (value) => value)).rejects.toThrow(
      'Concurrency must be a positive finite number'
    )
  })

  it('waits for active workers to settle before rejecting', async () => {
    const events: string[] = []
    await expect(
      mapConcurrent(['fail', 'slow'], 2, async (value) => {
        if (value === 'fail') throw new Error('failed')
        await new Promise((resolve) => setTimeout(resolve, 10))
        events.push('settled')
        return value
      })
    ).rejects.toThrow('failed')
    expect(events).toEqual(['settled'])
  })
})
