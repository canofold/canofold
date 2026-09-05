import { describe, expect, it } from 'vitest'
import { defineConfig } from './define'

describe('defineConfig', () => {
  it('returns the authored configuration unchanged', () => {
    const config = { title: 'Docs', markdown: { html: 'sanitize' as const } }

    expect(defineConfig(config)).toBe(config)
  })
})
