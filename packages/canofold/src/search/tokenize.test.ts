import { describe, expect, it } from 'vitest'
import { tokenize } from './tokenize'

describe('tokenize', () => {
  it('tokenizes English words and Chinese n-grams', () => {
    const tokens = tokenize('Hello Canofold 中文搜索')

    expect(tokens).toContain('hello')
    expect(tokens).toContain('canofold')
    expect(tokens).toContain('中文')
    expect(tokens).toContain('搜索')
  })

  it('deduplicates tokens and supports Han characters outside the basic CJK block', () => {
    expect(tokenize('Canofold canofold')).toEqual(['canofold'])
    expect(tokenize('𠀀文')).toContain('𠀀文')
  })

  it('does not create CJK n-grams across non-CJK separators', () => {
    const tokens = tokenize('你好 foo 世界')
    expect(tokens).toContain('你好')
    expect(tokens).toContain('世界')
    expect(tokens).toContain('你')
    expect(tokens).not.toContain('好世')
  })
})
