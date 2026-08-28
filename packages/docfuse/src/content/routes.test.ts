import { describe, expect, it } from 'vitest'
import {
  canonicalRoutePath,
  htmlOutputPathFor,
  localeRelativePathFor,
  localeRootPath,
  markdownOutputPathFor,
  routeOutputPathFor,
  routePathFor
} from './routes'

describe('content routes', () => {
  it('normalizes both root and explicit locale source layouts to one locale-relative path', () => {
    expect(localeRelativePathFor('guide/start.md', 'zh')).toBe('guide/start.md')
    expect(localeRelativePathFor('zh/guide/start.md', 'zh')).toBe('guide/start.md')
    expect(localeRelativePathFor('en/guide/start.md', 'zh')).toBe('en/guide/start.md')
    expect(localeRelativePathFor('zh\\guide\\start.md', 'zh')).toBe('guide/start.md')
  })

  it('combines version and locale prefixes without changing the current default locale', () => {
    expect(localeRootPath('zh', 'zh')).toBe('/')
    expect(localeRootPath('en', 'zh')).toBe('/en/')
    expect(localeRootPath('zh', 'zh', '/v1/')).toBe('/v1/')
    expect(localeRootPath('en', 'zh', '/v1/')).toBe('/v1/en/')
    expect(routePathFor('en', 'zh', 'guide/start.md', '/v1/')).toBe('/v1/en/guide/start/')
    expect(htmlOutputPathFor('en', 'zh', 'guide/start.md', '/v1/')).toBe('v1/en/guide/start/index.html')
    expect(markdownOutputPathFor('en', 'zh', 'guide/start.md', '/v1/')).toBe('v1/en/guide/start/index.md')
    expect(routePathFor('zh', 'zh', 'guide/advanced/index.md')).toBe('/guide/advanced/')
    expect(htmlOutputPathFor('zh', 'zh', 'guide/advanced/index.md')).toBe('guide/advanced/index.html')
  })

  it('maps an absolute redirect route to a static output path', () => {
    expect(routeOutputPathFor('/old/guide/')).toBe('old/guide/index.html')
    expect(routeOutputPathFor('/old%20guide/')).toBe('old guide/index.html')
    expect(routeOutputPathFor('/%E6%97%A7%E7%89%88/')).toBe('旧版/index.html')
  })

  it('encodes each source path segment without collapsing literal percent escapes', () => {
    expect(routePathFor('zh', 'zh', 'foo bar.md')).toBe('/foo%20bar/')
    expect(routePathFor('zh', 'zh', 'foo%20bar.md')).toBe('/foo%2520bar/')
    expect(routePathFor('zh', 'zh', 'foo%2Fbar.md')).toBe('/foo%252Fbar/')
    expect(htmlOutputPathFor('zh', 'zh', 'foo bar.md')).toBe('foo bar/index.html')
    expect(htmlOutputPathFor('zh', 'zh', 'foo%20bar.md')).toBe('foo%20bar/index.html')
  })

  it('rejects routes that can escape or change URL semantics', () => {
    for (const route of [
      '../../escape/',
      '/../../escape/',
      '/guide/?draft=1',
      '/guide/#title',
      '//guide/',
      '/guide//start/',
      '/encoded%00null/',
      '/encoded%0Aline/'
    ]) {
      expect(() => routeOutputPathFor(route)).toThrow('Invalid route path')
    }
  })

  it('canonicalizes authored Unicode and percent escapes segment by segment', () => {
    expect(canonicalRoutePath('/文档/快速 开始/')).toBe(
      '/%E6%96%87%E6%A1%A3/%E5%BF%AB%E9%80%9F%20%E5%BC%80%E5%A7%8B/'
    )
    expect(canonicalRoutePath('/%E6%96%87%E6%A1%A3/')).toBe('/%E6%96%87%E6%A1%A3/')
  })
})
