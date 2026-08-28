import { describe, expect, it } from 'vitest'
import { stableJson } from './stableJson'

describe('stableJson', () => {
  it('normalizes object key order recursively', () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 4 }, b: 2 }))
  })

  it('skips optional cache identities for unsupported values', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(stableJson(circular)).toBeUndefined()
    expect(stableJson({ callback() {} })).toBeUndefined()
  })
})
