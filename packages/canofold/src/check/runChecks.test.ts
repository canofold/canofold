import { describe, expect, it } from 'vitest'
import { analyzeMarkdown } from '@canofold/markdown/server/analyze'
import { createMockGraph, createMockPage } from '../../test/fixtures'
import {
  checkCodeBlockLanguages,
  checkDuplicateHeadings,
  checkFrontmatterDescription,
  checkFrontmatterTitle,
  checkRichDirectiveSyntax,
  checkLinksAndImages as checkReferences,
  checkMissingTranslations,
  summarizeTranslationCoverage,
  summarizeTranslationStatus,
  translationSourceHash,
  checkStaleTranslations
} from './runChecks'

function checkLinksAndImages(
  source: string,
  ...args: Parameters<typeof checkReferences> extends [unknown, ...infer Rest] ? Rest : never
) {
  const analysis = analyzeMarkdown(source)
  return checkReferences(
    {
      ...analysis,
      linkLocations: analysis.linkLocations.map((location) => location ?? null),
      imageLocations: analysis.imageLocations.map((location) => location ?? null)
    },
    ...args
  )
}

describe('quality checks', () => {
  it('reports a translation as stale only when its recorded source fingerprint differs', () => {
    const source = createMockPage({
      locale: 'zh',
      relativePath: 'zh/guide.md',
      body: '# 当前内容',
      title: '指南',
      description: '中文说明'
    })
    const english = createMockPage({
      locale: 'en',
      relativePath: 'en/guide.md',
      sourceRelativePath: 'docs/en/guide.md',
      body: '# Current content',
      frontmatter: { translation: { sourceHash: translationSourceHash(source) } }
    })
    const graph = createMockGraph({ pages: [source, english], locales: ['zh', 'en'] })
    expect(summarizeTranslationStatus(graph)).toMatchObject([
      { locale: 'en', status: 'current', sourceHash: translationSourceHash(source) }
    ])
    expect(checkStaleTranslations(graph)).toEqual([])

    const changed = createMockGraph({
      pages: [{ ...source, body: '# 已改变' }, english],
      locales: ['zh', 'en']
    })
    expect(summarizeTranslationStatus(changed)).toMatchObject([{ locale: 'en', status: 'stale' }])
    expect(checkStaleTranslations(changed)).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        page: 'docs/en/guide.md',
        locale: 'en'
      })
    )

    const untracked = createMockGraph({
      pages: [source, { ...english, frontmatter: {} }],
      locales: ['zh', 'en']
    })
    expect(summarizeTranslationStatus(untracked)).toMatchObject([{ locale: 'en', status: 'unknown' }])
    expect(checkStaleTranslations(untracked)).toEqual([])
  })
  it('reports unlabeled code fences', () => {
    expect(checkCodeBlockLanguages('```\nconst x = 1\n```')).toEqual([
      { severity: 'warning', message: 'Code block is missing a language', line: 1, column: 1 }
    ])
  })

  it('accepts labeled code fences', () => {
    expect(checkCodeBlockLanguages('```ts\nconst x = 1\n```')).toEqual([])
  })

  it('reports malformed rich directives with source positions', () => {
    expect(
      checkRichDirectiveSyntax(
        [':::gallery[Preview]', 'Visible prose', '', '![Screenshot](/preview.png)', ':::'].join('\n')
      )
    ).toEqual([
      {
        severity: 'error',
        message: 'Each Gallery item must contain exactly one Markdown image',
        line: 2,
        column: 1
      }
    ])
  })

  it('reports unknown directives unless an active plugin declares them', () => {
    const source = '::custom[Plugin content]'

    expect(checkRichDirectiveSyntax(source)).toEqual([
      {
        severity: 'error',
        message: 'Unknown Markdown directive `custom`',
        line: 1,
        column: 1
      }
    ])
    expect(
      checkRichDirectiveSyntax(source, 0, [{ name: 'custom-directive', directiveNames: ['custom'] }])
    ).toEqual([])
  })

  it('reports missing description', () => {
    expect(checkFrontmatterDescription({ title: 'Guide' })).toEqual([
      { severity: 'warning', message: 'Frontmatter description is missing' }
    ])
  })

  it('reports missing title', () => {
    expect(
      checkFrontmatterTitle(
        {},
        {
          ...createMockPage(),
          sourcePath: '',
          transformedSource: '',
          sourceRelativePath: 'docs/zh/index.md',
          relativePath: 'zh/index.md',
          version: 'current',
          versionBase: '/',
          docsDir: 'docs',
          locale: 'zh',
          routePath: '/',
          outputPath: 'index.html',
          markdownOutputPath: 'index.md',
          title: '',
          description: '',
          order: 0,
          group: '',
          status: 'published',
          search: true,
          ai: true,
          body: '',
          headings: [],
          searchText: '',
          codeExamples: [],
          demos: [],
          lastUpdated: new Date().toISOString(),
          frontmatter: {}
        }
      )
    ).toEqual([{ severity: 'warning', page: 'zh/index.md', message: 'Frontmatter title is missing' }])
  })

  it('reports missing image candidates', () => {
    expect(checkLinksAndImages('![Logo](./missing.png)', new Set(), 'zh/index.md')).toEqual([
      { severity: 'error', message: 'Image target does not exist: ./missing.png', line: 1, column: 1 }
    ])
  })

  it('validates root-relative images and downloads against public files', () => {
    const files = new Set(['public/logo.svg', 'public/files/schema.json'])
    expect(
      checkLinksAndImages(
        '![Logo](/logo.svg) [Schema](/files/schema.json) ![Missing](/missing.png)',
        files,
        'zh/index.md',
        new Set(['/'])
      )
    ).toEqual([
      { severity: 'error', message: 'Image target does not exist: /missing.png', line: 1, column: 49 }
    ])
  })

  it('reports missing relative links and accepts known routes', () => {
    expect(
      checkLinksAndImages(
        '[Missing](./missing.md) [Guide](/guide/)',
        new Set(['zh/guide.md']),
        'zh/index.md',
        new Set(['/guide/'])
      )
    ).toEqual([
      { severity: 'error', message: 'Link target does not exist: ./missing.md', line: 1, column: 1 }
    ])
  })

  it('treats every explicit URI scheme as external to the local file graph', () => {
    expect(
      checkLinksAndImages(
        '[SMS](sms:+123456) [FTP](ftp://example.com/file.txt) ![Inline](data:image/png;base64,AA==)',
        new Set(),
        'zh/index.md'
      )
    ).toEqual([])
  })

  it('normalizes trailing slashes and extensionless relative document links', () => {
    expect(
      checkLinksAndImages(
        '[Guide](/guide) [Relative](./guide)',
        new Set(['zh/guide.md']),
        'zh/index.md',
        new Set(['/guide/'])
      )
    ).toEqual([])
  })

  it('resolves extensionless links to Markdown files with uppercase extensions', () => {
    expect(checkLinksAndImages('[Guide](./guide)', new Set(['zh/guide.MDX']), 'zh/index.md')).toEqual([])
  })

  it('canonicalizes Unicode absolute links and accepts known generated files', () => {
    expect(
      checkLinksAndImages(
        '[Guide](/文档/) [LLMs](/llms.txt)',
        new Set(),
        'zh/index.md',
        new Set(['/%E6%96%87%E6%A1%A3/']),
        new Set(),
        new Map(),
        new Map(),
        new Set(['/llms.txt'])
      )
    ).toEqual([])
  })

  it('decodes URL-encoded relative file paths exactly once', () => {
    expect(
      checkLinksAndImages(
        '![Diagram](./images/system%20diagram.png) [Page](./foo%2520bar.md)',
        new Set(['zh/images/system diagram.png', 'zh/foo%20bar.md']),
        'zh/index.md'
      )
    ).toEqual([])
  })

  it('reports missing same-page fragments', () => {
    expect(
      checkLinksAndImages('[Missing](#unknown)', new Set(), 'zh/index.md', new Set(['/']), new Set(['known']))
    ).toEqual([{ severity: 'error', message: 'Heading target does not exist: #unknown', line: 1, column: 1 }])
  })

  it('reports duplicate headings', () => {
    const headings = analyzeMarkdown('# Intro\n\n## Intro').headings
    expect(
      checkDuplicateHeadings({
        ...createMockPage(),
        sourcePath: '',
        transformedSource: '',
        sourceRelativePath: 'docs/zh/index.md',
        relativePath: 'zh/index.md',
        version: 'current',
        versionBase: '/',
        docsDir: 'docs',
        locale: 'zh',
        routePath: '/',
        outputPath: 'index.html',
        markdownOutputPath: 'index.md',
        title: '',
        description: '',
        order: 0,
        group: '',
        status: 'published',
        search: true,
        ai: true,
        body: '# Intro\n\n## Intro',
        headings,
        searchText: 'Intro Other',
        codeExamples: [],
        demos: [],
        lastUpdated: new Date().toISOString(),
        frontmatter: {}
      })
    ).toEqual([
      {
        severity: 'warning',
        page: 'zh/index.md',
        message: 'Repeated heading "Intro" uses numbered anchors (#intro, #intro-1)'
      }
    ])
  })

  it('matches root default-locale pages with translated locale-directory pages', () => {
    const page = {
      ...createMockPage(),
      sourcePath: '',
      transformedSource: '',
      sourceRelativePath: 'docs/index.md',
      relativePath: 'index.md',
      version: 'current',
      versionBase: '/',
      docsDir: 'docs',
      locale: 'zh',
      routePath: '/',
      outputPath: 'index.html',
      markdownOutputPath: 'index.md',
      title: '首页',
      description: '',
      order: 0,
      group: '',
      status: 'published' as const,
      search: true,
      ai: true,
      body: '',
      headings: [],
      searchText: '',
      codeExamples: [],
      demos: [],
      lastUpdated: new Date().toISOString(),
      frontmatter: {}
    }

    expect(
      checkMissingTranslations({
        pages: [
          page,
          {
            ...page,
            sourceRelativePath: 'docs/en/index.md',
            relativePath: 'en/index.md',
            locale: 'en',
            routePath: '/en/',
            outputPath: 'en/index.html',
            markdownOutputPath: 'en/index.md'
          }
        ],
        sidebar: {},
        nav: {},
        locales: ['zh', 'en'],
        defaultLocale: 'zh',
        versions: [{ id: 'current', label: 'Current', docsDir: 'docs', base: '/' }],
        currentVersion: 'current'
      })
    ).toEqual([])
  })

  it('reports missing pages by version and locale without counting drafts as translations', () => {
    const original = createMockPage({ locale: 'zh', relativePath: 'guide.md', version: 'current' })
    const draft = createMockPage({
      locale: 'en',
      relativePath: 'en/guide.md',
      version: 'current',
      status: 'draft'
    })
    const graph = createMockGraph({
      pages: [original, draft],
      locales: ['zh', 'en'],
      versions: [{ id: 'current', label: 'Current', docsDir: 'docs', base: '/' }]
    })

    expect(summarizeTranslationCoverage(graph)).toEqual([
      { version: 'current', locale: 'zh', total: 1, existing: 1, missing: 0 },
      { version: 'current', locale: 'en', total: 1, existing: 0, missing: 1 }
    ])
    expect(checkMissingTranslations(graph)).toEqual([
      expect.objectContaining({ version: 'current', locale: 'en', relativePath: 'guide.md' })
    ])
  })
})
