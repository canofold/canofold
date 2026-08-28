import { describe, expect, it } from 'vitest'
import { createBasePathUrlTransform } from './transformUrls'

describe('createBasePathUrlTransform', () => {
  it('prefixes root-relative URLs exactly once', () => {
    const transform = createBasePathUrlTransform('/project/')

    expect(transform('/guide/', 'href')).toBe('/project/guide/')
    expect(transform('/project/guide/', 'href')).toBe('/project/guide/')
    expect(transform('/project', 'href')).toBe('/project')
  })

  it('preserves relative, external, protocol-relative, data, and fragment URLs', () => {
    const transform = createBasePathUrlTransform('/project/')

    for (const value of [
      'image.png',
      '../image.png',
      'https://example.com/image.png',
      '//cdn.example.com/image.png',
      'data:image/png;base64,abc',
      '#section'
    ]) {
      expect(transform(value, 'src')).toBe(value)
    }
  })
})
