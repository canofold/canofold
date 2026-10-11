import { describe, expect, it } from 'vitest'
import { createPagefindSearchDocument, highlightSearchText } from './searchClient'

describe('search client helpers', () => {
  it('highlights matching text while escaping indexed content', () => {
    expect(highlightSearchText('<script>插件</script>', '插件')).toBe(
      '&lt;script&gt;<mark>插件</mark>&lt;/script&gt;'
    )
  })

  it('highlights useful terms when a multi-word query is split across a result', () => {
    expect(
      highlightSearchText('Deploy with Cloudflare and GitHub Pages', 'Cloudflare Pages deployment')
    ).toBe('Deploy with <mark>Cloudflare</mark> and GitHub <mark>Pages</mark>')
  })

  it('uses the matching Pagefind heading as the result destination', () => {
    expect(
      createPagefindSearchDocument('插件', {
        url: '/guide/site/configuration/',
        meta: { title: '配置参考' },
        plain_excerpt: '站点的基础配置。',
        sub_results: [
          {
            title: '导航配置',
            url: '/guide/site/configuration/#navigation',
            plain_excerpt: '设置站点顶部导航。'
          },
          {
            title: '插件配置',
            url: '/guide/site/configuration/#plugins',
            plain_excerpt: '从统一入口启用官方插件。'
          }
        ]
      })
    ).toEqual({
      title: '配置参考',
      description: '插件配置 · 从统一入口启用官方插件。',
      excerpt: '从统一入口启用官方插件。',
      routePath: '/guide/site/configuration/#plugins'
    })
  })

  it('does not repeat the page heading at the start of its excerpt', () => {
    expect(
      createPagefindSearchDocument('插件', {
        url: '/guide/plugins/',
        meta: { title: '官方插件' },
        sub_results: [
          {
            title: '官方插件',
            url: '/guide/plugins/#official-plugins',
            plain_excerpt: '官方插件. Canofold 通过统一入口启用插件。'
          }
        ]
      })
    ).toEqual({
      title: '官方插件',
      description: 'Canofold 通过统一入口启用插件。',
      excerpt: 'Canofold 通过统一入口启用插件。',
      routePath: '/guide/plugins/#official-plugins'
    })
  })

  it('omits Pagefind results that cannot visibly explain the match', () => {
    expect(
      createPagefindSearchDocument('插件', {
        url: '/guide/theme/',
        meta: { title: '定制主题', description: '配色、字体和间距' },
        plain_excerpt: '品牌 Logo、文件类型与代码高亮。'
      })
    ).toBeUndefined()
  })

  it('shows the matching excerpt when page metadata does not explain the match', () => {
    expect(
      createPagefindSearchDocument('插件', {
        url: '/guide/theme/',
        meta: { title: '定制主题', description: '配置配色、字体、间距和圆角' },
        plain_excerpt: '品牌图标不会覆盖插件提供的语义内容。'
      })
    ).toEqual({
      title: '定制主题',
      description: '品牌图标不会覆盖插件提供的语义内容。',
      excerpt: '品牌图标不会覆盖插件提供的语义内容。',
      routePath: '/guide/theme/'
    })
  })

  it('keeps a Pagefind result when query terms occur in different matching sections', () => {
    expect(
      createPagefindSearchDocument('Cloudflare Pages 部署', {
        url: '/guide/delivery/deployment/',
        meta: { title: '部署静态站点' },
        excerpt: '<mark>部署</mark>静态站点。',
        sub_results: [
          {
            title: '部署静态站点',
            url: '/guide/delivery/deployment/#intro',
            excerpt: '<mark>部署</mark>静态站点。'
          },
          {
            title: '平台参数',
            url: '/guide/delivery/deployment/#platforms',
            excerpt: 'GitHub <mark>Pages</mark> 与 <mark>Cloudflare</mark> <mark>Pages</mark>。'
          }
        ]
      })
    ).toEqual({
      title: '部署静态站点',
      description: '平台参数 · GitHub Pages 与 Cloudflare Pages。',
      excerpt: 'GitHub Pages 与 Cloudflare Pages。',
      routePath: '/guide/delivery/deployment/#platforms'
    })
  })

  it('keeps a Pagefind typo match with a meaningful highlighted excerpt', () => {
    expect(
      createPagefindSearchDocument('component demostration', {
        url: '/en/guide/writing/component-demos/',
        meta: { title: 'Build component demos with Vite' },
        excerpt: 'Build <mark>component</mark> <mark>demos</mark> with Vite.'
      })
    ).toEqual({
      title: 'Build component demos with Vite',
      description: 'Build component demos with Vite.',
      excerpt: 'Build component demos with Vite.',
      routePath: '/en/guide/writing/component-demos/'
    })
  })

  it('rejects a long unmatched query that Pagefind only matched to one character', () => {
    expect(
      createPagefindSearchDocument('zzqxyvnotapage93821', {
        url: '/reference/configuration/frontmatter/',
        meta: { title: 'Frontmatter 参考' },
        excerpt: '日期应包含 <mark>Z</mark> 或 +08:00。',
        sub_results: [
          {
            title: '日期字段',
            url: '/reference/configuration/frontmatter/#dates',
            excerpt: '日期应包含 <mark>Z</mark> 或 +08:00。'
          }
        ]
      })
    ).toBeUndefined()
  })
})
