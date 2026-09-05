import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import type { MarkdownClassNames, RenderMarkdownOptions } from '@canofold/markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMdxResult } from './renderMdx'

async function renderMdxToHtml(
  source: string,
  sourcePath?: string,
  projectRoot?: string,
  options?: RenderMarkdownOptions,
  classNames?: MarkdownClassNames
) {
  return renderToStaticMarkup(
    (await renderMdxResult(source, sourcePath, projectRoot, options, classNames)).content
  )
}

describe('renderMdxToHtml', () => {
  it('returns only the optional assets required by the MDX source', async () => {
    const result = await renderMdxResult('# Hello\n\nA short page.')

    expect(result.assets).toEqual({
      behaviors: [],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('rejects retired package component imports', async () => {
    await expect(renderMdxResult("import { Alert } from 'canofold/components'\n\n<Alert />")).rejects.toThrow(
      'External import is not allowed: canofold/components'
    )
  })

  it('shares heading processing and leaves optional math to Markdown plugins', async () => {
    const result = await renderMdxResult('# Formula\n\n$E = mc^2$')
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('id="formula"')
    expect(html).toContain('$E = mc^2$')
    expect(html).not.toContain('katex')
    expect(result.assets.math).toBe(false)
  })

  it('uses the shared semantic React element map', async () => {
    const html = await renderMdxToHtml(`[Docs](/docs) with **strong**, *emphasis*, ~~removed~~ and \`code\`.

- [x] Complete

| Name | Value |
| --- | --- |
| One | 1 |

---

Term
: Definition`)

    expect(html).toContain('data-cf-element="link"')
    expect(html).toContain('data-cf-element="strong"')
    expect(html).toContain('data-cf-element="inline-code"')
    expect(html).toContain('data-cf-element="task-checkbox"')
    expect(html).toContain('data-cf-element="table-header"')
    expect(html).toContain('data-cf-element="horizontal-rule"')
    expect(html).toContain('data-cf-element="definition-list"')
    expect(html.match(/<table\b/g)).toHaveLength(1)
    expect(html).not.toMatch(/\s(?:tableTitle|copyLabel|copyFailureLabel|downloadLabel|zoomLabel)=/)
  })

  it('applies Canofold Markdown class names through the shared MDX map', async () => {
    const html = await renderMdxToHtml('# Branded', undefined, undefined, undefined, {
      heading: 'brand-heading'
    })

    expect(html).toContain('class="brand-heading"')
    expect(html).toContain('data-cf-element="heading"')
  })

  it('shares rich Markdown blocks and document wrappers with the .md pipeline', async () => {
    const html = await renderMdxToHtml(`## MDX 富区块

:::info[说明]
MDX callout
:::

::::tabs[安装方式]
:::tab[快速安装]
使用默认配置。
:::
:::tab[手动配置]
显式配置。
:::
::::

::::steps[发布流程]
:::step[构建]
执行构建。
:::
::::

| 元素 | 状态 |
| --- | --- |
| table | ready |

~~~ts
const result = buildSite(config)
~~~

~~~terminal title="Terminal"
$ pnpm build
~~~`)

    expect(html).toContain('cf-callout')
    expect(html).toContain('cf-tabs')
    expect(html).toContain('data-cf-tab-panel')
    expect(html).toContain('cf-steps')
    expect(html).toContain('cf-table-window')
    expect(html).toContain('cf-code')
    expect(html).toContain('cf-terminal')
    expect(html).toContain('cf-anchor')
  })

  it('provides React extension containers to MDX without local imports', async () => {
    const html = await renderMdxToHtml(`<MarkdownFileTree><span>docs</span></MarkdownFileTree>

<MarkdownGallery><figure><img src="gallery.png" alt="Gallery" /></figure></MarkdownGallery>

<MarkdownBadge>Beta</MarkdownBadge>

<MarkdownDetails><summary>More</summary>Details content</MarkdownDetails>`)

    expect(html).toContain('class="cf-file-tree"')
    expect(html).toContain('data-cf-component="gallery"')
    expect(html).toContain('data-cf-component="badge"')
    expect(html).toContain('data-cf-component="details"')
  })

  it('detects optional assets from the evaluated MDX AST attributes', async () => {
    const result = await renderMdxResult(`<MarkdownImage src={'image.png'} alt={'Preview'} />`)

    expect(result.assets).toEqual({
      behaviors: ['image'],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('renders trusted local TSX components', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-mdx-local-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/LocalBadge.tsx'),
      `export function LocalBadge() {
  return <strong>Local component</strong>
}
`
    )

    const html = await renderMdxToHtml(
      `import { LocalBadge } from './LocalBadge'

# Hello

<LocalBadge />
`,
      pagePath
    )

    expect(html).toContain('Local component')
  })

  it('merges optional assets detected from local component output source', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-mdx-local-assets-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'docs/zh/LocalImage.tsx'),
      `function Image() {
  return <figure data-cf-component="image"><img src="image.png" alt="Preview" /></figure>
}

export function LocalImage() {
  return <Image />
}
`
    )

    const result = await renderMdxResult(
      `import { LocalImage } from './LocalImage'

<LocalImage />`,
      pagePath,
      cwd
    )

    expect(result.assets).toEqual({
      behaviors: ['image'],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('renders monorepo package source through an explicit relative import', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-mdx-monorepo-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'packages/ui/src'), { recursive: true })
    const pagePath = join(cwd, 'docs/zh/index.mdx')
    await writeFile(
      join(cwd, 'packages/ui/src/ButtonDemo.tsx'),
      `export function ButtonDemo() {
  return <button>Workspace source</button>
}
`
    )

    const html = await renderMdxToHtml(
      `import { ButtonDemo } from '../../packages/ui/src/ButtonDemo'

# Hello

<ButtonDemo />
`,
      pagePath,
      cwd
    )

    expect(html).toContain('Workspace source')
  })
})
