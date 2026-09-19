import { createMarkdownRenderer } from '@canofold/markdown/server'
import { inflateSync } from 'node:zlib'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { kroki } from './index'

async function render(source: string, plugin = kroki()) {
  const renderer = createMarkdownRenderer()
  const result = await renderer.render(source, { markdown: { plugins: [plugin] } })
  return renderToStaticMarkup(result.content)
}

describe('kroki plugin', () => {
  it('encodes a Kroki-compatible zlib payload', async () => {
    const source = 'digraph G { a -> b }'
    const html = await render(`\`\`\`dot\n${source}\n\`\`\``)
    const encoded = html.match(/kroki\.io\/graphviz\/svg\/([^"/]+)/)?.[1]

    expect(encoded).toBeDefined()
    const base64 = encoded!.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const compressed = Buffer.from(padded, 'base64')

    expect(inflateSync(compressed).toString()).toBe(`${source}\n`)
  })

  it('turns Graphviz fences into Kroki images and warns once about the external service', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const plugin = kroki()
    const html = await render('```dot\ndigraph G { a -> b }\n```', plugin)
    await render('```d2\na -> b\n```', plugin)

    expect(html).toContain('data-cf-plugin-diagram="kroki"')
    expect(html).toContain('src="https://kroki.io/graphviz/svg/')
    expect(html).toContain('class="cf-diagram-img"')
    expect(html).toContain('class="cf-diagram-zoom-controls"')
    expect(html).not.toContain('data-cf-component="code-block"')
    expect(warning).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(
      '[canofold/plugins] Kroki sends diagram source to its configured external service. Use a trusted self-hosted service for private content.'
    )
    warning.mockRestore()
  })

  it('maps d2 fences, declares owned languages, and honors a custom server', async () => {
    const plugin = kroki({ server: 'https://kroki.example/' })
    const html = await render('```d2\na -> b\n```', plugin)

    expect(plugin.fenceLanguages).toEqual(['graphviz', 'dot', 'gv', 'd2'])
    expect(html).toContain('src="https://kroki.example/d2/svg/')
    expect(html).toContain('diagram.d2')
  })

  it('leaves unrelated fences alone', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const html = await render('```ts\nconst ready = true\n```')

    expect(html).toContain('data-cf-component="code-block"')
    expect(html).not.toContain('kroki-diagram')
    expect(warning).not.toHaveBeenCalled()
    warning.mockRestore()
  })

  it('does not activate for Kroki source shown inside a longer Markdown fence', () => {
    const plugin = kroki()
    const source = ['````markdown', '```dot', 'digraph G { a -> b }', '```', '````'].join('\n')

    expect(plugin.appliesTo?.({ source, mode: 'markdown' })).toBe(false)
  })
})
