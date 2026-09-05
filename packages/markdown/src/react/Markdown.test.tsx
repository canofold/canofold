import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownDocument, type MarkdownProps } from './Markdown'
import { prepareMarkdown } from '../compiler/prepareMarkdown'
import {
  MarkdownApiBlock,
  MarkdownAside,
  MarkdownBadge,
  MarkdownCardGrid,
  MarkdownCallout,
  MarkdownCodeBlock,
  MarkdownDetails,
  MarkdownFileTree,
  MarkdownGallery,
  MarkdownImage,
  MarkdownSteps,
  MarkdownTable,
  MarkdownTabs,
  MarkdownTerminal
} from '../components/composite/MarkdownComposite'
import type { MarkdownCompositeProps } from '../components/composite/MarkdownComposite'

async function Markdown({
  source,
  options,
  onError: _onError,
  onReady: _onReady,
  fallback: _fallback,
  retainPrevious: _retainPrevious,
  ...props
}: MarkdownProps) {
  const prepared = await prepareMarkdown(source, options)
  return <MarkdownDocument document={prepared.document} {...props} />
}

describe('Markdown React entry', () => {
  it('renders source without exposing a compiler callback', async () => {
    const element = await Markdown({
      source: ['# Title', '', 'A paragraph with `inline code`.'].join('\n')
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('data-cf-root="markdown"')
    expect(html).toContain('data-cf-component="markdown"')
    expect(html).toContain('class="cf-content"')
    expect(html).toContain('<h1 data-cf-element="heading" id="title">Title</h1>')
    expect(html).toContain('<code data-cf-element="inline-code">inline code</code>')
  })

  it('keeps the generated footnote label visually hidden', async () => {
    const element = await Markdown({
      source: ['Footnote reference[^one].', '', '[^one]: Footnote body.'].join('\n')
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('id="footnote-label" class="sr-only cf-sr-only"')
    expect(html).toContain('data-footnote-ref="true"')
    expect(html).toContain('data-footnote-backref=""')
  })

  it('keeps sanitized footnote references aligned with their generated ids', async () => {
    const element = await Markdown({
      source: ['Footnote reference[^one].', '', '[^one]: Footnote body.'].join('\n'),
      options: { html: 'sanitize' }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('href="#user-content-fn-one"')
    expect(html).toContain('id="user-content-fn-one"')
    expect(html).toContain('href="#user-content-fnref-one"')
    expect(html).toContain('id="user-content-fnref-one"')
    expect(html).not.toContain('user-content-user-content-')
  })

  it('still prefixes ids from sanitized author HTML', async () => {
    const element = await Markdown({
      source: '<div id="author-id">Author HTML</div>',
      options: { html: 'sanitize' }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('id="user-content-author-id"')
    expect(html).not.toContain('id="author-id"')
  })

  it('keeps host class names on the stable root', async () => {
    const element = await Markdown({
      source: 'Text',
      className: 'article-shell',
      classNames: { root: 'markdown-theme' }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('class="cf-content markdown-theme article-shell"')
  })

  it('renders core blocks from HAST as React elements', async () => {
    const element = await Markdown({
      source: [
        '## Data',
        '',
        ':::tip Note',
        'Use the shared callout component.',
        ':::',
        '',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '```ts',
        'const value = true',
        '```',
        '',
        '::::tabs[Install]',
        ':::tab[pnpm]',
        'Use pnpm.',
        ':::',
        ':::tab[npm]',
        'Use npm.',
        ':::',
        '::::'
      ].join('\n')
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('class="cf-table-window"')
    expect(html).toContain('data-cf-component="table"')
    expect(html).toContain('data-cf-component="callout"')
    expect(html).toContain('class="lucide lucide-circle-check cf-callout-icon"')
    expect(html).toContain('class="cf-code"')
    expect(html).toContain('data-cf-component="code-block"')
    expect(html).toContain('class="language-ts"')
    expect(html).toContain('>const</span>')
    expect(html).toContain('class="cf-tabs"')
    expect(html).toContain('data-cf-component="tabs"')
    expect(html).toContain('Use pnpm.')
    expect(html).toContain('data-cf-root="markdown"')
  })

  it('applies element classNames without replacing stable contracts', async () => {
    const element = await Markdown({
      source: '# Title\n\nText',
      classNames: {
        heading: 'doc-heading',
        paragraph: 'doc-paragraph'
      }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('class="doc-heading"')
    expect(html).toContain('data-cf-element="heading"')
    expect(html).toContain('class="doc-paragraph"')
    expect(html).toContain('data-cf-element="paragraph"')
  })

  it('appends component className without removing required base classes', () => {
    const html = renderToStaticMarkup(
      <>
        <MarkdownCodeBlock className="brand-code" source="const value = true">
          <pre>
            <code>const value = true</code>
          </pre>
        </MarkdownCodeBlock>
        <MarkdownTerminal className="brand-terminal" source="$ pnpm build" />
        <MarkdownImage className="brand-image" src="image.png" alt="Preview" />
        <MarkdownTable className="brand-table">
          <table>
            <tbody>
              <tr>
                <td>One</td>
              </tr>
            </tbody>
          </table>
        </MarkdownTable>
      </>
    )

    expect(html).toContain('class="cf-code brand-code"')
    expect(html).toContain('class="cf-terminal brand-terminal"')
    expect(html).toContain('class="cf-media-frame brand-image"')
    expect(html).toContain('class="cf-table-window brand-table"')
  })

  it('maps supported semantic elements to stable React customization hooks', async () => {
    const element = await Markdown({
      source: [
        '[Docs](/docs) with **strong**, *emphasis*, ~~removed~~ and `code`.',
        '',
        '- [x] Complete',
        '',
        '| Name | Value |',
        '| --- | --- |',
        '| One | 1 |',
        '',
        '---',
        '',
        'Term',
        ': Definition'
      ].join('\n'),
      classNames: {
        link: 'doc-link',
        listItem: 'doc-list-item',
        strong: 'doc-strong',
        emphasis: 'doc-emphasis',
        strikethrough: 'doc-strikethrough',
        inlineCode: 'doc-inline-code',
        horizontalRule: 'doc-rule',
        tableHeader: 'doc-table-header',
        tableCell: 'doc-table-cell',
        taskCheckbox: 'doc-task-checkbox',
        definitionList: 'doc-definition-list'
      }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('data-cf-element="link"')
    expect(html).toContain('data-cf-element="list-item"')
    expect(html).toContain('data-cf-element="strong"')
    expect(html).toContain('data-cf-element="emphasis"')
    expect(html).toContain('data-cf-element="strikethrough"')
    expect(html).toContain('data-cf-element="inline-code"')
    expect(html).toContain('data-cf-element="horizontal-rule"')
    expect(html).toContain('data-cf-element="table-header"')
    expect(html).toContain('data-cf-element="table-cell"')
    expect(html).toContain('data-cf-element="task-checkbox"')
    expect(html).toContain('data-cf-element="definition-list"')
  })

  it('applies React slots to compiler-generated icons and image captions', async () => {
    const element = await Markdown({
      source: ['![Office](office.png "Office caption")', '', '```ts', 'const value = true', '```'].join('\n'),
      slots: {
        CopyIcon: ({ name }) => <span data-test-icon={name}>copy</span>,
        ImageCaption: ({ children }) => <figcaption className="custom-caption">{children}</figcaption>
      }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('data-test-icon="copy"')
    expect(html).toContain('class="custom-caption"')
    expect(html).toContain('Office caption')
  })

  it('supports intrinsic anchor overrides', async () => {
    const element = await Markdown({
      source: '[Docs](/docs)',
      classNames: { link: 'brand-link' },
      components: {
        a: ({ children, ...props }) => (
          <a {...props} data-custom-link="true">
            {children}
          </a>
        )
      }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('data-custom-link="true"')
    expect(html).toContain('data-cf-element="link"')
    expect(html).toContain('class="brand-link"')
    expect(html).toContain('>Docs</a>')
  })

  it('keeps composite routing when an intrinsic container is overridden', async () => {
    const element = await Markdown({
      source: ':::tip Tip\nKeep the component contract.\n:::',
      components: {
        div: ({ children, ...props }) => (
          <div {...props} data-custom-div="true">
            {children}
          </div>
        )
      }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('data-cf-component="callout"')
    expect(html).toContain('data-custom-div="true"')
  })

  it('supports semantic overrides for composite Markdown blocks', async () => {
    const element = await Markdown({
      source: '| A | B |\n| - | - |\n| 1 | 2 |',
      components: {
        Table: ({
          children,
          tableTitle,
          copyLabel,
          copyFailureLabel,
          downloadLabel,
          zoomLabel,
          closeLabel,
          sortLabel,
          ...domProps
        }) => (
          <section
            data-custom-table="true"
            data-table-title={tableTitle}
            data-label-count={
              [copyLabel, copyFailureLabel, downloadLabel, zoomLabel, closeLabel, sortLabel].filter(Boolean)
                .length
            }
            {...domProps}
          >
            {children}
          </section>
        )
      }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('data-custom-table="true"')
    expect(html).toContain('<table')
    expect(html).toContain('data-cf-component="table"')
  })

  it('keeps Terminal in the structured React document path', async () => {
    const element = await Markdown({
      source: ['~~~terminal title="Terminal"', '$ pnpm build', '~~~'].join('\n')
    })

    const html = renderToStaticMarkup(element)
    expect(html).toContain('class="cf-terminal"')
  })

  it('keeps trusted author HTML in the structured React document path', async () => {
    const element = await Markdown({
      source: [
        '<div class="cf-callout cf-callout-tip" data-cf-component="callout"><p>Trusted callout</p></div>',
        '<div class="cf-image-gallery" data-cf-component="gallery"><figure><img src="gallery.png" alt="Gallery" /></figure></div>',
        '<div class="cf-file-tree" data-cf-component="file-tree"><ul><li>docs</li></ul></div>',
        '<div class="cf-card-grid" data-cf-component="card-grid"><a href="/guide">Guide</a></div>',
        '<div class="cf-api-block" data-cf-component="api"><code>GET /api/docs</code></div>',
        '<section class="cf-api-block" data-cf-component="api"><code>GET /api/section</code></section>',
        '<section class="cf-image-gallery" data-cf-component="gallery"><figure><img src="section-gallery.png" alt="Section gallery" /></figure></section>',
        '<div data-cf-component="card-grid"><a href="/data-attribute">Data attribute</a></div>',
        '<aside class="cf-aside" data-cf-component="aside">Side note</aside>',
        '<span class="cf-badge" data-cf-component="badge">Beta</span>',
        '<span data-cf-component="copy-snippet" data-cf-value="pnpm add canofold">pnpm add canofold</span>'
      ].join('\n'),
      options: { html: 'trusted' }
    })

    const html = renderToStaticMarkup(element)
    expect(html).toContain('class="cf-callout cf-callout-tip"')
    expect(html).toContain('data-cf-component="callout"')
    expect(html).toContain('data-cf-component="gallery"')
    expect(html).toContain('data-cf-component="file-tree"')
    expect(html).toContain('data-cf-component="card-grid"')
    expect(html).toContain('data-cf-component="api"')
    expect(html).toContain('GET /api/section')
    expect(html).toContain('data-cf-component="gallery"')
    expect(html).toContain('Data attribute')
    expect(html).toContain('data-cf-component="aside"')
    expect(html).toContain('data-cf-component="badge"')
    expect(html).toContain('data-cf-component="copy-snippet"')
    expect(html).toContain('data-cf-behavior="copy-snippet"')
    expect(html).toContain('data-cf-action="copy-snippet"')
    expect(html).toContain('Trusted callout')
  })

  it('does not infer component behavior from visual classes', async () => {
    const element = await Markdown({
      source: '<div class="cf-image-gallery">Visual class only</div>',
      options: { html: 'trusted' }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('class="cf-image-gallery"')
    expect(html).not.toContain('data-cf-component="gallery"')
    expect(html).not.toContain('data-cf-island="gallery"')
  })

  it('treats inherited object names as ordinary data instead of registered components', async () => {
    const element = await Markdown({
      source: '<div data-cf-component="toString">Plain content</div>',
      options: { html: 'trusted' }
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('data-cf-component="toString"')
    expect(html).toContain('Plain content')
  })

  it('exposes extension containers through the React component layer', () => {
    const html = renderToStaticMarkup(
      <>
        <MarkdownFileTree>
          <span>docs</span>
        </MarkdownFileTree>
        <MarkdownGallery>
          <figure>
            <img src="gallery.png" alt="Gallery" />
          </figure>
        </MarkdownGallery>
        <MarkdownCardGrid>
          <a href="/guide">Guide</a>
        </MarkdownCardGrid>
        <MarkdownApiBlock>
          <code>GET /api/docs</code>
        </MarkdownApiBlock>
        <MarkdownAside>Side note</MarkdownAside>
        <MarkdownBadge>Beta</MarkdownBadge>
        <MarkdownDetails>
          <summary>More</summary>Details content
        </MarkdownDetails>
      </>
    )

    expect(html).toContain('class="cf-file-tree" data-cf-component="file-tree"')
    expect(html).toContain('data-cf-slot="root"')
    expect(html).toContain('class="cf-image-gallery" data-cf-component="gallery"')
    expect(html).toContain('role="group"')
    expect(html).toContain('data-cf-slot="item"')
    expect(html).toContain('class="cf-card-grid" data-cf-component="card-grid"')
    expect(html).toContain('data-cf-slot="card"')
    expect(html).toContain('class="cf-api-block" data-cf-component="api"')
    expect(html).toContain('class="cf-aside" data-cf-component="aside"')
    expect(html).toContain('class="cf-badge" data-cf-component="badge"')
    expect(html).toContain(
      '<details data-cf-component="details" data-cf-slot="root" data-cf-behavior="details"'
    )
    expect(html).toContain('class="lucide lucide-chevron-down cf-details-chevron"')
    expect(html).toContain('<div class="cf-details-content" data-cf-slot="content">')
  })

  it('does not discard non-image children passed to a gallery', () => {
    const html = renderToStaticMarkup(
      <MarkdownGallery>
        <p>Context that must remain visible.</p>
        <figure>
          <img src="gallery.png" alt="Gallery" />
        </figure>
      </MarkdownGallery>
    )

    expect(html).toContain('Context that must remain visible.')
    expect(html).toContain('data-cf-action="open-gallery"')
  })

  it('keeps the default class and root slot contract for core React composites', () => {
    const html = renderToStaticMarkup(
      <>
        <MarkdownCallout>Note</MarkdownCallout>
        <MarkdownTabs>
          <div>Tab content</div>
        </MarkdownTabs>
        <MarkdownSteps>
          <li>Step</li>
        </MarkdownSteps>
        <MarkdownCodeBlock>
          <pre>
            <code>const value = 1</code>
          </pre>
        </MarkdownCodeBlock>
        <MarkdownTable>
          <table>
            <tbody>
              <tr>
                <td>Cell</td>
              </tr>
            </tbody>
          </table>
        </MarkdownTable>
        <MarkdownImage>
          <img src="image.png" alt="Image" />
        </MarkdownImage>
        <MarkdownTerminal source="$ pnpm test" />
      </>
    )

    expect(html).toContain('class="cf-callout" data-cf-component="callout" data-cf-slot="root"')
    expect(html).toContain('class="cf-tabs" data-cf-component="tabs" data-cf-slot="root"')
    expect(html).toContain('class="cf-steps" data-cf-component="steps" data-cf-slot="root"')
    expect(html).toContain('class="cf-code" data-cf-component="code-block" data-cf-slot="root"')
    expect(html).toContain('class="cf-table-window" data-cf-component="table" data-cf-slot="root"')
    expect(html).toContain('class="cf-media-frame" data-cf-component="image" data-cf-slot="root"')
    expect(html).toContain('class="cf-terminal" data-cf-component="terminal" data-cf-slot="root"')
  })

  it('does not leak component-only props to host DOM elements', () => {
    const html = renderToStaticMarkup(
      <>
        <MarkdownCodeBlock source="const value = 1" language="ts" copyLabel="Copy" />
        <MarkdownCardGrid
          {...({
            node: { type: 'element' },
            dataCfFoo: 'internal',
            customThing: 'invalid'
          } as MarkdownCompositeProps)}
        />
      </>
    )

    expect(html).not.toMatch(/\ssource=/)
    expect(html).not.toMatch(/\slanguage=/)
    expect(html).not.toMatch(/\scopyLabel=/)
    expect(html).not.toMatch(/\sdownloadLabel=/)
    expect(html).not.toMatch(/\sdataCfFoo=/)
    expect(html).not.toMatch(/\scustomThing=/)
  })
})
