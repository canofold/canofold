import { describe, expect, it } from 'vitest'
import { createPageUrlTransform } from './transformUrls'

describe('page URL base paths', () => {
  it('prefixes root-relative URLs exactly once', () => {
    const transform = createPageUrlTransform(
      '/project/',
      []
    )({ version: 'current', relativePath: 'index.md', outputPath: 'index.html' })

    expect(transform('/guide/', 'href')).toBe('/project/guide/')
    expect(transform('/project/guide/', 'href')).toBe('/project/guide/')
    expect(transform('/project', 'href')).toBe('/project')
    expect(transform('/project?mode=read', 'href')).toBe('/project?mode=read')
    expect(transform('/project#api', 'href')).toBe('/project#api')
  })

  it('preserves relative, external, protocol-relative, data, and fragment URLs', () => {
    const transform = createPageUrlTransform(
      '/project/',
      []
    )({ version: 'current', relativePath: 'index.md', outputPath: 'index.html' })

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

describe('createPageUrlTransform', () => {
  const pages = [
    { version: 'current', relativePath: 'guide/start.md', routePath: '/guide/start/' },
    { version: 'current', relativePath: 'guide/next.mdx', routePath: '/guide/next/' },
    { version: 'current', relativePath: 'index.md', routePath: '/' },
    { version: 'v1', relativePath: 'guide/start.md', routePath: '/v1/guide/start/' },
    { version: 'v1', relativePath: 'guide/next.mdx', routePath: '/v1/guide/next/' },
    { version: 'current', relativePath: 'zh/指南.md', routePath: '/zh/%E6%8C%87%E5%8D%97/' }
  ].map((page) => ({ ...page, outputPath: `${page.routePath.slice(1)}index.html` }))

  it('resolves source-relative Markdown links to HTML while preserving suffixes and version boundaries', () => {
    const forPage = createPageUrlTransform('/project/', pages)
    const transform = forPage(pages[0]!)
    expect(transform('./next.mdx?mode=read#api', 'href')).toBe('/project/guide/next/?mode=read#api')
    expect(transform('./next.MDX', 'href')).toBe('/project/guide/next/')
    expect(transform('../index.md', 'href')).toBe('/project/')
    expect(transform('./next#api', 'href')).toBe('/project/guide/next/#api')
    expect(transform('../', 'href')).toBe('/project/')
    expect(transform('../zh/%E6%8C%87%E5%8D%97.md', 'href')).toBe('/project/zh/%E6%8C%87%E5%8D%97/')
    expect(forPage(pages[3]!)('./next.mdx#api', 'href')).toBe('/project/v1/guide/next/#api')
    expect(forPage(pages[3]!)('../zh/指南.md', 'href')).toBe('../zh/指南.md')
  })

  it('does not rewrite assets, explicit mirror routes, external URLs, or invalid/missing references', () => {
    const transform = createPageUrlTransform('/', pages)(pages[0]!)
    for (const value of [
      './figure.svg',
      './missing.md',
      './%zz.md',
      './foo%2Fnext.mdx',
      '/guide/next/index.md',
      'https://example.com/next.md',
      '#api'
    ]) {
      expect(transform(value, 'href')).toBe(value)
    }
    expect(transform('./next.mdx', 'src')).toBe('./next.mdx')
  })
})
