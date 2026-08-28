import { describe, expect, it } from 'vitest'
import { createPagefindSearchDocument, highlightSearchText, rankSearchDocuments } from './searchClient'

describe('search client helpers', () => {
  it('promotes title matches without discarding Pagefind ordering', () => {
    const ranked = rankSearchDocuments('插件', [
      {
        title: '定制主题',
        description: '配置站点主题',
        excerpt: '主题也可以由插件扩展',
        routePath: '/guide/theme/'
      },
      {
        title: '官方插件',
        description: '按需启用插件能力',
        excerpt: '插件统一从包根导入',
        routePath: '/guide/plugins/'
      }
    ])

    expect(ranked.map((item) => item.title)).toEqual(['官方插件', '定制主题'])
  })

  it('highlights matching text while escaping indexed content', () => {
    expect(highlightSearchText('<script>插件</script>', '插件')).toBe(
      '&lt;script&gt;<mark>插件</mark>&lt;/script&gt;'
    )
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
            plain_excerpt: '官方插件. Docfuse 通过统一入口启用插件。'
          }
        ]
      })
    ).toEqual({
      title: '官方插件',
      description: 'Docfuse 通过统一入口启用插件。',
      excerpt: 'Docfuse 通过统一入口启用插件。',
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
})
