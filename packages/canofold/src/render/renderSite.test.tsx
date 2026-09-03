import { access, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMockGraph, createMockPage, trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { defaultConfig } from '../config/defaults'
import { copyRequiredMathFonts, renderSite } from './renderSite'
import { markdownLabelsFor } from './layoutContent'

const mathAssetsPlugin = {
  name: 'math-assets-test',
  version: '1',
  assets: { math: true as const },
  appliesTo: ({ source }: { source: string }) => source.includes('$')
}

describe('renderSite', () => {
  it('fails explicitly when required KaTeX fonts cannot be copied', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-missing-math-fonts-'))

    await expect(
      copyRequiredMathFonts(join(cwd, 'missing-fonts'), join(cwd, 'output-fonts'))
    ).rejects.toThrow('Failed to copy required KaTeX fonts')
  })

  it('provides complete Chinese interaction labels', () => {
    expect(markdownLabelsFor('zh-CN')).toMatchObject({
      copyCode: '复制代码',
      copySnippet: '复制片段',
      copyTerminal: '复制终端输出'
    })
    expect(markdownLabelsFor('en')).toBeUndefined()
  })

  it('omits the Markdown article when a landing page has no authored body', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-empty-landing-'))
    const sourcePath = join(cwd, 'docs/index.md')
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(sourcePath, '---\ntitle: Canofold\n---\n')

    const page = createMockPage({
      sourcePath,
      sourceRelativePath: 'docs/index.md',
      relativePath: 'index.md',
      routePath: '/',
      outputPath: 'index.html',
      markdownOutputPath: 'index.md',
      title: 'Canofold',
      body: '',
      headings: [],
      searchText: '',
      transformedSource: '---\ntitle: Canofold\n---\n',
      frontmatter: {
        hero: { tagline: 'Static documentation.' },
        features: [{ title: 'Static output', details: 'Deploy anywhere.' }]
      }
    })
    const graph = createMockGraph({
      pages: [page],
      sidebar: { current: { zh: [] } },
      nav: { current: { zh: [] } }
    })

    await renderSite({ cwd, config: defaultConfig, graph })
    const html = await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')

    expect(html).toContain('class="cf-home"')
    expect(html).toContain('Static documentation.')
    expect(html).not.toContain('class="cf-content"')
  })

  it('renders a playground from one Markdown source without the document footer or outline', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-playground-'))
    await mkdir(join(cwd, 'docs/zh/markdown'), { recursive: true })
    const source = '# Playground\n\nUse **one source** for both panes.'
    const page = createMockPage({
      sourcePath: join(cwd, 'docs/zh/markdown/playground.md'),
      transformedSource: source,
      sourceRelativePath: 'docs/zh/markdown/playground.md',
      relativePath: 'zh/markdown/playground.md',
      routePath: '/markdown/playground/',
      outputPath: 'markdown/playground/index.html',
      markdownOutputPath: 'markdown/playground/index.md',
      title: 'Playground',
      group: 'markdown',
      body: source,
      frontmatter: { layout: 'playground' }
    })
    const graph = createMockGraph({
      pages: [page],
      sidebar: { current: { zh: [] } },
      nav: { current: { zh: [] } }
    })

    await renderSite({ cwd, config: defaultConfig, graph })
    const html = await readFile(join(cwd, '.canofold/dist/markdown/playground/index.html'), 'utf8')

    expect(html).toContain('<html lang="zh" class="cf-playground-page">')
    expect(html).toContain('class="cf-shell cf-shell-playground"')
    expect(html).toContain('data-canofold-playground=""')
    expect(html).toContain('data-view="preview"')
    expect(html).toContain('data-canofold-playground-source=""')
    expect(html).toContain('# Playground\n\nUse **one source** for both panes.</textarea>')
    expect(html).toContain('<strong data-cf-element="strong">one source</strong>')
    expect(html).toContain('data-canofold-playground-toggle=""')
    expect(html).toContain('data-canofold-playground-resizer=""')
    expect(html).toContain('data-canofold-playground-preview=""')
    expect(html).toContain('data-canofold-playground-client-url="/assets/canofold-playground/index.js"')
    expect(html).toContain('src="/assets/canofold-playground/index.js"')
    expect(html).toContain('role="separator"')
    expect(html).not.toContain('class="cf-playground-pane-head"')
    expect(html).not.toContain('class="cf-page-footer"')
    expect(html).not.toContain('class="cf-outline"')
    await access(join(cwd, '.canofold/dist/assets/canofold-playground/index.js'))
  })

  it('rejects public files that overwrite generated runtime assets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-public-collision-'))
    await mkdir(join(cwd, 'docs/public/assets'), { recursive: true })
    await writeFile(join(cwd, 'docs/public/assets/canofold.css'), 'malicious overwrite')
    const graph = createMockGraph()

    await expect(renderSite({ cwd, config: defaultConfig, graph })).rejects.toThrow(
      'Static asset conflicts with generated output: assets/canofold.css'
    )
  })

  it('rejects file and directory overlaps within the generated output plan before writing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-generated-collision-'))
    const page = createMockPage({
      sourcePath: join(cwd, 'docs/zh/assets/canofold.css.md'),
      transformedSource: '# Collision',
      sourceRelativePath: 'docs/zh/assets/canofold.css.md',
      relativePath: 'zh/assets/canofold.css.md',
      version: 'current',
      versionBase: '/',
      docsDir: 'docs',
      locale: 'zh',
      routePath: '/assets/canofold.css/',
      outputPath: 'assets/canofold.css/index.html',
      markdownOutputPath: 'assets/canofold.css/index.md',
      title: 'Collision',
      description: '',
      order: 0,
      group: '',
      status: 'published',
      search: true,
      ai: true,
      body: '# Collision',
      headings: [],
      searchText: '',
      codeExamples: [],
      lastUpdated: new Date().toISOString(),
      frontmatter: {}
    })
    const graph = createMockGraph({
      sidebar: { current: { zh: [] } },
      nav: { current: { zh: [] } },
      pages: [page]
    })

    await expect(renderSite({ cwd, config: defaultConfig, graph })).rejects.toThrow(
      'Generated outputs overlap'
    )
    await expect(access(join(cwd, '.canofold/dist/assets/canofold.css'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('rejects case-insensitive public collisions for portable output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-public-case-collision-'))
    await mkdir(join(cwd, 'docs/public/ASSETS'), { recursive: true })
    await writeFile(join(cwd, 'docs/public/ASSETS/CANOFOLD.CSS'), 'portable collision')
    const graph = createMockGraph()

    await expect(renderSite({ cwd, config: defaultConfig, graph })).rejects.toThrow(
      'Static asset conflicts with generated output: ASSETS/CANOFOLD.CSS'
    )
  })

  it('rejects public files that would be overwritten by generated metadata', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-public-metadata-collision-'))
    await mkdir(join(cwd, 'docs/public'), { recursive: true })
    await writeFile(join(cwd, 'docs/public/robots.txt'), 'custom robots')
    const graph = createMockGraph()

    await expect(renderSite({ cwd, config: defaultConfig, graph })).rejects.toThrow(
      'Static asset conflicts with generated output: robots.txt'
    )
  })

  it('publishes authored assets and can omit the header for embedded sites', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-assets-'))
    await mkdir(join(cwd, 'docs/public'), { recursive: true })
    await mkdir(join(cwd, 'docs/zh/guide/images'), { recursive: true })
    await writeFile(join(cwd, 'docs/public/logo.svg'), '<svg/>')
    await writeFile(join(cwd, 'docs/zh/guide/images/local.png'), 'local image')
    await writeFile(join(cwd, 'docs/zh/guide/guide.pdf'), 'local pdf')
    await writeFile(
      join(cwd, 'docs/zh/guide/index.md'),
      '[Home](/)\n\n![Logo](/logo.svg)\n\n![Local](./images/local.png)\n\n[Guide](./guide.pdf)'
    )
    const page = createMockPage({
      sourcePath: join(cwd, 'docs/zh/guide/index.md'),
      transformedSource:
        '[Home](/)\n\n![Logo](/logo.svg)\n\n![Local](./images/local.png)\n\n[Guide](./guide.pdf)',
      sourceRelativePath: 'docs/zh/guide/index.md',
      relativePath: 'zh/guide/index.md',
      version: 'current',
      versionBase: '/',
      docsDir: 'docs',
      locale: 'zh',
      routePath: '/guide/',
      outputPath: 'guide/index.html',
      markdownOutputPath: 'guide/index.md',
      title: 'Guide',
      description: '',
      order: 0,
      group: '',
      status: 'published',
      search: true,
      ai: true,
      body: '[Home](/)\n\n![Logo](/logo.svg)\n\n![Local](./images/local.png)\n\n[Guide](./guide.pdf)',
      headings: [],
      searchText: '',
      codeExamples: [],
      lastUpdated: new Date().toISOString(),
      frontmatter: {}
    })
    const graph = createMockGraph({
      sidebar: { current: { zh: [] } },
      nav: { current: { zh: [] } },
      pages: [page]
    })

    await renderSite({
      cwd,
      config: { ...defaultConfig, basePath: '/project/', layout: { header: false } },
      graph
    })

    const html = await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')
    expect(html).toContain('<html lang="zh" class="cf-header-hidden">')
    expect(html).not.toContain('<header')
    expect(html).toContain('href="/project/"')
    expect(html).toContain('src="/project/logo.svg"')
    expect(html).toContain('src="./images/local.png"')
    expect(html).toContain('href="./guide.pdf"')
    expect(html).toContain('class="cf-file-name">guide.pdf</span>')
    await access(join(cwd, '.canofold/dist/logo.svg'))
    await access(join(cwd, '.canofold/dist/guide/images/local.png'))
    await access(join(cwd, '.canofold/dist/guide/guide.pdf'))
  })

  it('rejects relative page assets reached through symbolic links', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-page-asset-symlink-'))
    await mkdir(join(cwd, 'docs/guide'), { recursive: true })
    await writeFile(join(cwd, 'outside.png'), 'outside')
    await symlink(join(cwd, 'outside.png'), join(cwd, 'docs/guide/linked.png'))
    const page = createMockPage({
      sourcePath: join(cwd, 'docs/guide/index.md'),
      transformedSource: '![Linked](./linked.png)',
      sourceRelativePath: 'docs/guide/index.md',
      relativePath: 'guide/index.md',
      version: 'current',
      versionBase: '/',
      docsDir: 'docs',
      locale: 'zh',
      routePath: '/guide/',
      outputPath: 'guide/index.html',
      markdownOutputPath: 'guide/index.md',
      title: 'Guide',
      description: '',
      order: 0,
      group: '',
      status: 'published',
      search: true,
      ai: true,
      body: '![Linked](./linked.png)',
      headings: [],
      searchText: '',
      codeExamples: [],
      lastUpdated: '',
      frontmatter: {}
    })

    await expect(
      renderSite({
        cwd,
        config: defaultConfig,
        graph: createMockGraph({
          sidebar: { current: { zh: [] } },
          nav: { current: { zh: [] } },
          pages: [page]
        })
      })
    ).rejects.toThrow('Relative assets must not use symbolic links')
  })

  it('publishes public assets from every configured documentation version', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-versioned-public-'))
    await mkdir(join(cwd, 'docs/current/public'), { recursive: true })
    await mkdir(join(cwd, 'docs/v1/public'), { recursive: true })
    await writeFile(join(cwd, 'docs/current/public/current.txt'), 'current')
    await writeFile(join(cwd, 'docs/v1/public/legacy.txt'), 'legacy')
    const versions = [
      { id: 'current', label: 'Current', docsDir: 'docs/current', base: '/' },
      { id: 'v1', label: 'v1', docsDir: 'docs/v1', base: '/v1/' }
    ]
    const graph = createMockGraph({
      versions,
      pages: []
    })

    await renderSite({
      cwd,
      config: {
        ...defaultConfig,
        docsDir: 'docs/current',
        versions: { current: 'current', items: versions }
      },
      graph
    })

    expect(await readFile(join(cwd, '.canofold/dist/current.txt'), 'utf8')).toBe('current')
    expect(await readFile(join(cwd, '.canofold/dist/legacy.txt'), 'utf8')).toBe('legacy')
  })

  it('deduplicates identical public assets shared by documentation versions', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-versioned-public-shared-'))
    await mkdir(join(cwd, 'docs/current/public'), { recursive: true })
    await mkdir(join(cwd, 'docs/v1/public'), { recursive: true })
    await writeFile(join(cwd, 'docs/current/public/logo.svg'), '<svg/>')
    await writeFile(join(cwd, 'docs/v1/public/logo.svg'), '<svg/>')
    const versions = [
      { id: 'current', label: 'Current', docsDir: 'docs/current', base: '/' },
      { id: 'v1', label: 'v1', docsDir: 'docs/v1', base: '/v1/' }
    ]

    await expect(
      renderSite({
        cwd,
        config: {
          ...defaultConfig,
          docsDir: 'docs/current',
          versions: { current: 'current', items: versions }
        },
        graph: createMockGraph({ versions })
      })
    ).resolves.toBeUndefined()

    expect(await readFile(join(cwd, '.canofold/dist/logo.svg'), 'utf8')).toBe('<svg/>')
  })

  it('writes static HTML with page body content and markdown source', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-render-'))
    const outputDir = '.canofold/dist'
    await mkdir(join(cwd, outputDir), { recursive: true })
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/brand.css'), '.brand-test { color: rebeccapurple; }')

    const graph = createMockGraph({
      nav: {
        current: {
          zh: [
            { title: '指南', routePath: '/guide/' },
            { title: '参考', routePath: '/reference/' }
          ]
        }
      },
      pages: [
        createMockPage({
          sourcePath: 'docs/zh/guide.md',
          transformedSource: '# Guide',
          sourceRelativePath: 'docs/zh/guide.md',
          relativePath: 'zh/guide.md',
          version: 'current',
          versionBase: '/',
          docsDir: 'docs',
          locale: 'zh',
          routePath: '/guide/',
          outputPath: 'guide/index.html',
          markdownOutputPath: 'guide/index.md',
          title: '首页',
          description: '中文首页',
          order: 0,
          group: '',
          status: 'published',
          search: true,
          ai: true,
          body: '# 首页\n\n###### 六级标题\n\n<script>alert("unsafe")</script>\n\n<p onclick="unsafe()">安全正文</p>\n\n| 列 |\n| - |\n| 值 |\n\n```ts\nconst value = true\n```\n\n```mermaid\nflowchart LR\nA --> B\n```',
          headings: [
            { level: 1, text: '首页', slug: '首页' },
            { level: 6, text: '六级标题', slug: '六级标题' }
          ],
          searchText: '首页',
          codeExamples: [],
          lastUpdated: new Date('2026-06-23T00:00:00.000Z').toISOString(),
          frontmatter: {}
        })
      ]
    })

    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(
      join(cwd, 'docs/zh/guide.md'),
      '# 首页\n\n###### 六级标题\n\n<script>alert("unsafe")</script>\n\n<p onclick="unsafe()">安全正文</p>\n\n| 列 |\n| - |\n| 值 |\n\n```ts\nconst value = true\n```\n\n```mermaid\nflowchart LR\nA --> B\n```'
    )

    await renderSite({
      cwd,
      config: {
        ...defaultConfig,
        basePath: '/project/',
        outputDir,
        styles: ['./docs/brand.css'],
        theme: {
          ...defaultConfig.theme,
          favicon: '/favicon.svg',
          logo: '/logo.svg',
          logoDark: '/logo-dark.svg'
        },
        advertising: {
          image: '/sponsor.png',
          href: 'https://example.com',
          alt: 'Example sponsor'
        },
        markdown: {
          ...defaultConfig.markdown,
          html: 'sanitize'
        }
      },
      graph
    })
    const html = await readFile(join(cwd, outputDir, 'guide/index.html'), 'utf8')

    expect(html).toContain('<main')
    expect(html).toContain('首页')
    expect(html).toContain('最后更新')
    expect(html).toContain('canofold-search.js')
    expect(html).toContain('href="/project/assets/canofold.css"')
    expect(html).toContain('class="cf-brand-logo cf-brand-logo-light"')
    expect(html).toContain('src="/project/logo.svg"')
    expect(html).toContain('class="cf-brand-logo cf-brand-logo-dark"')
    expect(html).toContain('src="/project/logo-dark.svg"')
    expect(html).toContain('src="/project/assets/canofold-search.js"')
    expect(html).toContain('data-search-index-url="/project/search/zh.json"')
    expect(html).not.toContain('cf-markdown-menu')
    expect(html).not.toContain('/markdown/examples/')
    expect(html).toContain('data-empty-label="没有找到匹配文档"')
    expect(html).toContain('data-canofold-action-success="源文档已复制"')
    expect(html).toContain('data-canofold-search-default')
    expect(html).not.toContain('data-canofold-search-action="theme"')
    expect(html).not.toContain('class="cf-menu cf-lang"')
    expect(html).toContain('class="cf-outline-ad"')
    expect(html).toContain('class="cf-sidebar-primary-nav"')
    expect(html).toContain('class="cf-sidebar-primary-link cf-sidebar-primary-link-active"')
    expect(html).toContain('href="/project/reference/"')
    expect(html).toContain('rel="sponsored noopener noreferrer"')
    expect(html).toContain('aria-label="下载 CSV"')
    expect(html).toContain('cf-outline-link-6')
    expect(html).not.toContain('cf-outline-title')
    expect(html).toContain('安全正文')
    expect(html).not.toContain('alert("unsafe")')
    expect(html).not.toContain('onclick="unsafe()"')
    // Mermaid is owned by @canofold/plugins. Core keeps an unconfigured fence readable
    // instead of silently activating plugin-specific runtime behavior.
    expect(html).not.toContain('data-cf-mermaid-module-url')
    expect(html).not.toContain('cf-mermaid-fallback')
    expect(html).toContain('flowchart LR')
    await access(join(cwd, outputDir, 'guide/index.md'))
    await access(join(cwd, outputDir, 'assets/canofold.css'))
    await expect(access(join(cwd, outputDir, 'assets/fonts'))).rejects.toMatchObject({ code: 'ENOENT' })
    const css = await readFile(join(cwd, outputDir, 'assets/canofold.css'), 'utf8')
    expect(css).toContain('/* User style: ./docs/brand.css */')
    expect(css).toContain('.brand-test { color: rebeccapurple; }')
    expect(css.lastIndexOf('.brand-test')).toBeGreaterThan(css.lastIndexOf('/* Canofold shell */'))
    expect(css).toContain('--cf-accent-500: #0088ff')
    expect(css).toContain('--cf-body-font-size: 1rem')
    expect(css).not.toContain('--cf-material-')
    expect(css).not.toMatch(/Nocturne|\.cf-bento-grid|\.cf-hero-bento/i)
    expect(css).toContain('--cf-glass-blur: 18px')
    expect(css).toContain('padding:1.75rem var(--cf-site-gutter) 3.5rem')
    const searchClient = await readFile(join(cwd, outputDir, 'assets/canofold-search.js'), 'utf8')
    expect(searchClient).toContain('data-canofold-search-default')
    expect(searchClient).toContain('data-canofold-search-action')
    const notFound = await readFile(join(cwd, outputDir, '404.html'), 'utf8')
    expect(notFound).toContain('<html lang="zh">')
    expect(notFound).toContain('<h1 id="canofold-404-title" class="cf-not-found-title">页面未找到</h1>')
    expect(notFound).toContain('<link rel="icon" href="/project/favicon.svg">')
    expect(notFound).toContain('href="/project/assets/canofold.css"')
    expect(notFound).toContain('href="/project/"')
    const islandRoot = join(cwd, outputDir, 'assets/canofold-markdown')
    const islandFiles = [...(await readdir(islandRoot)), ...(await readdir(join(islandRoot, 'chunks')))]
    expect(islandFiles).toContain('index.js')
    expect(islandFiles.every((file) => file === 'chunks' || file.endsWith('.js'))).toBe(true)

    const staticOutputDir = '.canofold/static'
    const basePage = graph.pages[0]
    expect(basePage).toBeDefined()
    if (!basePage) throw new Error('Expected the fixture graph to contain a page')
    const staticPage = {
      ...basePage,
      routePath: '/static/',
      outputPath: 'static/index.html',
      markdownOutputPath: 'static/index.md',
      title: '纯静态页面',
      body: '# 纯静态页面\n\n这里没有交互组件。',
      headings: [{ level: 1 as const, text: '纯静态页面', slug: '纯静态页面' }]
    }
    await renderSite({
      cwd,
      config: { ...defaultConfig, outputDir: staticOutputDir },
      graph,
      pages: [staticPage]
    })
    const staticHtml = await readFile(join(cwd, staticOutputDir, staticPage.outputPath), 'utf8')
    expect(staticHtml).not.toContain('data-markdown-behaviors=')
    expect(staticHtml).not.toContain('data-markdown-client-url=')
    await expect(access(join(cwd, staticOutputDir, 'assets/canofold-markdown'))).rejects.toMatchObject({
      code: 'ENOENT'
    })

    const mathOutputDir = '.canofold/math'
    const mathPage = {
      ...basePage,
      routePath: '/formula/',
      outputPath: 'formula/index.html',
      markdownOutputPath: 'formula/index.md',
      title: '公式',
      body: '# 公式\n\n$E = mc^2$',
      headings: [{ level: 1 as const, text: '公式', slug: '公式' }]
    }
    await renderSite({
      cwd,
      config: {
        ...defaultConfig,
        outputDir: mathOutputDir,
        markdown: { ...defaultConfig.markdown, plugins: [mathAssetsPlugin] }
      },
      graph: { ...graph, pages: [mathPage] }
    })
    const mathCss = await readFile(join(cwd, mathOutputDir, 'assets/canofold.css'), 'utf8')
    expect(mathCss).toContain('KaTeX_Main')
    expect(
      (await readdir(join(cwd, mathOutputDir, 'assets/fonts'))).filter((file) => file.endsWith('.woff2'))
    ).toHaveLength(20)
  })

  it('renders a configured third locale across navigation, language menu, and 404', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-render-locale-'))
    const outputDir = '.canofold/ja'
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const page = createMockPage({
      sourcePath: 'docs/ja/index.md',
      transformedSource: '# Home',
      sourceRelativePath: 'docs/ja/index.md',
      relativePath: 'ja/index.md',
      version: 'current',
      versionBase: '/',
      docsDir: 'docs',
      locale: 'ja',
      routePath: '/',
      outputPath: 'index.html',
      markdownOutputPath: 'index.md',
      title: 'ホーム',
      description: '日本語ドキュメント',
      order: 0,
      group: '',
      status: 'published',
      search: true,
      ai: true,
      body: '# ホーム\n\nAUTHORED HOME BODY',
      headings: [{ level: 1 as const, text: 'ホーム', slug: 'ホーム' }],
      searchText: 'ホーム',
      codeExamples: [],
      lastUpdated: new Date('2026-07-18T00:00:00.000Z').toISOString(),
      frontmatter: {}
    })
    const graph = createMockGraph({
      sidebar: { current: { ja: [], en: [] } },
      nav: { current: { ja: [{ title: 'ガイド', routePath: '/guide/start/' }], en: [] } },
      pages: [page],
      locales: ['ja', 'en'],
      defaultLocale: 'ja',
      versions: [{ id: 'current', label: 'Current', docsDir: 'docs', base: '/' }]
    })

    await mkdir(join(cwd, 'docs/ja'), { recursive: true })
    await writeFile(join(cwd, 'docs/ja/index.md'), '# ホーム\n\nAUTHORED HOME BODY')

    await renderSite({
      cwd,
      graph,
      config: {
        ...defaultConfig,
        outputDir,
        i18n: {
          defaultLocale: 'ja',
          locales: ['ja', 'en'],
          localeNames: { ja: '日本語', en: 'English' },
          messages: {
            ja: {
              labels: {
                search: 'ドキュメントを検索',
                primaryNavigation: 'メインナビゲーション'
              },
              notFound: {
                title: 'ページが見つかりません',
                description: 'ページが移動または削除されました。',
                home: 'ホームへ戻る →'
              }
            }
          }
        }
      }
    })

    const html = await readFile(join(cwd, outputDir, 'index.html'), 'utf8')
    expect(html).toContain('AUTHORED HOME BODY')
    expect(html).toContain('class="cf-home" tabindex="-1" data-pagefind-body=""')
    expect(html).toContain('<header class="cf-header cf-header-home">')
    expect(html).not.toContain('class="cf-progress"')
    expect(html).toContain('data-cf-root="markdown"')
    expect(html).toContain('aria-label="メインナビゲーション"')
    expect(html).toContain('>ガイド</a>')
    expect(html).toContain('aria-label="ドキュメントを検索"')
    expect(html).toContain('lang="ja" aria-current="page">日本語</a>')
    expect(html).toContain('lang="en">English</a>')
    expect(html).not.toContain('<span>ja</span>')
    expect(html).not.toContain('<span>en</span>')

    const notFound = await readFile(join(cwd, outputDir, '404.html'), 'utf8')
    expect(notFound).toContain('<html lang="ja">')
    expect(notFound).toContain('ページが見つかりません')
    expect(notFound).toContain('ページが移動または削除されました。')
    expect(notFound).toContain('Page not found')
    expect(notFound).toContain('/en/')
    expect(notFound).toContain('document.documentElement.lang=m.locale')
  })
})
