import { describe, expect, it } from 'vitest'
import { sanitizeMarkdownUrl, transformMarkdownSrcSet, transformMarkdownUrlProps } from './urlTransform'

describe('Markdown URL safety', () => {
  it('allows web, communication, relative, query, fragment, and protocol-relative URLs', () => {
    for (const value of [
      'https://example.com/docs',
      'http://example.com/docs',
      'mailto:docs@example.com',
      'tel:+15551234567',
      '/guide/',
      './guide',
      '../guide',
      '?view=full',
      '#install',
      '//cdn.example.com/image.png'
    ]) {
      expect(sanitizeMarkdownUrl(value)).toBe(value)
    }
  })

  it('rejects executable and local URL protocols including browser-normalized variants', () => {
    for (const value of [
      'javascript:alert(1)',
      ' JAVASCRIPT:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      '\u0000javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'blob:https://example.com/id'
    ]) {
      expect(sanitizeMarkdownUrl(value)).toBeUndefined()
    }
  })

  it('sanitizes authored and transformed URL properties', () => {
    expect(
      transformMarkdownUrlProps({
        href: 'javascript:alert(1)',
        src: '/safe.png',
        poster: 'data:text/html,unsafe'
      })
    ).toEqual({ src: '/safe.png' })

    expect(transformMarkdownUrlProps({ href: '/redirect' }, () => 'javascript:alert(2)')).toEqual({})
  })

  it('drops unsafe srcSet candidates without damaging safe descriptors', () => {
    expect(
      transformMarkdownSrcSet(
        '/small.png 1x, javascript:alert(1) 2x, https://cdn.example.com/large.png 3x',
        (value) => value
      )
    ).toBe('/small.png 1x, https://cdn.example.com/large.png 3x')
  })

  it('preserves commas that belong to a srcSet URL', () => {
    expect(
      transformMarkdownSrcSet(
        'https://cdn.example.com/a,b.png 1x, https://cdn.example.com/c.png 2x',
        (value) => value
      )
    ).toBe('https://cdn.example.com/a,b.png 1x, https://cdn.example.com/c.png 2x')
  })

  it('handles descriptorless candidates and empty separators', () => {
    expect(transformMarkdownSrcSet('/first.png, /second.png')).toBe('/first.png, /second.png')
    expect(transformMarkdownSrcSet(' , , ')).toBe('')
  })

  it('sanitizes both React and HTML spellings of srcSet', () => {
    expect(
      transformMarkdownUrlProps({
        srcSet: 'javascript:alert(1) 1x',
        srcset: '/safe.png 2x'
      })
    ).toEqual({ srcset: '/safe.png 2x' })

    expect(transformMarkdownUrlProps({ srcSet: '/before.png 1x' }, () => '/after.png')).toEqual({
      srcSet: '/after.png 1x'
    })
  })
})
