import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { loadConfig } from './load'

describe('loadConfig', () => {
  it('returns defaults when canofold.config.ts is absent', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    const config = await loadConfig(cwd)

    expect(config.title).toBe('Canofold')
    expect(config.docsDir).toBe('docs')
    expect(config.outputDir).toBe('.canofold/dist')
    expect(config.layout).toEqual({ header: true })
    expect(config.i18n.defaultLocale).toBe('zh')
    expect(config.i18n.locales).toEqual(['zh'])
    expect(config.extensions).toEqual([])
    expect(config.markdown.html).toBe('sanitize')
  })

  it('can disable the site header for embedded documentation', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { layout: { header: false } }`)

    const config = await loadConfig(cwd)

    expect(config.layout).toEqual({ header: false })
  })

  it('loads canofold.config.ts and merges defaults', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { title: 'AMD Docs', i18n: { defaultLocale: 'en', locales: ['en', 'zh'] } }`
    )

    const config = await loadConfig(cwd)

    expect(config.title).toBe('AMD Docs')
    expect(config.docsDir).toBe('docs')
    expect(config.i18n.defaultLocale).toBe('en')
    expect(config.i18n.locales).toEqual(['en', 'zh'])
  })

  it('loads relative imports from canofold.config.ts', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(join(cwd, 'config-helper.ts'), `export const title = 'Imported title'`)
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `import { title } from './config-helper.ts'; export default { title }`
    )

    await expect(loadConfig(cwd)).resolves.toMatchObject({ title: 'Imported title' })
    await expect(readdir(join(cwd, '.canofold/tmp'))).resolves.toEqual([])
    await expect(access(join(cwd, '.canofold.config.mjs'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes temporary config directories when bundling fails', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-error-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { broken: }`)

    await expect(loadConfig(cwd)).rejects.toThrow()
    await expect(readdir(join(cwd, '.canofold/tmp'))).resolves.toEqual([])
  })

  it('loads tsconfig path aliases from a monorepo-style config helper', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await mkdir(join(cwd, 'config'), { recursive: true })
    await writeFile(
      join(cwd, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@config/*': ['config/*'] } } })
    )
    await writeFile(join(cwd, 'config/site.ts'), `export const title = 'Aliased config'`)
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `import { title } from '@config/site'; export default { title }`
    )

    await expect(loadConfig(cwd)).resolves.toMatchObject({ title: 'Aliased config' })
  })

  it('loads ESM package exports and CommonJS helpers from the project dependency tree', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    const esmRoot = join(cwd, 'node_modules/config-esm')
    const cjsRoot = join(cwd, 'node_modules/config-cjs')
    await mkdir(esmRoot, { recursive: true })
    await mkdir(cjsRoot, { recursive: true })
    await writeFile(
      join(esmRoot, 'package.json'),
      JSON.stringify({ name: 'config-esm', type: 'module', exports: { '.': { import: './index.js' } } })
    )
    await writeFile(join(esmRoot, 'index.js'), `export const title = 'ESM exports'`)
    await writeFile(
      join(cjsRoot, 'package.json'),
      JSON.stringify({ name: 'config-cjs', main: './index.cjs' })
    )
    await writeFile(join(cjsRoot, 'index.cjs'), `module.exports = { description: 'CommonJS helper' }`)
    await writeFile(
      join(cwd, 'canofold.config.mts'),
      `import { title } from 'config-esm'; import helper from 'config-cjs'; export default { title, description: helper.description }`
    )

    await expect(loadConfig(cwd)).resolves.toMatchObject({
      title: 'ESM exports',
      description: 'CommonJS helper'
    })

    await writeFile(join(esmRoot, 'index.js'), `export const title = 'Updated ESM exports'`)
    await expect(loadConfig(cwd)).resolves.toMatchObject({
      title: 'Updated ESM exports',
      description: 'CommonJS helper'
    })
  })

  it('preserves package-relative runtime resolution for official plugins', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    const pluginRoot = join(cwd, 'node_modules/@canofold/plugins')
    const binaryRoot = join(pluginRoot, 'node_modules/config-binary')
    await mkdir(binaryRoot, { recursive: true })
    await writeFile(
      join(pluginRoot, 'package.json'),
      JSON.stringify({
        name: '@canofold/plugins',
        type: 'module',
        exports: { '.': './index.js' }
      })
    )
    await writeFile(
      join(binaryRoot, 'package.json'),
      JSON.stringify({ name: 'config-binary', main: './index.cjs' })
    )
    await writeFile(join(binaryRoot, 'index.cjs'), `module.exports = { title: 'Package-relative plugin' }`)
    await writeFile(
      join(pluginRoot, 'index.js'),
      `import { createRequire } from 'node:module';
       const require = createRequire(import.meta.url);
       export const title = require('config-binary').title;`
    )
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `import { title } from '@canofold/plugins'; export default { title }`
    )

    await expect(loadConfig(cwd)).resolves.toMatchObject({ title: 'Package-relative plugin' })
  })

  it.each(['cts', 'cjs'])('loads a CommonJS %s configuration entry', async (extension) => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(join(cwd, `canofold.config.${extension}`), `module.exports = { title: 'CommonJS config' }`)
    await expect(loadConfig(cwd)).resolves.toMatchObject({ title: 'CommonJS config' })
  })

  it('rejects ambiguous multiple configuration files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default {}`)
    await writeFile(join(cwd, 'canofold.config.mjs'), `export default {}`)
    await expect(loadConfig(cwd)).rejects.toThrow('Multiple Canofold configuration files found')
  })

  it('loads versioned project-local extension descriptors with JSON options', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { extensions: [{ resolve: './extensions/banner.ts', options: { label: 'Preview', flags: [true, 1] } }] }`
    )

    await expect(loadConfig(cwd)).resolves.toMatchObject({
      extensions: [{ resolve: './extensions/banner.ts', options: { label: 'Preview', flags: [true, 1] } }]
    })
  })

  it('rejects extension package specifiers and non-JSON options', async () => {
    const packageSpecifier = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(packageSpecifier, 'canofold.config.ts'),
      `export default { extensions: [{ resolve: 'unreviewed-package' }] }`
    )
    await expect(loadConfig(packageSpecifier)).rejects.toThrow('project-relative path')

    const nonJson = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(nonJson, 'canofold.config.ts'),
      `export default { extensions: [{ resolve: './extension.ts', options: { invalid: undefined } }] }`
    )
    await expect(loadConfig(nonJson)).rejects.toThrow()
  })

  it('rejects an invalid default locale and duplicate locale entries', async () => {
    const missingDefault = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(missingDefault, 'canofold.config.ts'),
      `export default { i18n: { defaultLocale: 'en', locales: ['zh'] } }`
    )
    await expect(loadConfig(missingDefault)).rejects.toThrow('must be included in i18n.locales')

    const duplicates = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(duplicates, 'canofold.config.ts'),
      `export default { i18n: { defaultLocale: 'zh', locales: ['zh', 'zh'] } }`
    )
    await expect(loadConfig(duplicates)).rejects.toThrow('must not contain duplicate locales')
  })

  it('loads third-locale display names and partial messages', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        i18n: {
          defaultLocale: 'zh',
          locales: ['zh', 'en', 'ja'],
          localeNames: { zh: '简体中文', en: 'English', ja: '日本語' },
          messages: {
            ja: {
              labels: { search: 'ドキュメントを検索' },
              markdown: { terminalTitle: 'ターミナル' },
              notFound: { title: 'ページが見つかりません' }
            }
          }
        }
      }`
    )

    const config = await loadConfig(cwd)
    expect(config.i18n.locales).toEqual(['zh', 'en', 'ja'])
    expect(config.i18n.localeNames?.ja).toBe('日本語')
    expect(config.i18n.messages?.ja?.labels?.search).toBe('ドキュメントを検索')
    expect(config.i18n.messages?.ja?.markdown?.terminalTitle).toBe('ターミナル')
  })

  it('rejects invalid and unregistered locale resource keys', async () => {
    const invalidLocale = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(invalidLocale, 'canofold.config.ts'),
      `export default { i18n: { defaultLocale: 'not_a_locale', locales: ['not_a_locale'] } }`
    )
    await expect(loadConfig(invalidLocale)).rejects.toThrow('Invalid locale identifier')

    const unknownResource = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(unknownResource, 'canofold.config.ts'),
      `export default { i18n: { locales: ['zh'], messages: { ja: { labels: { search: '検索' } } } } }`
    )
    await expect(loadConfig(unknownResource)).rejects.toThrow('must be included in i18n.locales')

    const misspelledGroup = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(misspelledGroup, 'canofold.config.ts'),
      `export default {
        i18n: {
          locales: ['zh'],
          messages: { zh: { markdownElementGroups: { headingz: { label: '标题' } } } }
        }
      }`
    )
    await expect(loadConfig(misspelledGroup)).rejects.toThrow('Unrecognized key')
  })

  it('deep merges theme token overrides', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { theme: { tokens: { colors: { light: { primary: '#123456' } }, typography: { sansFont: 'Inter, sans-serif' } } } }`
    )

    const config = await loadConfig(cwd)

    expect(config.theme.tokens.colors?.light?.primary).toBe('#123456')
    expect(config.theme.tokens.colors?.dark).toEqual({})
    expect(config.theme.tokens.typography?.sansFont).toBe('Inter, sans-serif')
  })

  it('loads project CSS paths without sharing the default array', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { styles: ['./docs/brand.css', './docs/overrides.css'] }`
    )

    const config = await loadConfig(cwd)

    expect(config.styles).toEqual(['./docs/brand.css', './docs/overrides.css'])
  })

  it('rejects retired site-level Markdown class names', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { markdown: { classNames: { heading: 'brand-heading', link: 'brand-link', copySnippet: 'brand-snippet' } } }`
    )

    await expect(loadConfig(cwd)).rejects.toThrow('Unrecognized key')
  })

  it('rejects unknown configuration keys instead of silently dropping typos', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { theme: { sidebarWitdh: 300 }, markdown: { classNames: { copySnipet: 'broken' } } }`
    )

    await expect(loadConfig(cwd)).rejects.toThrow('Unrecognized key')
  })

  it('loads Markdown interaction label overrides', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { markdown: { labels: { closeImagePreview: '关闭预览', sortTableColumn: '按第 {column} 列排序' } } }`
    )

    const config = await loadConfig(cwd)
    expect(config.markdown.labels).toEqual({
      closeImagePreview: '关闭预览',
      sortTableColumn: '按第 {column} 列排序'
    })
  })

  it('loads the Markdown HTML policy', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { markdown: { html: 'sanitize' } }`)

    const config = await loadConfig(cwd)

    expect(config.markdown.html).toBe('sanitize')
  })

  it('validates bounded AI artifact settings', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { ai: { chunkSizeBytes: 65536, llmsFullMaxBytes: 1048576, llmsFullOverflow: 'error', versions: 'all' } }`
    )
    await expect(loadConfig(cwd)).resolves.toMatchObject({
      ai: {
        chunkSizeBytes: 65536,
        llmsFullMaxBytes: 1048576,
        llmsFullOverflow: 'error',
        versions: 'all'
      }
    })

    const invalid = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(invalid, 'canofold.config.ts'),
      `export default { ai: { chunkSizeBytes: 1024, llmsFullOverflow: 'truncate' } }`
    )
    await expect(loadConfig(invalid)).rejects.toThrow()
  })

  it('deep merges Markdown compiler options without duplicating package defaults', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        markdown: {
          code: { themes: { light: 'github-light' }, fallbackLanguage: 'text', unknownLanguage: 'error' },
          features: { tables: false, terminals: false }
        }
      }`
    )

    const config = await loadConfig(cwd)

    expect(config.markdown.code).toEqual({
      themes: { light: 'github-light' },
      fallbackLanguage: 'text',
      unknownLanguage: 'error'
    })
    expect(config.markdown.features).toEqual({ tables: false, terminals: false })
  })

  it('rejects accepted-looking settings that would have no effect', async () => {
    const versioned = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(versioned, 'canofold.config.ts'),
      `export default {
        docsDir: 'docs',
        versions: { current: 'current', items: [{ id: 'current', label: 'Current', docsDir: 'v2', base: '/' }] }
      }`
    )
    await expect(loadConfig(versioned)).rejects.toThrow('docsDir cannot be combined with versions')

    const darkLogo = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(darkLogo, 'canofold.config.ts'),
      `export default { theme: { logo: '/logo.svg', logoDark: '/logo-dark.svg' } }`
    )
    await expect(loadConfig(darkLogo)).rejects.toThrow('theme.logoDark requires theme.darkMode: true')

    const missingLogo = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(missingLogo, 'canofold.config.ts'),
      `export default { theme: { logoDark: '/logo-dark.svg', darkMode: true } }`
    )
    await expect(loadConfig(missingLogo)).rejects.toThrow('theme.logoDark requires theme.logo')
  })

  it('passes imported Markdown plugins through with their functions intact', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'demo-plugin.ts'),
      `export const demoPlugin = {
        name: 'demo-plugin',
        version: '1',
        cacheKey: { flag: true },
        rehypePlugins: [() => () => {}]
      }`
    )
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `import { demoPlugin } from './demo-plugin.ts'
      export default { markdown: { plugins: [demoPlugin] } }`
    )

    const config = await loadConfig(cwd)

    expect(config.markdown.plugins).toHaveLength(1)
    expect(config.markdown.plugins[0]).toMatchObject({
      name: 'demo-plugin',
      version: '1',
      cacheKey: { flag: true }
    })
    expect(typeof config.markdown.plugins[0]?.rehypePlugins?.[0]).toBe('function')
  })

  it('rejects Markdown plugins without a lowercase kebab-case name', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { markdown: { plugins: [{ name: 'Bad Name' }] } }`
    )

    await expect(loadConfig(cwd)).rejects.toThrow(/kebab-case/)
  })

  it('loads a structurally valid custom search provider', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        search: {
          provider: {
            id: 'custom-search',
            client: 'pagefind',
            write: async () => undefined
          }
        }
      }`
    )

    const config = await loadConfig(cwd)
    expect(config.search.provider).toMatchObject({ id: 'custom-search', client: 'pagefind' })
    expect(config.search.provider).not.toBe('compact')
    if (config.search.provider !== 'compact') {
      expect(typeof config.search.provider.write).toBe('function')
    }
  })

  it('loads enterprise navigation, versions, redirects, and advertising', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        navigation: { zh: [{ text: '指南', link: '/guide/' }] },
        versions: {
          current: 'v2',
          items: [
            { id: 'v2', label: '2.x', docsDir: 'docs', base: '/' },
            { id: 'v1', label: '1.x', docsDir: 'versions/v1', base: '/v1/' }
          ]
        },
        redirects: { '/old/': '/guide/' },
        advertising: { image: '/sponsor.png', href: 'https://example.com', alt: 'Sponsor' }
      }`
    )

    const config = await loadConfig(cwd)
    expect(config.navigation.zh?.[0]).toEqual({ text: '指南', link: '/guide/' })
    expect(config.versions.current).toBe('v2')
    expect(config.redirects['/old/']).toBe('/guide/')
    expect(config.advertising?.alt).toBe('Sponsor')
    expect(config.search).toEqual({ enabled: true, provider: 'compact' })
  })

  it('keeps an overridden docsDir as the implicit current version root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { docsDir: 'handbook' }`)
    const config = await loadConfig(cwd)
    expect(config.versions.items).toEqual([
      { id: 'current', label: 'Current', docsDir: 'handbook', base: '/' }
    ])
  })

  it('rejects version bases with traversal or URL suffixes', async () => {
    for (const base of ['/../../escape/', '/v1/?preview=1', '/v1/#old']) {
      const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
      await writeFile(
        join(cwd, 'canofold.config.ts'),
        `export default { versions: { current: 'current', items: [{ id: 'current', label: 'Current', docsDir: 'docs', base: '/' }, { id: 'old', label: 'Old', docsDir: 'old', base: ${JSON.stringify(base)} }] } }`
      )
      await expect(loadConfig(cwd)).rejects.toThrow('safe absolute path')
    }
  })

  it('loads a safe deployment base path and rejects traversal', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { basePath: '/project/' }`)
    await expect(loadConfig(cwd)).resolves.toMatchObject({ basePath: '/project/' })

    await writeFile(join(cwd, 'canofold.config.ts'), `export default { basePath: '/../../escape/' }`)
    await expect(loadConfig(cwd)).rejects.toThrow()
  })

  it('canonicalizes Unicode routes and rejects ambiguous repeated slashes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-route-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        basePath: '/文档/',
        navigation: { zh: [{ text: '开始', link: '/快速 开始/' }] },
        redirects: { '/旧版/': '/快速 开始/' }
      }`
    )
    await expect(loadConfig(cwd)).resolves.toMatchObject({
      basePath: '/%E6%96%87%E6%A1%A3/',
      navigation: { zh: [{ text: '开始', link: '/%E5%BF%AB%E9%80%9F%20%E5%BC%80%E5%A7%8B/' }] },
      redirects: {
        '/%E6%97%A7%E7%89%88/': '/%E5%BF%AB%E9%80%9F%20%E5%BC%80%E5%A7%8B/'
      }
    })

    await writeFile(join(cwd, 'canofold.config.ts'), `export default { basePath: '//docs/' }`)
    await expect(loadConfig(cwd)).rejects.toThrow('safe absolute path')
  })

  it('requires siteUrl to be an origin without a deployment path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-origin-'))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { siteUrl: 'https://example.com/docs/' }`)
    await expect(loadConfig(cwd)).rejects.toThrow('siteUrl must be an HTTP(S) origin')

    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { siteUrl: 'https://user:password@example.com/' }`
    )
    await expect(loadConfig(cwd)).rejects.toThrow('URL must use HTTP(S)')
  })

  it('rejects unsafe and portable-duplicate version ids', async () => {
    for (const ids of [
      ['current', '../../escape'],
      ['current', 'Current']
    ]) {
      const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-version-id-'))
      await writeFile(
        join(cwd, 'canofold.config.ts'),
        `export default { versions: { current: 'current', items: [
          { id: ${JSON.stringify(ids[0])}, label: 'Current', docsDir: 'docs', base: '/' },
          { id: ${JSON.stringify(ids[1])}, label: 'Old', docsDir: 'old', base: '/old/' }
        ] } }`
      )
      await expect(loadConfig(cwd)).rejects.toThrow(/version ids|safe portable slug/)
    }
  })

  it('rejects protocol-relative URLs in public resource fields', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-config-resource-'))
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { advertising: { image: '//evil.example/ad.png', href: 'https://example.com', alt: 'Ad' } }`
    )

    await expect(loadConfig(cwd)).rejects.toThrow('absolute site path or HTTPS URL')
  })
})
