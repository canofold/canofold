import { createMarkdownRenderer } from '@docfuse/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { externalLinks } from './index'

async function renderLinks(source: string, plugin = externalLinks()) {
  const renderer = createMarkdownRenderer()
  const result = await renderer.render(source, { markdown: { plugins: [plugin] } })
  return renderToStaticMarkup(result.content)
}

describe('externalLinks plugin', () => {
  it('opens external links in a new tab with rel protections', async () => {
    const html = await renderLinks('[External](https://example.com/docs)')

    expect(html).toContain('href="https://example.com/docs"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('leaves relative links and internal hosts untouched', async () => {
    const html = await renderLinks(
      '[Relative](/guide/) and [Internal](https://docfuse.dev/guide) and [Sub](https://api.docfuse.dev/)',
      externalLinks({ internalHosts: ['docfuse.dev'] })
    )

    expect(html).not.toContain('target="_blank"')
    expect(html).not.toContain('rel="noopener noreferrer"')
  })

  it('honors newTab and custom rel options in the cache identity', () => {
    const plugin = externalLinks({ newTab: false, rel: ['nofollow'] })

    expect(plugin.name).toBe('external-links')
    expect(plugin.cacheKey).toEqual({ newTab: false, rel: ['nofollow'], internalHosts: [] })
  })

  it('applies to MDX content through the shared pipeline', async () => {
    const renderer = createMarkdownRenderer()
    const result = await renderer.renderMdx('[External](https://example.com/)', {
      markdown: { plugins: [externalLinks()] }
    })

    expect(renderToStaticMarkup(result.content)).toContain('target="_blank"')
  })
})
