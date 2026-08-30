import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MarkdownDocument } from '../react/Markdown'
import { prepareMarkdown } from './prepareMarkdown'
import type { RenderMarkdownOptions } from './types'

async function renderPreparedResult(source: string, options?: RenderMarkdownOptions) {
  const prepared = await prepareMarkdown(source, options)
  return {
    html: renderToStaticMarkup(createElement(MarkdownDocument, { document: prepared.document })),
    assets: prepared.assets
  }
}

async function renderPreparedHtml(source: string, options?: RenderMarkdownOptions) {
  return (await renderPreparedResult(source, options)).html
}

describe('renderPreparedHtml', () => {
  it('prepares a serializable document and asset hints before stringification', async () => {
    const prepared = await prepareMarkdown(['# Title', '', '```ts', 'const value = true', '```'].join('\n'))

    expect(prepared.document.type).toBe('root')
    expect(prepared.document.children.length).toBeGreaterThan(0)
    expect(prepared.assets.behaviors).toContain('code-toolbar')
  })

  it('renders headings with ids, callouts, and highlighted code', async () => {
    const html = await renderPreparedHtml(
      [
        '# Title',
        '',
        '## Getting Started',
        '',
        ':::tip 提示',
        'Use it.',
        ':::',
        '',
        '```ts',
        'const x = 1',
        '```'
      ].join('\n'),
      { html: 'trusted' }
    )

    expect(html).toMatch(/<h2[^>]*id="getting-started"/)
    expect(html).toContain('df-callout df-callout-tip')
    expect(html).toContain('data-df-component="callout"')
    expect(html).toContain('df-callout-title" data-df-slot="title"')
    expect(html).toContain('df-callout-body" data-df-slot="content"')
    expect(html).toContain('class="df-code"')
    expect(html).toContain('class="shiki')
    expect(html).toContain('class="df-code-lang" data-df-slot="title">ts<')
    expect(html).toContain('data-df-action="copy-code"')
    expect(html).not.toContain('data-df-action="download-code"')
    expect(html).not.toContain('download="snippet.ts"')
  })

  it('does not keep Shiki newline text nodes between code lines', async () => {
    const html = await renderPreparedHtml(['```ts', 'const one = 1', 'const two = 2', '```'].join('\n'))

    expect(html).toMatch(/class="line"[^>]*>[\s\S]*?<\/span><span class="line"/)
    expect(html).not.toMatch(/class="line"[^>]*>[\s\S]*?<\/span>\n<span class="line"/)
  })

  it('uses the Docfuse light and dark syntax themes by default', async () => {
    const html = await renderPreparedHtml(['```ts', "const title = 'Docfuse'", '```'].join('\n'))
    const markdownHtml = await renderPreparedHtml(['```md', '# Heading', '```'].join('\n'))

    expect(html).toContain('docfuse-light')
    expect(html).toContain('docfuse-dark')
    expect(html).toContain('#C6B5FF')
    expect(html).toContain('--shiki-dark:#C6B5FF')
    expect(html).toContain('#9FD3A7')
    expect(html).toContain('--shiki-dark:#9FD3A7')
    expect(markdownHtml).toContain('#9EC7F3')
  })

  it('allows hosts to override the default syntax themes', async () => {
    const html = await renderPreparedHtml(['```ts', 'const value = true', '```'].join('\n'), {
      code: { themes: { light: 'github-light', dark: 'github-dark' } }
    })

    expect(html).toContain('github-light')
    expect(html).toContain('github-dark')
    expect(html).not.toContain('docfuse-light')
  })

  it('preserves bracketed code titles and code-group file labels', async () => {
    const html = await renderPreparedHtml(
      [
        ':::code-group',
        '```ts [config.ts]',
        'const value = true',
        '```',
        '```js [config.js]',
        'const other = false',
        '```',
        ':::'
      ].join('\n')
    )

    expect(html).toContain('class="df-code-tab-label">config.ts<')
    expect(html).toContain('title="config.ts"')
    expect(html).toContain('data-df-action="copy-code"')
    expect(html).not.toContain('download="config.ts"')
    expect(html).toContain('data-df-file-icon="config" data-df-file-kind="config" aria-hidden="true"></span>')
  })

  it('preserves a standalone filename and fence-meta line highlights', async () => {
    const html = await renderPreparedHtml(
      ['```ts title="docfuse.config.ts" {2}', "const title = 'Docfuse'", 'const search = true', '```'].join(
        '\n'
      )
    )

    expect(html).toContain('data-df-filename="docfuse.config.ts"')
    expect(html).toContain('class="df-code-file-name">docfuse.config.ts<')
    expect(html).toContain('data-df-file-kind="config"')
    expect(html).toContain('class="line highlighted"')
  })

  it('renders every documented Shiki line annotation', async () => {
    const html = await renderPreparedHtml(
      [
        '```ts',
        "const removed = 'docs' // [!code --]",
        "const added = 'docfuse' // [!code ++]",
        'const highlighted = true // [!code highlight]',
        'const focused = buildSite(config) // [!code focus]',
        'const output = resolveOutput(config) // [!code word:resolveOutput]',
        "throw new Error('Invalid config') // [!code error]",
        "console.warn('Missing description') // [!code warning]",
        '```'
      ].join('\n')
    )

    expect(html).toContain('class="line diff remove"')
    expect(html).toContain('class="line diff add"')
    expect(html).toContain('class="line highlighted"')
    expect(html).toContain('class="line focused"')
    expect(html).toContain('class="highlighted-word"')
    expect(html).toMatch(/class="line [^"]*error[^"]*"/)
    expect(html).toMatch(/class="line [^"]*warning[^"]*"/)
    expect(html).not.toContain('[!code')
  })

  it('loads a custom fence language without replacing built-in languages', async () => {
    const html = await renderPreparedHtml(['```doc-ts', 'const ready = true', '```'].join('\n'), {
      code: {
        languages: {
          'doc-ts': () => import('@shikijs/langs/typescript')
        }
      }
    })

    expect(html).toContain('language-doc-ts')
    expect(html).toContain('#C6B5FF')
  })

  it('recovers the shared language-loading queue after a custom grammar fails', async () => {
    let attempts = 0
    const options: RenderMarkdownOptions = {
      code: {
        languages: {
          'flaky-ts': async () => {
            attempts += 1
            if (attempts === 1) throw new Error('Temporary grammar failure')
            return import('@shikijs/langs/typescript')
          }
        }
      }
    }
    const source = ['```flaky-ts', 'const recovered = true', '```'].join('\n')

    await expect(prepareMarkdown(source, options)).rejects.toThrow('Temporary grammar failure')
    await expect(renderPreparedHtml(source, options)).resolves.toContain('language-flaky-ts')
    expect(attempts).toBe(2)
  })

  it('can reject or safely fall back for unknown fence languages', async () => {
    const source = ['```not-a-language', 'opaque value', '```'].join('\n')

    await expect(prepareMarkdown(source, { code: { unknownLanguage: 'error' } })).rejects.toThrow(
      'Unsupported Markdown code language: not-a-language'
    )

    const html = await renderPreparedHtml(source, {
      code: { unknownLanguage: 'plain-text' }
    })
    expect(html).toContain('opaque value')
    expect(html).toContain('language-text')
    expect(html).toContain('data-df-language="text"')
  })

  it('renders plain-text fences with the same line model as highlighted code', async () => {
    const html = await renderPreparedHtml(
      ['```txt', 'docfuse.config.ts', 'docs/', '  index.md', '```'].join('\n')
    )

    expect(html.match(/class="line"/g)).toHaveLength(3)
    expect(html).toContain('<span class="line">docfuse.config.ts</span>')
    expect(html).toContain('<span class="line">  index.md</span>')
  })

  it('loads the Vue grammar for Vue single-file components', async () => {
    const html = await renderPreparedHtml(
      ['```vue [SearchPanel.vue]', '<script setup lang="ts">', 'const open = true', '</script>', '```'].join(
        '\n'
      )
    )

    expect(html).toContain('language-vue')
    expect(html).toContain('--shiki-dark:')
    expect(html).toContain('&lt;script')
    expect(html).toContain('data-df-file-icon="vue"')
  })

  it('loads the dotenv grammar for environment files', async () => {
    const html = await renderPreparedHtml(
      ['```dotenv [.env.production]', 'DOCFUSE_SEARCH=true', 'DOCFUSE_BASE_PATH=/docs/', '```'].join('\n')
    )

    expect(html).toContain('language-dotenv')
    expect(html).toContain('--shiki-dark:')
    expect(html).toContain('data-df-file-icon="environment"')
    expect(html.match(/class="line"/g)).toHaveLength(2)
  })

  it('keeps inline code and GFM tables as semantic HTML', async () => {
    const html = await renderPreparedHtml(['| A | B |', '| - | - |', '| 1 | `code` |'].join('\n'))
    expect(html).toMatch(/<table[^>]*data-df-slot="table"/)
    expect(html).toContain('class="df-sort-button"')
    expect(html).toContain('data-df-action="download-table"')
    expect(html).toContain('<code data-df-element="inline-code">code</code>')
  })

  it('does not normalize callout examples inside fenced code', async () => {
    const html = await renderPreparedHtml(['```md', ':::tip Title', 'Body', ':::', '```'].join('\n'))
    expect(html).toContain(':::tip Title')
    expect(html).not.toContain(':::tip[Title]')
  })

  it('preserves unmatched brackets in friendly callout titles', async () => {
    const html = await renderPreparedHtml(
      [':::tip Read ] first, then [ continue', 'Safe body.', ':::'].join('\n')
    )

    expect(html).toContain('df-callout df-callout-tip')
    expect(html).toContain('Read ] first, then [ continue')
    expect(html).toContain('Safe body.')
  })

  it('renders the markdown element coverage used by the interactive theme', async () => {
    const html = await renderPreparedHtml(
      [
        ':::info Info',
        'Read this first.',
        ':::',
        '',
        ':::danger Danger',
        'Be careful.',
        ':::',
        '',
        '- [x] Done',
        '- [ ] Later',
        '',
        '~~Removed~~ <mark>marked</mark> <kbd>Tab</kbd> H<sub>2</sub>O E=mc<sup>2</sup>',
        '',
        '<details><summary>More</summary><p>Hidden detail.</p></details>',
        '',
        'Term',
        ': Definition',
        '',
        'Footnote reference[^one].',
        '',
        '[^one]: Footnote body.'
      ].join('\n'),
      { html: 'trusted' }
    )

    expect(html).toContain('df-callout df-callout-info')
    expect(html).toContain('df-callout df-callout-danger')
    expect(html).toContain('class="contains-task-list"')
    expect(html).toContain('class="task-list-item"')
    expect(html).toContain('aria-label="Completed task"')
    expect(html).toContain('aria-label="Incomplete task"')
    expect(html).toContain('<del data-df-element="strikethrough">Removed</del>')
    expect(html).toContain('<mark data-df-element="highlight">marked</mark>')
    expect(html).toContain('<kbd data-df-element="keyboard">Tab</kbd>')
    expect(html).toContain(
      '<details data-df-component="details" data-df-slot="root" data-df-behavior="details"'
    )
    expect(html).toContain('<summary data-df-slot="summary"')
    expect(html).toContain('class="df-details-content" data-df-slot="content"')
    expect(html).toContain('<dl data-df-element="definition-list">')
    expect(html).toContain('<dt data-df-element="definition-term">Term</dt>')
    expect(html).toMatch(/<dd data-df-element="definition-description">Definition\s*<\/dd>/)
    expect(html).toContain('data-footnotes')
    expect(html).toContain('data-df-element="footnotes"')
    expect(html).not.toContain('class="sr-only df-heading-with-anchor"')
    expect(html).not.toContain('data-df-behavior="heading"')
  })

  it('renders Definition List Markdown as semantic HTML', async () => {
    const html = await renderPreparedHtml(
      [
        'Fixed behavior',
        ': Semantic structure and keyboard behavior.',
        '',
        'Configurable behavior',
        ': Color, type, and localized labels.',
        '',
        ': Definitions can contain a second paragraph.'
      ].join('\n')
    )

    expect(html).toContain('<dl data-df-element="definition-list">')
    expect(html).toContain('<dt data-df-element="definition-term">Fixed behavior</dt>')
    expect(html).toMatch(
      /<dd data-df-element="definition-description">Semantic structure and keyboard behavior\.\s*<\/dd>/
    )
    expect(html).toContain('<dt data-df-element="definition-term">Configurable behavior</dt>')
    expect(html).toContain('<p data-df-element="paragraph">Definitions can contain a second paragraph.</p>')
  })

  it('renders Tabs and Code Group directives with the shared tab contract', async () => {
    const result = await renderPreparedResult(
      [
        '::::tabs[安装方式]',
        ':::tab[快速安装]',
        '使用默认配置。',
        ':::',
        ':::tab[手动配置]',
        '显式配置。',
        ':::',
        '::::',
        '',
        ':::code-group[包管理器]',
        '```bash title="pnpm"',
        'pnpm add @docfuse/markdown',
        '```',
        '```bash title="npm"',
        'npm install @docfuse/markdown',
        '```',
        ':::'
      ].join('\n'),
      { html: 'trusted' }
    )

    expect(result.html).toContain('class="df-tabs"')
    expect(result.html).toContain('class="df-tabs df-code-group"')
    expect(result.html).toContain('data-df-slot="tab-list"')
    expect(result.html).toContain('data-df-slot="panel"')
    expect(result.html).toContain('role="tablist"')
    expect(result.html).toContain('role="tabpanel"')
    expect(result.html).toContain('aria-selected="true"')
    expect(result.html).toContain('data-df-tab="tab-1"')
    expect(result.html).toContain('>pnpm<')
    expect(result.html).toContain('>npm<')
    expect(result.html).toContain('>pnpm</span>')
    expect(result.html).toContain('>npm</span>')
    expect(result.html).toContain(' add</span>')
    expect(result.html).toContain(' install</span>')
    expect(result.html).not.toMatch(
      /<button[^>]*data-df-tab="quick-install-1"[^>]*>\s*<span class="df-code-file-icon"/i
    )
  })

  it('uses configurable localized fallbacks for unnamed tab groups and items', async () => {
    const result = await renderPreparedResult(
      [
        '::::tabs',
        ':::tab',
        '默认选项。',
        ':::',
        '::::',
        '',
        ':::code-group',
        '```',
        'pnpm install',
        '```',
        ':::'
      ].join('\n'),
      {
        labels: {
          tabsTitle: '选项卡',
          tabItem: '选项 {index}',
          codeGroupTitle: '代码组',
          codeGroupItem: '代码 {index}'
        }
      }
    )

    expect(result.html).toContain('aria-label="选项卡"')
    expect(result.html).toContain('>选项 1<')
    expect(result.html).toContain('aria-label="代码组"')
    expect(result.html).toContain('>代码 1<')
  })

  it('uses filename-first associations for code-group labels', async () => {
    const result = await renderPreparedResult(
      [
        ':::code-group[Repository files]',
        '```text title=".env.production"',
        'DOCFUSE_SEARCH=true',
        '```',
        '```yaml title="pnpm-workspace.yaml"',
        'packages: []',
        '```',
        ':::'
      ].join('\n')
    )

    expect(result.html).toContain('data-df-file-icon="environment"')
    expect(result.html).toContain('data-df-file-kind="environment"')
    expect(result.html).not.toContain('>ENV</span>')
    expect(result.html).toContain('data-df-file-kind="package"')
  })

  it('renders terminal fences as copyable dark output blocks', async () => {
    const result = await renderPreparedResult(
      ['```terminal title="Build output"', '$ pnpm run build:site', '✓ Built 42 pages in 1.8s', '```'].join(
        '\n'
      )
    )

    expect(result.html).toContain('class="df-terminal"')
    expect(result.html).not.toContain('data-df-source=')
    expect(result.html).toContain('>Build output<')
    expect(result.html).toContain('class="df-copy-snippet-button"')
    expect(result.html).toContain('aria-label="Copy terminal output"')
    expect(result.html).toContain('class="df-terminal-prompt">$</span> pnpm run build:site')
    expect(result.html).toContain('class="df-terminal-status">✓</span> Built 42 pages in 1.8s')
  })

  it('uses the configurable terminal title when fenced metadata omits one', async () => {
    const result = await renderPreparedResult(['```terminal', '$ pnpm build', '```'].join('\n'), {
      labels: { terminalTitle: '终端' }
    })

    expect(result.html).toContain('data-df-title="终端"')
    expect(result.html).toContain('>终端<')
  })

  it('renders Steps directives as the documented ordered-list contract', async () => {
    const result = await renderPreparedResult(
      [
        '::::steps[发布流程]',
        ':::step[安装渲染器]',
        '添加 `@docfuse/markdown`。',
        ':::',
        ':::step[构建站点]',
        '执行构建并检查输出。',
        ':::',
        '::::'
      ].join('\n'),
      { html: 'trusted' }
    )

    expect(result.html).toMatch(/<ol[^>]*class="df-steps"[^>]*aria-label="发布流程"[^>]*>/)
    expect(result.html).toContain('data-df-component="steps"')
    expect(result.html).toContain(
      '<strong class="df-step-title" data-df-element="strong">安装渲染器</strong>'
    )
    expect(result.html).toContain('<strong class="df-step-title" data-df-element="strong">构建站点</strong>')
    expect(result.assets.behaviors).toEqual([])
  })

  it('renders rich document directives without exposing internal DOM contracts to authors', async () => {
    const result = await renderPreparedResult(
      [
        ':badge[Beta]{tone="accent"}',
        '',
        ':copy[pnpm add @docfuse/markdown]',
        '',
        ':::aside[Implementation note]',
        'Keep the main flow concise.',
        ':::',
        '',
        ':::file-tree',
        '- docs/',
        '  - guide/',
        '    - index.md',
        '- docfuse.config.ts',
        ':::',
        '',
        '::::card-grid',
        ':::card[Guide]{href="/guide/"}',
        'Install and configure the site.',
        ':::',
        '::::',
        '',
        '::::api{method="GET" path="/api/docs/:slug"}',
        '| Parameter | Type |',
        '| --- | --- |',
        '| `slug` | :badge[string] |',
        ':::response[200]',
        '`{ "title": "Docfuse" }`',
        ':::',
        '::::',
        '',
        ':::gallery[Screenshots]',
        '![Editor](/editor.png "Source and preview")',
        ':::'
      ].join('\n')
    )

    expect(result.html).toContain('class="df-badge df-badge-accent"')
    expect(result.html).toContain('data-df-component="copy-snippet"')
    expect(result.html).toContain('class="df-aside" data-df-component="aside"')
    expect(result.html).toContain('class="df-file-tree" data-df-component="file-tree"')
    expect(result.html).toContain('data-df-file-tree-branch=""')
    expect(result.html).toContain('data-df-file-tree-file=""')
    expect(result.html).toContain('class="df-card-grid" data-df-component="card-grid"')
    expect(result.html).toContain('class="df-link-card" href="/guide/"')
    expect(result.html).toContain('class="df-api-block" data-df-component="api"')
    expect(result.html).toContain('class="df-api-method">GET</span>')
    expect(result.html).toContain(
      'class="df-badge" data-df-component="badge" data-df-slot="label">string</span>'
    )
    expect(result.html).toContain('class="df-api-response"')
    expect(result.html).toContain('class="df-image-gallery" data-df-component="gallery"')
    expect(result.html).toContain('data-df-gallery-label="Screenshots"')
    expect(result.html).toContain('aria-label="Screenshots"')
    expect(result.html).toContain('<figcaption>Source and preview</figcaption>')
    expect(result.html.match(/data-df-action="open-gallery"/g)).toHaveLength(1)
    expect(result.html.match(/<figure data-df-slot="item"/g)).toHaveLength(1)
    expect(result.html).not.toContain('<figure><img src="/editor.png"')
    expect(result.assets.behaviors).toEqual(expect.arrayContaining(['copy-snippet', 'file-tree', 'gallery']))
  })

  it('renders details and trusted media directives without author HTML', async () => {
    const result = await renderPreparedResult(
      [
        ':::details[Deployment checks]{open}',
        '- Verify internal links.',
        '- Run the production build.',
        ':::',
        '',
        '::video[Release demo]{src="/demo.mp4" poster="/poster.jpg"}',
        '',
        '::audio[Release notes]{src="/notes.mp3"}',
        '',
        '::embed[Getting started]{src="/guide/" allowfullscreen}',
        '',
        '::embed[Trusted player]{src="/player/" sandbox="allow-scripts allow-same-origin"}'
      ].join('\n')
    )

    expect(result.html).toContain('<details open=""')
    expect(result.html).toMatch(
      /<summary[^>]*data-df-slot="summary"[^>]*data-df-element="summary"[^>]*>Deployment checks/
    )
    expect(result.html).toMatch(/<video[^>]*src="\/demo\.mp4"[^>]*poster="\/poster\.jpg"/)
    expect(result.html).toContain(
      'controls="" preload="metadata" title="Release demo" aria-label="Release demo"'
    )
    expect(result.html).toContain('<audio src="/notes.mp3" controls="" preload="none"')
    expect(result.html).toContain('aria-label="Release notes"')
    expect(result.html).toContain('<iframe src="/guide/" title="Getting started" loading="lazy"')
    expect(result.html).toContain('sandbox="" referrerPolicy="no-referrer"')
    expect(result.html).toContain('sandbox="allow-scripts allow-same-origin"')
    expect(result.html).toContain('allowFullScreen=""')
    expect(result.assets.behaviors).toContain('details')
  })

  it.each([
    [
      'gallery content other than images',
      [':::gallery[Preview]', 'Visible prose', '', '![Screenshot](/preview.png)', ':::'].join('\n'),
      'Each Gallery item must contain exactly one Markdown image'
    ],
    [
      'multiple gallery images in one paragraph',
      [':::gallery[Preview]', '![One](/one.png) ![Two](/two.png)', ':::'].join('\n'),
      'Each Gallery item must contain exactly one Markdown image'
    ],
    [
      'a card without href',
      ':::card[Guide]\nOpen the guide.\n:::',
      'Card directives require an `href` attribute'
    ],
    [
      'an API block without method',
      ':::api{path="/api/docs"}\nBody\n:::',
      'API directives require a `method` attribute'
    ],
    [
      'an orphan API response',
      ':::response[200]\nOK\n:::',
      'Response directives must be direct children of an API directive'
    ],
    ['an unlabeled embed', '::embed{src="/guide/"}', 'Embed directives require an accessible label'],
    [
      'an unsafe media URL',
      '::embed[Unsafe]{src="javascript:alert(1)"}',
      'Embed `src` must use a relative, HTTP, or HTTPS URL'
    ],
    ['an invalid badge tone', ':badge[Beta]{tone="purple"}', 'Badge `tone` must be one of'],
    ['an unknown directive', ':::galery[Preview]\nText\n:::', 'Unknown Markdown directive `galery`']
  ])('rejects %s instead of silently degrading content', async (_name, source, message) => {
    await expect(prepareMarkdown(source)).rejects.toThrow(message)
  })

  it('returns asset hints for host shells', async () => {
    const result = await renderPreparedResult(
      ['## Assets', '', '```ts', 'const ready = true', '```'].join('\n')
    )

    expect(result.html).toContain('id="assets"')
    expect(result.assets).toEqual({
      behaviors: ['heading', 'code-toolbar'],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('marks Markdown images for the React Image Island', async () => {
    const result = await renderPreparedResult('![Preview](/preview.png)')

    expect(result.html).toContain('data-df-island="image"')
    expect(result.html).toContain('src="/preview.png"')
    expect(result.assets.behaviors).toContain('image')
  })

  it('renders standalone PDF and Office links as file icon plus filename', async () => {
    const html = await renderPreparedHtml(
      [
        '[Quarterly report](./files/quarterly-report.pdf)',
        '',
        '[Remote workbook](https://cdn.example.com/files/budget%202026.xlsx?download=1)',
        '',
        'Keep [the Word file](./files/guide.docx) inline in this sentence.'
      ].join('\n')
    )

    expect(html).toContain('class="df-file-link"')
    expect(html).toContain('class="df-file-icon" data-df-file-icon="pdf" aria-hidden="true"></span>')
    expect(html).toContain('class="df-file-name">quarterly-report.pdf</span>')
    expect(html).toContain('class="df-file-meta">PDF document · PDF</span>')
    expect(html).toContain('class="df-file-icon" data-df-file-icon="excel" aria-hidden="true"></span>')
    expect(html).toContain('class="df-file-name">budget 2026.xlsx</span>')
    expect(html).toContain('class="df-file-meta">Microsoft Excel · XLSX</span>')
    expect(html).toContain('class="df-file-download" aria-hidden="true"></span>')
    expect(html).toContain(
      'Keep <a href="./files/guide.docx" data-df-element="link">the Word file</a> inline'
    )
  })

  it('marks trusted figure images for the same React Image Island', async () => {
    const result = await renderPreparedResult(
      [
        '<figure>',
        '  <img src="/figure.png" alt="Figure preview">',
        '  <figcaption>Figure caption</figcaption>',
        '</figure>'
      ].join('\n'),
      { html: 'trusted' }
    )

    expect(result.html).toContain('data-df-component="image"')
    expect(result.html).toContain('data-df-island="image"')
    expect(result.html).toContain('data-df-action="zoom-image"')
    expect(result.html).toContain('Figure caption')
    expect(result.assets.behaviors).toContain('image')
  })

  it('can strip raw HTML for untrusted markdown', async () => {
    const byDefault = await renderPreparedHtml('<mark>marked</mark>')
    const trusted = await renderPreparedHtml('<mark>marked</mark>', { html: 'trusted' })
    const stripped = await renderPreparedHtml('<mark>marked</mark>', { html: 'strip' })

    expect(trusted).toContain('<mark data-df-element="highlight">marked</mark>')
    expect(byDefault).not.toContain('<mark data-df-element="highlight">marked</mark>')
    expect(stripped).not.toContain('<mark data-df-element="highlight">marked</mark>')
  })

  it('sanitizes unsafe HTML while preserving safe semantic content', async () => {
    const result = await renderPreparedResult(
      [
        '<script>alert("unsafe")</script>',
        '<img src="preview.png" alt="Preview" onerror="alert(1)">',
        '<a href="javascript:alert(1)" onclick="alert(1)">Unsafe link</a>',
        '<mark>Safe highlight</mark>',
        '<div class="df-image-gallery"><img src="one.png" alt="One"></div>'
      ].join('\n'),
      { html: 'sanitize' }
    )

    expect(result.html).not.toContain('<script')
    expect(result.html).not.toContain('onerror')
    expect(result.html).not.toContain('onclick')
    expect(result.html).not.toContain('javascript:')
    expect(result.html).toContain('Safe highlight')
    expect(result.assets.behaviors).not.toContain('gallery')
  })

  it('preserves compiler-owned interactive blocks when author HTML is sanitized', async () => {
    const result = await renderPreparedResult(
      [
        '::::tabs[Install]',
        ':::tab[Package manager]',
        'Use pnpm.',
        ':::',
        '::::',
        '',
        ':::tip[Safe default]',
        'Keep sanitization enabled.',
        ':::',
        '',
        '::::steps[Release]',
        ':::step[Build]',
        'Run the build.',
        ':::',
        '::::',
        '',
        '```terminal title="Build"',
        '$ pnpm build',
        '```',
        '',
        '<div class="df-tabs" data-df-component="tabs" data-df-behavior="tabs" onclick="alert(1)">Forged tabs</div>'
      ].join('\n'),
      { html: 'sanitize' }
    )

    expect(result.html).toContain('class="df-tabs"')
    expect(result.html).toContain('data-df-behavior="tabs"')
    expect(result.html).toContain('role="tablist"')
    expect(result.html).toContain('class="df-callout df-callout-tip"')
    expect(result.html).toContain('class="df-steps"')
    expect(result.html).toContain('data-df-component="terminal"')
    expect(result.html).toContain('Forged tabs')
    expect(result.html).not.toContain('onclick')
    expect(result.html.match(/data-df-behavior="tabs"/g)).toHaveLength(1)
    expect(result.assets.behaviors).toContain('tabs')
  })

  it('collects Islands and resources from trusted HTML components', async () => {
    const result = await renderPreparedResult(
      [
        '<div class="df-image-gallery" data-df-component="gallery"><figure><img src="one.png" alt="One"></figure></div>',
        '<div class="df-tabs" data-df-component="tabs">Tabs</div>',
        '<pre class="mermaid">flowchart LR; A --> B</pre>'
      ].join('\n'),
      { html: 'trusted' }
    )

    expect(result.assets.behaviors).toEqual(expect.arrayContaining(['gallery', 'tabs']))
    expect(result.assets.behaviors).not.toContain('diagram')
  })

  it('keeps compiler transforms idempotent for trusted rich wrappers', async () => {
    const html = await renderPreparedHtml(
      [
        '<figure data-df-component="table"><table><tbody><tr><td>A</td></tr></tbody></table></figure>',
        '<figure data-df-component="code-block"><pre><code>const a = 1</code></pre></figure>'
      ].join('\n'),
      { html: 'trusted' }
    )
    expect(html.match(/data-df-component="table"/g)).toHaveLength(1)
    expect(html.match(/data-df-component="code-block"/g)).toHaveLength(1)
  })

  it('does not treat an annotated fence line as a closing fence', async () => {
    const html = await renderPreparedHtml(['```md', '```example', ':::tip Wrong', '```', '```'].join('\n'))
    expect(html).toContain(':::tip Wrong')
    expect(html).not.toContain(':::tip[Wrong]')
  })

  it('can disable rich document block wrapping', async () => {
    const html = await renderPreparedHtml(
      ['## Section', '', '| A |', '| - |', '| 1 |', '', '```ts', 'const x = 1', '```'].join('\n'),
      {
        features: {
          documentBlocks: false,
          codeBlocks: false
        }
      }
    )

    expect(html).toMatch(/<h2[^>]*id="section"[^>]*>Section/)
    expect(html).toMatch(/<table[^>]*data-df-element="table">/)
    expect(html).not.toContain('df-table-window')
    expect(html).not.toContain('class="df-code"')
  })

  it('supports custom renderer labels', async () => {
    const html = await renderPreparedHtml(['## Section', '', '| A |', '| - |', '| 1 |'].join('\n'), {
      labels: {
        copySectionLink: 'Copy heading',
        tableTitle: 'dataset',
        copyTableCsv: 'Copy CSV'
      }
    })

    expect(html).toContain('aria-label="Copy heading"')
    expect(html).toContain('<span>dataset</span>')
    expect(html).toContain('aria-label="Copy CSV"')
  })
})
