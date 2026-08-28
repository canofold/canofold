import { describe, expect, it } from 'vitest'
import type { LanguageInput } from '@shikijs/types'
import { normalizeOptions } from './normalizeOptions'

describe('normalizeOptions', () => {
  it('preserves an already normalized language map for highlighter cache identity', () => {
    const languages = {
      custom: (() => Promise.resolve({ default: [] })) as LanguageInput
    }

    expect(normalizeOptions({ code: { languages } }).codeLanguages).toBe(languages)
  })

  it('normalizes custom fence names when needed', () => {
    const input = (() => Promise.resolve({ default: [] })) as LanguageInput
    const normalized = normalizeOptions({ code: { languages: { ' Custom ': input } } })

    expect(normalized.codeLanguages).toEqual({ custom: input })
  })
})
