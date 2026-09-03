import { describe, expect, it } from 'vitest'
import { analyzeMarkdown } from '@canofold/markdown/server/analyze'
import {
  checkCodeBlockLanguages,
  checkDuplicateHeadings,
  checkFrontmatterDescription,
  checkFrontmatterTitle,
  checkRichDirectiveSyntax,
  checkLinksAndImages,
  checkMissingTranslations
} from './runChecks'

describe('quality checks', () => {
  it('reports unlabeled code fences', () => {
    expect(checkCodeBlockLanguages('```\nconst x = 1\n```')).toEqual([
      { severity: 'warning', message: 'Code block is missing a language' }
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
        message: 'Each Gallery item must contain exactly one Markdown image (line 2, column 1)'
      }
    ])
  })

  it('reports unknown directives unless an active plugin declares them', () => {
    const source = '::custom[Plugin content]'

    expect(checkRichDirectiveSyntax(source)).toEqual([
      {
        severity: 'error',
        message: 'Unknown Markdown directive `custom` (line 1, column 1)'
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
          lastUpdated: new Date().toISOString(),
          frontmatter: {}
        }
      )
    ).toEqual([{ severity: 'warning', page: 'zh/index.md', message: 'Frontmatter title is missing' }])
  })

  it('reports missing image candidates', () => {
    expect(checkLinksAndImages('![Logo](./missing.png)', new Set(), 'zh/index.md')).toEqual([
      { severity: 'error', message: 'Image target does not exist: ./missing.png' }
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
    ).toEqual([{ severity: 'error', message: 'Image target does not exist: /missing.png' }])
  })

  it('reports missing relative links and accepts known routes', () => {
    expect(
      checkLinksAndImages(
        '[Missing](./missing.md) [Guide](/guide/)',
        new Set(['zh/guide.md']),
        'zh/index.md',
        new Set(['/guide/'])
      )
    ).toEqual([{ severity: 'error', message: 'Link target does not exist: ./missing.md' }])
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
    ).toEqual([{ severity: 'error', message: 'Heading target does not exist: #unknown' }])
  })

  it('reports duplicate headings', () => {
    const headings = analyzeMarkdown('# Intro\n\n## Intro').headings
    expect(
      checkDuplicateHeadings({
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
})
