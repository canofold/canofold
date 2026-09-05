import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { MarkdownNamedComponentProps } from '../react/componentMap'
import { createMarkdownRenderer } from './createMarkdownRenderer'

describe('Markdown server renderer', () => {
  const prefixProjectPath = (value: string) =>
    value.startsWith('/') && !value.startsWith('/project/') ? `/project${value}` : value

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
      const second = createMarkdownRenderer()
      await second.render(source)

      expect(warning).toHaveBeenCalledTimes(2)
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
