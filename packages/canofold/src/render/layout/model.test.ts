import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../config/defaults'
import { createMockConfig, createMockGraph, createMockPage } from '../../../test/fixtures'
import { createLayoutModel } from './model'

describe('createLayoutModel', () => {
  it('matches a root default-locale page with its locale-directory translation', () => {
    const zh = createMockPage({ locale: 'zh', relativePath: 'guide/start.md', routePath: '/guide/start/' })
    const en = createMockPage({
      locale: 'en',
      relativePath: 'en/guide/start.md',
      routePath: '/en/guide/start/'
    })
    const graph = createMockGraph({
      pages: [zh, en],
      sidebar: { current: { zh: [], en: [] } },
      nav: { current: { zh: [], en: [] } },
      locales: ['zh', 'en'],
      defaultLocale: 'zh'
    })

    const model = createLayoutModel({
      config: createMockConfig({
        i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] }
      }),
      graph,
      page: zh,
      home: false,
      assets: { behaviors: [], math: false, pluginClients: [], pluginStyles: [] },
      rawSource: 'test'
    })

    expect(model.languageOptions).toEqual([
      { locale: 'zh', routePath: '/guide/start/' },
      { locale: 'en', routePath: '/en/guide/start/' }
    ])
    expect(model.outlineHeadings).toEqual([{ level: 1, text: 'Guide', slug: 'guide' }])
  })

  it('uses the locale brand tagline instead of the global description', () => {
    const en = createMockPage({
      locale: 'en',
      relativePath: 'en/guide/start.md',
      routePath: '/en/guide/start/'
    })
    const graph = createMockGraph({
      pages: [en],
      sidebar: { current: { en: [] } },
      nav: { current: { en: [] } },
      locales: ['en'],
      defaultLocale: 'en'
    })

    const model = createLayoutModel({
      config: createMockConfig({
        description: 'Global description',
        i18n: {
          defaultLocale: 'en',
          locales: ['en'],
          messages: { en: { brandTagline: 'Localized brand tagline' } }
        }
      }),
      graph,
      page: en,
      home: false,
      assets: { behaviors: [], math: false, pluginClients: [], pluginStyles: [] },
      rawSource: 'test'
    })

    expect(model.brandTagline).toBe('Localized brand tagline')
  })

  it('targets the locale Markdown Playground for showcase quick actions', () => {
    const page = createMockPage({ locale: 'zh', relativePath: 'guide/start.md', routePath: '/guide/start/' })
    const playground = createMockPage({
      locale: 'zh',
      relativePath: 'markdown/playground.md',
      routePath: '/markdown/playground/'
    })
    const graph = createMockGraph({
      pages: [page, playground],
      sidebar: { current: { zh: [] } },
      nav: { current: { zh: [] } }
    })

    const model = createLayoutModel({
      config: defaultConfig,
      graph,
      page,
      home: false,
      assets: { behaviors: [], math: false, pluginClients: [], pluginStyles: [] },
      rawSource: 'test'
    })

    expect(model.hasMarkdownShowcase).toBe(true)
    expect(model.markdownShowcaseHref).toBe('/markdown/playground/')
  })

  it('does not repeat the site title for a same-named home page', () => {
    const homePage = {
      ...createMockPage({ locale: 'zh', relativePath: 'index.md', routePath: '/' }),
      title: 'Canofold'
    }
    const graph = createMockGraph({
      pages: [homePage],
      sidebar: { current: { zh: [] } },
      nav: { current: { zh: [] } }
    })

    const model = createLayoutModel({
      config: defaultConfig,
      graph,
      page: homePage,
      home: true,
      assets: { behaviors: [], math: false, pluginClients: [], pluginStyles: [] },
      rawSource: 'test'
    })

    expect(model.title).toBe('Canofold')
  })

  it('uses an explicit SEO title without changing the rendered page title', () => {
    const homePage = {
      ...createMockPage({
        locale: 'zh',
        relativePath: 'index.md',
        routePath: '/',
        frontmatter: { seoTitle: 'Canofold｜面向代码仓库的静态文档站点生成器' }
      }),
      title: 'Canofold'
    }
    const graph = createMockGraph({
      pages: [homePage],
      sidebar: { current: { zh: [] } },
      nav: { current: { zh: [] } }
    })

    const model = createLayoutModel({
      config: defaultConfig,
      graph,
      page: homePage,
      home: true,
      assets: { behaviors: [], math: false, pluginClients: [], pluginStyles: [] },
      rawSource: 'test'
    })

    expect(model.title).toBe('Canofold｜面向代码仓库的静态文档站点生成器')
    expect(model.page.title).toBe('Canofold')
  })

  it('accepts both cleanup functions and dispose objects from plugin clients', () => {
    const homePage = createMockPage({ locale: 'zh', relativePath: 'index.md', routePath: '/' })
    const graph = createMockGraph({
      pages: [homePage],
      sidebar: { current: { zh: [] } },
      nav: { current: { zh: [] } }
    })
    const model = createLayoutModel({
      config: defaultConfig,
      graph,
      page: homePage,
      home: true,
      assets: { behaviors: [], math: false, pluginClients: [], pluginStyles: [] },
      rawSource: 'test'
    })

    expect(model.markdownClientScript).toContain("typeof enhancement === 'function'")
    expect(model.markdownClientScript).toContain('enhancement?.dispose')
    expect(model.markdownClientScript).toContain('window.__canofoldEnhanceMarkdown')
    expect(model.markdownClientScript).toContain('window.__canofoldMarkdownReady = ready')
    expect(model.markdownClientScript).toContain('await enhancement?.ready')
    expect(() => new Function(model.markdownClientScript)).not.toThrow()
  })
})
