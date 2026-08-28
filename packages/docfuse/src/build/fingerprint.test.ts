import { describe, expect, it } from 'vitest'
import { fingerprint, fingerprintBytes, stableJson } from './fingerprint'

describe('build fingerprints', () => {
  it('canonicalizes object keys without reordering arrays', () => {
    expect(stableJson({ z: 1, nested: { b: 2, a: 1 }, list: ['b', 'a'] })).toBe(
      '{"list":["b","a"],"nested":{"a":1,"b":2},"z":1}'
    )
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }))
    expect(fingerprint({ list: [1, 2] })).not.toBe(fingerprint({ list: [2, 1] }))
  })

  it('hashes byte content independently from object serialization', () => {
    expect(fingerprintBytes('content')).toMatch(/^[a-f\d]{64}$/)
    expect(fingerprintBytes('content')).not.toBe(fingerprintBytes('changed'))
  })

  it('rejects unsupported values instead of collapsing distinct cache identities', () => {
    expect(() => stableJson({ cacheKey: { pattern: /alpha/ } })).toThrow(/JSON-serializable/)
    expect(() => fingerprint({ cacheKey: { pattern: /beta/ } })).toThrow(/JSON-serializable/)
    expect(() => stableJson({ callback() {} })).toThrow(/JSON-serializable/)
  })
})
