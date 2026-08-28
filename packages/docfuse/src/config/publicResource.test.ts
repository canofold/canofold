import { describe, expect, it } from 'vitest'
import { publicResourceSchema } from './publicResource'

describe('public resource schema', () => {
  it('accepts and normalizes site paths and HTTPS URLs', () => {
    expect(publicResourceSchema.parse('/guide')).toBe('/guide')
    expect(publicResourceSchema.parse('https://cdn.example.com/banner.png')).toBe(
      'https://cdn.example.com/banner.png'
    )
  })

  it.each(['//cdn.example.com/banner.png', '/../../outside', 'not a URL', 'http://cdn.example.com/file'])(
    'rejects %s',
    (value) => {
      expect(publicResourceSchema.safeParse(value).success).toBe(false)
    }
  )
})
