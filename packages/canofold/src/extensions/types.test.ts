import { describe, expect, it } from 'vitest'
import { CANOFOLD_EXTENSION_API_VERSION, defineExtension } from './types'

describe('extension authoring helpers', () => {
  it('returns extension objects and factories unchanged', () => {
    const extension = { apiVersion: CANOFOLD_EXTENSION_API_VERSION, name: 'example' } as const
    const factory = () => extension

    expect(defineExtension(extension)).toBe(extension)
    expect(defineExtension(factory)).toBe(factory)
  })
})
