import { mkdir, symlink, utimes, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createMockConfig, trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { defaultConfig } from '../config/defaults'
import { buildContentGraph } from './graph'

describe('buildContentGraph', () => {
  it.each(['md', 'mdx'])(
    'derives %s navigation and references from compiler plugin output',
    async (extension) => {
      const cwd = await mkdtemp(join(tmpdir(), 'canofold-compiled-graph-'))
      await mkdir(join(cwd, 'docs'))
      await writeFile(join(cwd, 'docs/index.md'), '# Home')
      await writeFile(
        join(cwd, `docs/guide.${extension}`),
        '# Original\n\n[Read](./original.md)\n\n![Picture](./original.svg)'
      )
      const config = createMockConfig()
      type TestNode = { type: string; value?: string; url?: string; children?: TestNode[] }
      config.markdown.plugins = [
        {
          name: 'published-content',
          version: '1',
          remarkPlugins: [
            () => async (tree: TestNode) => {
              const walk = (node: TestNode) => {
                if (node.type === 'heading') node.children = [{ type: 'text', value: 'Published' }]
                if (node.type === 'link') node.url = './published.md'
                if (node.type === 'image') node.url = './published.svg'
                node.children?.forEach(walk)
              }
              walk(tree)
            }
          ]
        }
      ]
      const graph = await buildContentGraph(cwd, config)
      const page = graph.pages.find((item) => item.routePath === '/guide/')!
      expect(page.title).toBe('Published')
      expect(page.headings).toEqual([{ level: 1, text: 'Published', slug: 'published' }])
      expect(page.searchText).toBe('Published Read Picture')
      expect(page.references).toMatchObject({ links: ['./published.md'], images: ['./published.svg'] })
    }
  )
  it('does not invent content dates at a shallow history boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'canofold-shallow-dates-'))
    const origin = join(root, 'origin')
    const cwd = join(root, 'checkout')
    const git = promisify(execFile)
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Canofold Test',
      GIT_AUTHOR_EMAIL: 'test@canofold.invalid',
      GIT_COMMITTER_NAME: 'Canofold Test',
      GIT_COMMITTER_EMAIL: 'test@canofold.invalid'
    }
    await mkdir(join(origin, 'docs'), { recursive: true })
    await writeFile(join(origin, 'docs/index.md'), '# Home')
    await writeFile(join(origin, 'docs/explicit.md'), '---\nupdatedAt: 2026-01-01\n---\n# Explicit')
    await git('git', ['init', '-q'], { cwd: origin })
    await git('git', ['add', '.'], { cwd: origin })
    await git('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'Add documentation'], {
      cwd: origin,
      env: { ...env, GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z' }
    })
    await writeFile(join(origin, 'unrelated.txt'), 'Does not change documentation')
    await git('git', ['add', '.'], { cwd: origin })
    await git('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'Unrelated change'], {
      cwd: origin,
      env: { ...env, GIT_AUTHOR_DATE: '2026-02-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-02-02T00:00:00Z' }
    })
    await git('git', ['clone', '-q', '--depth', '1', pathToFileURL(origin).href, cwd])

    const pages = (await buildContentGraph(cwd, defaultConfig)).pages
    expect(pages.find((page) => page.routePath === '/')?.lastUpdated).toBe('')
    expect(pages.find((page) => page.routePath === '/explicit/')?.lastUpdated).toBe(
      '2026-01-01T00:00:00.000Z'
    )
  })
  it('uses Git content history rather than checkout time, and hides unknown dates for dirty pages', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-git-updated-'))
    const git = promisify(execFile)
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await git('git', ['init', '-q'], { cwd })
    await git('git', ['add', 'docs/index.md'], { cwd })
    await git('git', ['commit', '-qm', 'Add documentation'], {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Canofold Test',
        GIT_AUTHOR_EMAIL: 'test@canofold.invalid',
        GIT_COMMITTER_NAME: 'Canofold Test',
        GIT_COMMITTER_EMAIL: 'test@canofold.invalid',
        GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z'
      }
    })
    await utimes(join(cwd, 'docs/index.md'), new Date('2026-10-09'), new Date('2026-10-09'))

    expect((await buildContentGraph(cwd, defaultConfig)).pages[0]?.lastUpdated).toBe(
      '2026-01-02T00:00:00.000Z'
    )

    await writeFile(join(cwd, 'docs/index.md'), '# Uncommitted change')
    expect((await buildContentGraph(cwd, defaultConfig)).pages[0]?.lastUpdated).toBe('')
  })
  it('keeps drafts out of published builds but includes them when explicitly requested', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-graph-drafts-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/draft.md'), '---\nstatus: draft\n---\n# Work in progress')

    const published = await buildContentGraph(cwd, defaultConfig)
    const authoring = await buildContentGraph(cwd, defaultConfig, undefined, { includeDrafts: true })

    expect(published.pages.map((page) => page.routePath)).toEqual(['/'])
    expect(authoring.pages.find((page) => page.routePath === '/draft/')).toMatchObject({ status: 'draft' })
  })
  it('allows a draft-only home in the local authoring graph', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-draft-home-preview-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '---\nstatus: draft\n---\n# Preview home')

    const authoring = await buildContentGraph(cwd, defaultConfig, undefined, { includeDrafts: true })

    expect(authoring.pages[0]).toMatchObject({ routePath: '/', status: 'draft' })
    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow('Missing published home page')
  })
  it('rejects symbolic links instead of silently omitting documentation', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-graph-symlink-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'target.md'), '# Linked')
    await symlink(join(cwd, 'target.md'), join(cwd, 'docs/linked.md'))

    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow(
      'Documentation content must not use symbolic links: linked.md'
    )
  })

  it('rejects a documentation root symlink that escapes the project', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-graph-root-link-'))
    const external = await mkdtemp(join(tmpdir(), 'canofold-graph-external-'))
    await writeFile(join(external, 'index.md'), '# External')
    await symlink(external, join(cwd, 'docs'))

    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow('must resolve to a path inside')
  })

  it('recognizes Markdown extensions and index names case-insensitively', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-graph-extension-case-'))
    await mkdir(join(cwd, 'docs/Guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/Index.MD'), '# Home')
    await writeFile(join(cwd, 'docs/Guide/Index.MDX'), '# Guide')

    const graph = await buildContentGraph(cwd, defaultConfig)

    expect(graph.pages.map((page) => page.routePath)).toEqual(['/', '/Guide/'])
    expect(graph.pages.map((page) => page.relativePath)).toEqual(['Index.MD', 'Guide/Index.MDX'])
    expect(graph.sidebar.current?.zh).toEqual([
      {
        segment: 'Guide',
        title: 'Guide',
        items: [{ type: 'link', title: 'Guide', routePath: '/Guide/' }]
      }
    ])
  })

  it('uses the docs root for the default locale and locale directories for translations', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-graph-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await mkdir(join(cwd, 'docs/en'), { recursive: true })
    await mkdir(join(cwd, 'docs/public'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '---\ntitle: 首页\n---\n# 首页')
    await writeFile(join(cwd, 'docs/guide.md'), '# 指南')
    await writeFile(join(cwd, 'docs/en/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/public/readme.md'), '# Downloadable asset')

    const graph = await buildContentGraph(
      cwd,
      createMockConfig({
        i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] }
      })
    )

    expect(graph.pages.map((page) => page.routePath)).toEqual(['/', '/guide/', '/en/'])
    const index = graph.pages.find((page) => page.routePath === '/')
    const guide = graph.pages.find((page) => page.routePath === '/guide/')
    expect(index?.headings).toEqual([{ level: 1, text: '首页', slug: '首页' }])
    expect(index?.searchText).toBe('首页')
    expect(index?.locale).toBe('zh')
    expect(index?.relativePath).toBe('index.md')
    expect(index?.sourceRelativePath).toBe('docs/index.md')
    expect(index?.outputPath).toBe('index.html')
    expect(index?.markdownOutputPath).toBe('index.md')
    expect(index?.next).toBeUndefined()
    expect(guide?.previous).toBeUndefined()
  })

  it('keeps explicit default-locale directories compatible and rejects duplicate root routes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-explicit-default-locale-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 兼容首页')

    const compatible = await buildContentGraph(cwd, defaultConfig)
    expect(compatible.pages[0]).toMatchObject({
      locale: 'zh',
      relativePath: 'zh/index.md',
      routePath: '/'
    })

    await writeFile(join(cwd, 'docs/index.md'), '# 根目录首页')
    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow('Duplicate route target')
  })

  it('orders sidebar pages by frontmatter order with index first', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-order-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\norder: 0\n---\n# 首页')
    await writeFile(join(cwd, 'docs/zh/ai.md'), '---\ntitle: AI\norder: 30\n---\n# AI')
    await writeFile(
      join(cwd, 'docs/zh/getting-started.md'),
      '---\ntitle: 快速开始\norder: 10\n---\n# 快速开始'
    )
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 指南\norder: 20\n---\n# 指南')

    const graph = await buildContentGraph(
      cwd,
      createMockConfig({
        i18n: { defaultLocale: 'zh', locales: ['zh'] }
      })
    )

    expect(graph.pages.map((page) => page.routePath)).toEqual(['/', '/getting-started/', '/guide/', '/ai/'])
    expect(graph.pages.find((page) => page.routePath === '/getting-started/')?.next).toEqual({
      title: '指南',
      routePath: '/guide/'
    })
    expect(graph.pages.find((page) => page.routePath === '/guide/')?.previous).toEqual({
      title: '快速开始',
      routePath: '/getting-started/'
    })
  })

  it('builds grouped sidebar and top nav from subdirectories', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-group-'))
    await mkdir(join(cwd, 'docs/zh/guide'), { recursive: true })
    await mkdir(join(cwd, 'docs/zh/reference'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 介绍\norder: 0\n---\n# 介绍')
    await writeFile(
      join(cwd, 'docs/zh/guide/start.md'),
      '---\ntitle: 开始\ngroup: 指南\norder: 1\n---\n# 开始'
    )
    await writeFile(
      join(cwd, 'docs/zh/reference/cli.md'),
      '---\ntitle: CLI\ngroup: 参考\norder: 2\n---\n# CLI'
    )
    await writeFile(
      join(cwd, 'docs/zh/reference/markdown.md'),
      '---\ntitle: Markdown 元素\ngroup: 参考\norder: 1\nsidebar: false\n---\n# Markdown 元素'
    )

    const graph = await buildContentGraph(
      cwd,
      createMockConfig({
        i18n: { defaultLocale: 'zh', locales: ['zh'] }
      })
    )

    expect(graph.sidebar.current?.zh).toEqual([
      {
        segment: 'guide',
        title: '指南',
        items: [{ type: 'link', title: '开始', routePath: '/guide/start/' }]
      },
      {
        segment: 'reference',
        title: '参考',
        items: [{ type: 'link', title: 'CLI', routePath: '/reference/cli/' }]
      }
    ])
    expect(graph.nav.current?.zh).toEqual([
      { title: '指南', routePath: '/guide/start/' },
      { title: '参考', routePath: '/reference/cli/' }
    ])
    expect(graph.pages.map((page) => page.routePath)).toContain('/reference/markdown/')
  })

  it('supports a third locale with its own translated navigation', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-third-locale-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/ja/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 首页')
    await writeFile(join(cwd, 'docs/ja/index.md'), '# ホーム')
    await writeFile(
      join(cwd, 'docs/ja/guide/start.md'),
      '---\ntitle: はじめに\ngroup: ガイド\n---\n# はじめに'
    )

    const graph = await buildContentGraph(
      cwd,
      createMockConfig({
        i18n: { defaultLocale: 'zh', locales: ['zh', 'ja'] }
      })
    )

    expect(graph.pages.map((page) => page.routePath)).toEqual(['/', '/ja/', '/ja/guide/start/'])
    expect(graph.nav.current?.ja).toEqual([{ title: 'ガイド', routePath: '/ja/guide/start/' }])
  })

  it('rejects inconsistent translated group names inside one locale directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-group-name-'))
    await mkdir(join(cwd, 'docs/zh/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 首页')
    await writeFile(join(cwd, 'docs/zh/guide/start.md'), '---\ntitle: 开始\ngroup: 指南\n---\n# 开始')
    await writeFile(join(cwd, 'docs/zh/guide/next.md'), '---\ntitle: 下一步\ngroup: 教程\n---\n# 下一步')

    await expect(
      buildContentGraph(
        cwd,
        createMockConfig({
          i18n: { defaultLocale: 'zh', locales: ['zh'] }
        })
      )
    ).rejects.toThrow('Inconsistent group name')
  })

  it('rejects pages that target the same route', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-conflict-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 首页')
    await writeFile(join(cwd, 'docs/zh/intro.md'), '# Intro')
    await writeFile(join(cwd, 'docs/zh/intro.mdx'), '# Intro MDX')

    await expect(
      buildContentGraph(
        cwd,
        createMockConfig({
          i18n: { defaultLocale: 'zh', locales: ['zh'] }
        })
      )
    ).rejects.toThrow('Duplicate route target /intro/')
  })

  it('renders recursive sidebar groups at arbitrary content depths', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-depth-'))
    await mkdir(join(cwd, 'docs/zh/guide/advanced'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 首页')
    await writeFile(
      join(cwd, 'docs/zh/guide/advanced/index.md'),
      '---\ntitle: 进阶指南\ngroup: 指南\norder: 1\ncollapsed: true\n---\n# 进阶指南'
    )
    await writeFile(
      join(cwd, 'docs/zh/guide/advanced/cache.md'),
      '---\ntitle: 缓存\ngroup: 指南\norder: 2\n---\n# 缓存'
    )

    const graph = await buildContentGraph(cwd, defaultConfig)
    expect(graph.sidebar.current?.zh?.[0]).toEqual({
      segment: 'guide',
      title: '指南',
      items: [
        {
          type: 'group',
          segment: 'advanced',
          title: '进阶指南',
          collapsed: true,
          items: [
            { type: 'link', title: '进阶指南', routePath: '/guide/advanced/' },
            { type: 'link', title: '缓存', routePath: '/guide/advanced/cache/' }
          ]
        }
      ]
    })

    await mkdir(join(cwd, 'docs/zh/guide/advanced/security'), { recursive: true })
    await writeFile(
      join(cwd, 'docs/zh/guide/advanced/security/index.md'),
      '---\ntitle: 安全\ncollapsed: true\n---\n# 安全'
    )
    await writeFile(join(cwd, 'docs/zh/guide/advanced/security/csp.md'), '# CSP')
    const deepGraph = await buildContentGraph(cwd, defaultConfig)
    expect(deepGraph.sidebar.current?.zh?.[0]?.items).toEqual([
      {
        type: 'group',
        segment: 'advanced',
        title: '进阶指南',
        collapsed: true,
        items: [
          { type: 'link', title: '进阶指南', routePath: '/guide/advanced/' },
          { type: 'link', title: '缓存', routePath: '/guide/advanced/cache/' },
          {
            type: 'group',
            segment: 'security',
            title: '安全',
            collapsed: true,
            items: [
              { type: 'link', title: '安全', routePath: '/guide/advanced/security/' },
              { type: 'link', title: 'CSP', routePath: '/guide/advanced/security/csp/' }
            ]
          }
        ]
      }
    ])
  })

  it('keeps subgroups distinct when translated display titles are the same', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-subgroup-identity-'))
    await mkdir(join(cwd, 'docs/zh/guide/one'), { recursive: true })
    await mkdir(join(cwd, 'docs/zh/guide/two'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/zh/guide/one/index.md'), '---\ntitle: Shared\n---\n# One')
    await writeFile(join(cwd, 'docs/zh/guide/two/index.md'), '---\ntitle: Shared\n---\n# Two')

    const graph = await buildContentGraph(cwd, defaultConfig)
    const firstGroup = graph.sidebar.current?.zh?.[0]
    expect(firstGroup).toBeDefined()
    const subgroups = firstGroup?.items.filter((item) => item.type === 'group') ?? []
    expect(subgroups).toHaveLength(2)
    expect(subgroups.map((item) => item.segment)).toEqual(['one', 'two'])
  })

  it('requires a published home page for every configured version and locale', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-home-invariant-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/en'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/en/guide.md'), '# Guide')

    await expect(
      buildContentGraph(
        cwd,
        createMockConfig({
          i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] }
        })
      )
    ).rejects.toThrow('Missing published home page for version "current" locale "en"')
  })

  it('uses explicit localized navigation and builds independent version routes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-versions-'))
    await mkdir(join(cwd, 'docs/zh/guide'), { recursive: true })
    await mkdir(join(cwd, 'versions/v1/zh/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 当前')
    await writeFile(join(cwd, 'docs/zh/guide/start.md'), '# 开始')
    await writeFile(join(cwd, 'versions/v1/zh/index.md'), '# 旧版')
    await writeFile(join(cwd, 'versions/v1/zh/guide/start.md'), '# 旧版开始')

    const graph = await buildContentGraph(
      cwd,
      createMockConfig({
        navigation: { zh: [{ text: '产品指南', link: '/guide/' }] },
        versions: {
          current: 'v2',
          items: [
            { id: 'v2', label: '2.x', docsDir: 'docs', base: '/' },
            { id: 'v1', label: '1.x', docsDir: 'versions/v1', base: '/v1/' }
          ]
        }
      })
    )

    expect(graph.nav.v2?.zh).toEqual([{ title: '产品指南', routePath: '/guide/start/' }])
    expect(graph.nav.v1?.zh).toEqual([{ title: '产品指南', routePath: '/v1/guide/start/' }])
    expect(graph.pages.map((page) => page.routePath)).toEqual([
      '/',
      '/guide/start/',
      '/v1/',
      '/v1/guide/start/'
    ])
  })

  it('versions explicit active paths for flat pages and validates their targets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-nav-active-paths-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/button.md'), '# Button')
    await writeFile(join(cwd, 'docs/notice.md'), '# Notice')
    const config = createMockConfig({
      navigation: { zh: [{ text: 'Components', link: '/button/', activePaths: ['/notice/'] }] }
    })
    const graph = await buildContentGraph(cwd, config)
    expect(graph.nav.current?.zh).toEqual([
      { title: 'Components', routePath: '/button/', activePaths: ['/notice/'] }
    ])
    config.navigation.zh![0]!.activePaths = ['/missing/']
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('Navigation target is not a generated page')
  })

  it('keeps external HTTPS navigation unchanged for historical versions regardless of scheme case', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-external-nav-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'versions/v1/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Current')
    await writeFile(join(cwd, 'versions/v1/zh/index.md'), '# Historical')

    const graph = await buildContentGraph(
      cwd,
      createMockConfig({
        navigation: { zh: [{ text: 'External', link: 'HTTPS://example.com/docs' }] },
        versions: {
          current: 'v2',
          items: [
            { id: 'v2', label: '2.x', docsDir: 'docs', base: '/' },
            { id: 'v1', label: '1.x', docsDir: 'versions/v1', base: '/v1/' }
          ]
        }
      })
    )

    expect(graph.nav.v2?.zh).toEqual([{ title: 'External', routePath: 'HTTPS://example.com/docs' }])
    expect(graph.nav.v1?.zh).toEqual([{ title: 'External', routePath: 'HTTPS://example.com/docs' }])
  })

  it('rejects explicit navigation links to missing generated pages', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-nav-target-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 首页')
    await expect(
      buildContentGraph(
        cwd,
        createMockConfig({
          navigation: { zh: [{ text: '丢失页面', link: '/missing/' }] }
        })
      )
    ).rejects.toThrow('Navigation target is not a generated page')
  })

  it('rejects misspelled status and malformed landing-page collections', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-frontmatter-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const page = join(cwd, 'docs/zh/index.md')
    await writeFile(page, '---\nstatus: publshed\n---\n# Home')
    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow()

    await writeFile(page, '---\nfeatures:\n  - null\n---\n# Home')
    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow()

    await writeFile(page, '---\nlayout: split-pane\n---\n# Home')
    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow()
  })

  it('preserves the explicit playground page layout', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-playground-frontmatter-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await writeFile(
      join(cwd, 'docs/zh/playground.md'),
      '---\ntitle: Playground\nlayout: playground\n---\n# Source'
    )

    const graph = await buildContentGraph(cwd, defaultConfig)

    expect(graph.pages.find((page) => page.routePath === '/playground/')?.frontmatter.layout).toBe(
      'playground'
    )
  })

  it('normalizes frontmatter dates and prefers updatedAt over the file modification time', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-frontmatter-dates-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(
      join(cwd, 'docs/zh/index.md'),
      '---\ncreatedAt: 2026-01-02\nupdatedAt: 2026-08-14T09:30:00+08:00\n---\n# Home'
    )

    const graph = await buildContentGraph(cwd, defaultConfig)
    const page = graph.pages.find((candidate) => candidate.routePath === '/')

    expect(page?.frontmatter.createdAt).toBe('2026-01-02T00:00:00.000Z')
    expect(page?.frontmatter.updatedAt).toBe('2026-08-14T01:30:00.000Z')
    expect(page?.lastUpdated).toBe('2026-08-14T01:30:00.000Z')
  })

  it('rejects invalid frontmatter dates', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-invalid-frontmatter-date-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\nupdatedAt: yesterday\n---\n# Home')

    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow('Expected an ISO 8601 date')

    await writeFile(join(cwd, 'docs/zh/index.md'), '---\nupdatedAt: 01/02/2020\n---\n# Home')
    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow('Expected an ISO 8601 date')
  })

  it.each([
    ['hero image', 'hero:\n  image: "javascript:alert(1)"'],
    ['hero action', 'hero:\n  actions:\n    - text: Unsafe\n      link: "javascript:alert(1)"']
  ])('rejects an unsafe %s URL', async (_label, frontmatter) => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-unsafe-hero-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), `---\n${frontmatter}\n---\n# Home`)

    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow(
      'Resource must be an absolute site path or HTTPS URL'
    )
  })

  it.each([
    ['hero action icon', 'hero:\n  actions:\n    - text: Start\n      link: /guide/\n      icon: unknown'],
    ['feature icon', 'features:\n  - title: Fast\n    details: Static output\n    icon: unknown']
  ])('rejects an unknown home-page %s', async (_label, frontmatter) => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-home-icon-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), `---\n${frontmatter}\n---\n# Home`)

    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow()
  })

  it('rejects more than one primary home-page action', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-home-primary-action-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(
      join(cwd, 'docs/zh/index.md'),
      '---\nhero:\n  actions:\n    - text: Guide\n      link: /guide/\n      primary: true\n    - text: API\n      link: /api/\n      primary: true\n---\n# Home'
    )

    await expect(buildContentGraph(cwd, defaultConfig)).rejects.toThrow(
      'Home page hero actions can contain at most one primary action'
    )
  })
})
