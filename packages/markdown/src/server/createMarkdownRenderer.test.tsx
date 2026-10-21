import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { MarkdownNamedComponentProps } from '../react/componentMap'
import { createMarkdownRenderer } from './createMarkdownRenderer'
import { visit } from 'unist-util-visit'
import type { Root as MdastRoot } from 'mdast'
import type { Root as HastRoot } from 'hast'

describe('Markdown server renderer', () => {
  it.each(['markdown', 'mdx'] as const)(
    'returns isolated %s resource facts from the compiler even after prepared-tree eviction',
    async (mode) => {
      const renderer = createMarkdownRenderer({ maxEntries: 1 })
      const source = '# Guide\n\nSection\n---\n\n![Figure][image]\n\n[image]: https://example.com/image.png'
      const first = await renderer.analyze(source, { mode })
      expect(first.assets.behaviors).toEqual(expect.arrayContaining(['heading', 'image']))
      first.assets.behaviors.length = 0
      await renderer.analyze('# Another page', { mode })
      const next = await renderer.analyze(source, { mode })
      expect(next.assets.behaviors).toEqual(expect.arrayContaining(['heading', 'image']))
    }
  )
  it.each(['strip', 'trusted', 'sanitize'] as const)(
    'excludes generated footnote UI from %s content metadata',
    async (html) => {
      const analysis = await createMarkdownRenderer().analyze('# Guide\n\nText[^note]\n\n[^note]: Note', {
        markdown: { html }
      })
      expect(analysis.headings).toEqual([{ level: 1, text: 'Guide', slug: 'guide' }])
      expect(analysis.text).toBe('Guide Text Note')
      expect(analysis.excerpt).toBe('Text')
      expect(analysis.links).toEqual([])
      expect(analysis.anchors).toContain('user-content-fn-note')
    }
  )
  it('analyzes generated headings and resources without inventing source positions', async () => {
    const renderer = createMarkdownRenderer()
    const markdown = {
      plugins: [
        {
          name: 'generated-content',
          rehypePlugins: [
            () => (tree: HastRoot) => {
              tree.children.push(
                {
                  type: 'element',
                  tagName: 'h2',
                  properties: { id: 'generated' },
                  children: [{ type: 'text', value: 'Generated' }]
                },
                {
                  type: 'element',
                  tagName: 'a',
                  properties: { href: '#generated' },
                  children: [{ type: 'text', value: 'Read' }]
                },
                {
                  type: 'element',
                  tagName: 'img',
                  properties: { src: './generated.svg', alt: 'Generated illustration' },
                  children: []
                }
              )
            }
          ]
        }
      ]
    }
    const result = await renderer.analyze('# Home', { markdown })
    expect(result.headings).toContainEqual({ level: 2, text: 'Generated', slug: 'generated' })
    expect(result.anchors).toContain('generated')
    expect(result.links).toEqual(['#generated'])
    expect(result.images).toEqual(['./generated.svg'])
    expect(result.linkLocations).toEqual([null])
    expect(result.imageLocations).toEqual([null])
    result.headings.length = 0
    expect((await renderer.analyze('# Home', { markdown })).headings).toHaveLength(2)
  })

  it('compiles MDX metadata without evaluating author code', async () => {
    const renderer = createMarkdownRenderer()
    const source =
      'export const value = (() => { throw new Error("author code executed") })()\n\n# Static heading\n\nKnown text\n\n{value}'
    const analysis = await renderer.analyze(source, { mode: 'mdx' })
    expect(analysis.headings).toEqual([{ level: 1, text: 'Static heading', slug: 'static-heading' }])
    expect(analysis.text).toBe('Static heading Known text')
    expect(analysis.excerpt).toBe('Known text')
    await expect(renderer.renderMdx(source)).rejects.toThrow('author code executed')
  })

  it('collects static native MDX JSX headings, links, and images without evaluating expressions', async () => {
    const renderer = createMarkdownRenderer()
    const source = [
      '<h2 id="jsx-heading">JSX heading</h2>',
      '<img src="./figure.svg" srcSet="./figure.svg 1x, ./figure-2x.svg 2x" alt="Figure" />',
      'Read <a href="#jsx-heading">the section</a>',
      '<MarkdownImage src={"./frame.svg"} alt="Frame" />',
      '<a href={(() => { throw new Error("evaluated") })()}>Dynamic</a>',
      '<source srcSet="./picture-small.svg 480w, ./picture-large.svg 960w" />'
    ].join('\n')
    const analysis = await renderer.analyze(source, { mode: 'mdx' })
    expect(analysis.headings).toEqual([{ level: 2, text: 'JSX heading', slug: 'jsx-heading' }])
    expect(analysis.anchors).toContain('jsx-heading')
    expect(analysis.links).toEqual(['#jsx-heading'])
    expect(analysis.linkLocations).toEqual([{ line: 3, column: 6 }])
    expect(analysis.images).toEqual([
      './figure.svg',
      './figure-2x.svg',
      './frame.svg',
      './picture-small.svg',
      './picture-large.svg'
    ])
    expect(analysis.imageLocations).toEqual([
      { line: 2, column: 1 },
      { line: 2, column: 1 },
      { line: 4, column: 1 },
      { line: 6, column: 1 },
      { line: 6, column: 1 }
    ])
    expect(analysis.text).toBe('JSX heading Figure Read the section Frame Dynamic')
    expect(analysis.excerpt).toBe('Figure')
  })

  it('respects JSX attribute precedence without treating spread values as static facts', async () => {
    const renderer = createMarkdownRenderer()
    const source = [
      'export const props = { src: "./dynamic.svg", href: "#dynamic", id: "dynamic" }',
      '<img src="./obsolete.svg" src="./last.svg" />',
      '<img src="./overridden.svg" {...props} />',
      '<img {...props} src="./explicit.svg" />',
      '<a href="#obsolete" href={props.href}>Dynamic link</a>',
      '<a {...props} href="#explicit">Explicit link</a>',
      '<h2 id="overridden" {...props}>Dynamic heading</h2>',
      '<h2 {...props} id="explicit">Explicit heading</h2>',
      '<source srcSet="./overridden.svg 1x" {...props} />'
    ].join('\n\n')
    const analysis = await renderer.analyze(source, { mode: 'mdx' })
    expect(analysis.images).toEqual(['./last.svg', './explicit.svg'])
    expect(analysis.links).toEqual(['#explicit'])
    expect(analysis.headings).toEqual([{ level: 2, text: 'Explicit heading', slug: 'explicit' }])
    expect(analysis.anchors).toEqual(['explicit'])
  })

  it.each(['markdown', 'mdx'] as const)(
    'analyzes the same transformed %s document that it renders',
    async (mode) => {
      const remarkTransform = vi.fn(async (tree: MdastRoot) => {
        visit(tree, 'heading', (node) => {
          node.children = [{ type: 'text', value: 'Published heading' }]
        })
        visit(tree, 'link', (node) => {
          node.url = './published.md'
        })
        visit(tree, 'image', (node) => {
          node.url = './published.svg'
        })
        visit(tree, 'code', (node) => {
          node.value = 'const published = true'
        })
      })
      const markdown = {
        plugins: [
          {
            name: 'published-content',
            version: '1',
            remarkPlugins: [() => remarkTransform],
            rehypePlugins: [
              () => async (tree: HastRoot) => {
                visit(tree, 'element', (node) => {
                  if (node.tagName === 'h1') node.properties.id = 'final-heading'
                  if (node.tagName === 'img') node.properties.src = './final.svg'
                })
              }
            ]
          }
        ]
      }
      const source =
        '# Original heading\n\n[Read](./original.md)\n\n![Picture](./original.svg)\n\n```js\nconst original = true\n```'
      const renderer = createMarkdownRenderer()
      const analysis = await renderer.analyze(source, { markdown, mode })
      const result =
        mode === 'mdx'
          ? await renderer.renderMdx(source, { markdown })
          : await renderer.render(source, { markdown })
      const html = renderToStaticMarkup(result.content)
      expect(analysis.headings).toEqual([{ level: 1, text: 'Published heading', slug: 'final-heading' }])
      expect(analysis.text).toContain('Published heading')
      expect(analysis.text).not.toContain('Original heading')
      expect(analysis.links).toEqual(['./published.md'])
      expect(analysis.images).toEqual(['./final.svg'])
      expect(analysis.linkLocations).toEqual([{ line: 3, column: 1 }])
      expect(analysis.imageLocations).toEqual([{ line: 5, column: 1 }])
      expect(analysis.codeExamples).toEqual([{ language: 'js', code: 'const published = true' }])
      expect(html).toContain('id="final-heading"')
      expect(html).toContain('href="./published.md"')
      expect(html).toContain('src="./final.svg"')
      expect(remarkTransform).toHaveBeenCalledTimes(1)
    }
  )

  const prefixProjectPath = (value: string) =>
    value.startsWith('/') && !value.startsWith('/project/') ? `/project${value}` : value

  it('transforms native MDX JSX URLs once, after expressions and spreads resolve', async () => {
    const renderer = createMarkdownRenderer()
    const source = [
      'export const attrs = { href: "/guide/", src: "/image.png" }',
      '<a {...attrs}>Native <strong>link</strong></a>',
      '<img {...attrs} srcSet="/image.png 1x, /image-2x.png 2x" />',
      '<video poster={"/poster.png"} />',
      '[Markdown link](/guide/)',
      '<Custom href="/custom/" />'
    ].join('\n\n')
    const result = await renderer.renderMdx(source, {
      urlTransform: (value) => `/project${value}`,
      components: { Custom: ({ href }: { href: string }) => <span data-url={href}>Custom</span> }
    })
    const html = renderToStaticMarkup(result.content)
    expect(html).toContain('href="/project/guide/"')
    expect(html).toContain('src="/project/image.png"')
    expect(html).toContain('srcSet="/project/image.png 1x, /project/image-2x.png 2x"')
    expect(html).toContain('poster="/project/poster.png"')
    expect(html).toContain('data-url="/custom/"')
    expect(html).not.toContain('/project/project')
    const second = await renderer.renderMdx(source, {
      components: { Custom: () => null },
      urlTransform: (value) => `/other${value}`
    })
    expect(renderToStaticMarkup(second.content)).toContain('href="/other/guide/"')
  })

  it('transforms Markdown URL properties while preserving authored text', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.render('[Guide](/guide/)\n\n![Image](/image.png)\n\n`href="/literal"`', {
      urlTransform: prefixProjectPath
    })
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('href="/project/guide/"')
    expect(html).toContain('src="/project/image.png"')
    expect(html).toContain('href=&quot;/literal&quot;')
  })

  it('removes executable URL protocols after host URL transforms', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.render(
      [
        '[Authored attack](javascript:alert(1))',
        '',
        '[Transformed attack](/unsafe-transform)',
        '',
        '[Safe link](/guide/)',
        '',
        '[Email](mailto:docs@example.com)'
      ].join('\n'),
      {
        urlTransform: (value) => (value === '/unsafe-transform' ? 'javascript:alert(2)' : value)
      }
    )
    const html = renderToStaticMarkup(result.content)

    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="/guide/"')
    expect(html).toContain('href="mailto:docs@example.com"')
    expect(html).toContain('>Authored attack</a>')
    expect(html).toContain('>Transformed attack</a>')
  })

  it('transforms direct MDX image and gallery properties', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.renderMdx(
      `<MarkdownImage src="/image.png" srcSet="/small.png 1x, /large.png 2x" />
<MarkdownGallery items={[{ src: '/gallery.png', alt: 'Gallery' }]} />`,
      { urlTransform: prefixProjectPath }
    )
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('src="/project/image.png"')
    expect(html).toContain('srcSet="/project/small.png 1x, /project/large.png 2x"')
    expect(html).toContain('src="/project/gallery.png"')
  })

  it('isolates unknown-language warnings between renderer instances', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const source = '```unknown-renderer-language\nvalue\n```'
    try {
      const first = createMarkdownRenderer()
      await first.render(source)
      await first.render(source)
      await first.renderMdx(source)
      expect(warning).toHaveBeenCalledTimes(1)
      first.clear()
      await first.renderMdx(source)
      expect(warning).toHaveBeenCalledTimes(2)
      const second = createMarkdownRenderer()
      await second.render(source)

      expect(warning).toHaveBeenCalledTimes(3)
    } finally {
      warning.mockRestore()
    }
  })

  it('returns React content and assets without exposing the prepared HAST', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.render('# Architecture\n\n```ts\nconst ready = true\n```')
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('data-cf-component="markdown"')
    expect(html).toContain('data-cf-component="code-block"')
    expect(result.assets.behaviors).toContain('code-toolbar')
    expect(result).not.toHaveProperty('document')
  })

  it('keeps replacement Tabs ARIA relationships unique and deterministic', async () => {
    const source = [
      '::::tabs[Install]',
      ':::tab[pnpm]',
      'Use pnpm.',
      ':::',
      ':::tab[npm]',
      'Use npm.',
      ':::',
      '::::'
    ].join('\n')
    const Replacement = ({ children, kind: _kind, ...props }: MarkdownNamedComponentProps['Tabs']) => (
      <section {...props} data-custom-tabs="">
        {children}
      </section>
    )
    const render = async () => {
      const renderer = createMarkdownRenderer()
      const result = await renderer.render(source, { components: { Tabs: Replacement } })
      return renderToStaticMarkup(result.content)
    }

    const first = await render()
    const second = await render()
    const trigger = first.match(/<button[^>]*role="tab"[^>]*id="([^"]+)"[^>]*aria-controls="([^"]+)"/)
    const panel = first.match(/<div[^>]*role="tabpanel"[^>]*id="([^"]+)"[^>]*aria-labelledby="([^"]+)"/)

    expect(first).toBe(second)
    expect(first).toContain('data-custom-tabs=""')
    expect(trigger?.[1]).toBe(panel?.[2])
    expect(trigger?.[2]).toBe(panel?.[1])
  })

  it('owns MDX evaluation and uses the same React component map', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.renderMdx('# MDX\n\n<Badge>Stable</Badge>', {
      components: {
        Badge: ({ children }) => <strong data-host-badge="">{children}</strong>
      }
    })
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('class="cf-content"')
    expect(html).toContain('data-cf-component="markdown"')
    expect(html).toContain('data-cf-element="heading"')
    expect(html).toContain('data-host-badge')
    expect(html).toContain('Stable')
  })

  it('applies intrinsic anchor overrides consistently to MDX Markdown links', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.renderMdx('[Docs](/docs)', {
      components: {
        a: ({ children, href }) => (
          <a href={href} data-custom-link="true">
            {children}
          </a>
        )
      }
    })

    expect(renderToStaticMarkup(result.content)).toContain('data-custom-link="true"')
  })

  it('registers every public Markdown composite in the default MDX component map', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.renderMdx(`<MarkdownCallout>Note</MarkdownCallout>
<MarkdownTabs />
<MarkdownSteps><li>Install</li></MarkdownSteps>
<MarkdownCopySnippet value="pnpm test" />`)
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('data-cf-component="callout"')
    expect(html).toContain('data-cf-component="tabs"')
    expect(html).toContain('data-cf-component="steps"')
    expect(html).toContain('data-cf-component="copy-snippet"')
  })

  it('keeps native MDX Tabs and File Tree semantic without serialized React payloads', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.renderMdx(`<MarkdownTabs>
  <div role="tablist"><button role="tab" data-cf-tab="one">One</button></div>
  <div role="tabpanel" data-cf-tab-panel="one">Panel</div>
</MarkdownTabs>
<MarkdownFileTree>
  <ul><li data-cf-file-tree-file="">README.md</li></ul>
</MarkdownFileTree>`)
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('data-cf-behavior="tabs"')
    expect(html).toContain('data-cf-behavior="file-tree"')
    expect(html).not.toContain('data-cf-island-data=')
    expect(result.assets.behaviors).toEqual(expect.arrayContaining(['tabs', 'file-tree']))
  })

  it('supports custom React overrides for named Markdown components', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.render(
      '<span data-cf-component="copy-snippet" data-cf-value="pnpm test">pnpm test</span>',
      {
        markdown: { html: 'trusted' },
        components: {
          CopySnippet: ({ children }) => <mark data-custom-snippet="">{children}</mark>
        }
      }
    )

    const html = renderToStaticMarkup(result.content)
    expect(html).toContain('data-custom-snippet')
    expect(html).toContain('pnpm test')
    expect(result.assets.behaviors).toContain('copy-snippet')
  })

  it('rejects safe HTML policies for executable MDX', async () => {
    const renderer = createMarkdownRenderer()

    await expect(
      renderer.renderMdx('<Badge>Unsafe boundary</Badge>', {
        markdown: { html: 'sanitize' }
      })
    ).rejects.toThrow('MDX executes trusted JSX')
    await expect(
      renderer.renderMdx('# MDX', {
        markdown: { html: 'strip' }
      })
    ).rejects.toThrow('MDX executes trusted JSX')
  })

  it('passes semantic props to named overrides for compiled Markdown blocks', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.render(
      [
        '```ts',
        'const ready = true',
        '```',
        '',
        '```terminal title="Shell"',
        '$ pnpm test',
        '```',
        '',
        '![Architecture](/architecture.png "Overview")',
        '',
        '<span data-cf-component="copy-snippet" data-cf-value="pnpm install">Install</span>'
      ].join('\n'),
      {
        markdown: { html: 'trusted' },
        urlTransform: prefixProjectPath,
        components: {
          CodeBlock: ({ source, language }) => <section data-custom-code={language}>{source}</section>,
          Terminal: ({ source, title }) => <section data-custom-terminal={title}>{source}</section>,
          Image: ({ src, alt, caption }) => (
            <section data-custom-image={src} data-alt={alt} data-caption={caption} />
          ),
          CopySnippet: ({ value }) => <span data-custom-snippet={value} />
        }
      }
    )
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('data-custom-code="ts"')
    expect(html).toContain('const ready = true')
    expect(html).toContain('data-custom-terminal="Shell"')
    expect(html).toContain('$ pnpm test')
    expect(html).toContain('data-custom-image="/project/architecture.png"')
    expect(html).toContain('data-caption="Overview"')
    expect(html).toContain('data-custom-snippet="pnpm install"')
  })
})
