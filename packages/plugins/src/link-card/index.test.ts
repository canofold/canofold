import { createMarkdownRenderer } from '@canofold/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { externalLinks } from '../external-links'
import { linkCard } from './index'

async function render(source: string, plugins = [linkCard()]) {
  const renderer = createMarkdownRenderer()
  const result = await renderer.render(source, { markdown: { plugins } })
  return renderToStaticMarkup(result.content)
}

describe('linkCard plugin', () => {
  it('turns a standalone http(s) link into a cf-link-card', async () => {
    const html = await render('[Docs](https://example.com/guide)')

    expect(html).toContain('class="cf-link-card"')
    expect(html).toContain('data-cf-component="link-card"')
    expect(html).toContain('href="https://example.com/guide"')
    expect(html).toContain('Docs</strong>')
    expect(html).toContain('example.com/guide')
  })

  it('leaves relative links and internal hosts as ordinary paragraphs', async () => {
    const html = await render('[Relative](/guide/)\n\n[Internal](https://canofold.dev/guide)', [
      linkCard({ internalHosts: ['canofold.dev'] })
    ])

    expect(html).not.toContain('cf-link-card')
    expect(html).toContain('href="/guide/"')
    expect(html).toContain('href="https://canofold.dev/guide"')
  })

  it('does not rewrite inline links next to other text', async () => {
    const html = await render('See [Docs](https://example.com/guide) for details.')

    expect(html).not.toContain('cf-link-card')
    expect(html).toContain('See ')
  })

  it('keeps target/rel when composed with externalLinks', async () => {
    const html = await render('[Docs](https://example.com/guide)', [externalLinks(), linkCard()])

    expect(html).toContain('class="cf-link-card"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
