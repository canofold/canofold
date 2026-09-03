import { createMarkdownRenderer } from '@canofold/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mermaid } from './index'

describe('mermaid plugin', () => {
  it('owns Mermaid fences and passes its browser module URL to the diagram component', async () => {
    const plugin = mermaid({ moduleUrl: 'https://cdn.example/mermaid.mjs' })
    const result = await createMarkdownRenderer().render('```mermaid\ngraph LR\nA --> B\n```', {
      markdown: { plugins: [plugin] }
    })
    const html = renderToStaticMarkup(result.content)

    expect(plugin.fenceLanguages).toEqual(['mermaid'])
    expect(html).toContain('data-cf-plugin-diagram="mermaid"')
    expect(html).toContain('data-cf-module-url="https://cdn.example/mermaid.mjs"')
    expect(html).toContain('<pre class="cf-diagram-source"')
    expect(html).toContain('class="cf-diagram-zoom-controls"')
    expect(html).toContain('data-cf-diagram-action="zoom-in"')
    expect(html).toContain('graph LR\nA --&gt; B')
    expect(result.assets.pluginClients).toEqual([
      expect.objectContaining({
        id: 'mermaid',
        module: '@canofold/plugins/client/mermaid',
        resources: [
          expect.objectContaining({
            module: 'mermaid/dist/mermaid.esm.min.mjs',
            output: 'mermaid.esm.min.mjs'
          })
        ]
      })
    ])
    expect(result.assets.pluginStyles).toEqual([{ id: 'diagrams', module: '@canofold/plugins/diagram.css' }])
  })

  it('uses the bundled browser runtime by default', async () => {
    const result = await createMarkdownRenderer().render('```mermaid\ngraph LR\nA --> B\n```', {
      markdown: { plugins: [mermaid()] }
    })
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('data-cf-plugin-diagram="mermaid"')
    expect(html).not.toContain('data-cf-module-url="https://')
  })

  it('uses built-in Chinese action labels for a Chinese document', async () => {
    const result = await createMarkdownRenderer().render('```mermaid\ngraph LR\nA --> B\n```', {
      markdown: { locale: 'zh-CN', plugins: [mermaid()] }
    })
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('aria-label="复制图表源码"')
    expect(html).toContain('aria-label="图表缩放控件"')
    expect(html).toContain('aria-label="重置图表缩放"')
    expect(html).toContain('图表预览将在浏览器中加载。')
  })

  it('does not emit plugin assets when the document has no Mermaid fence', async () => {
    const result = await createMarkdownRenderer().render('# Plain document', {
      markdown: { plugins: [mermaid()] }
    })

    expect(result.assets.pluginClients).toEqual([])
    expect(result.assets.pluginStyles).toEqual([])
  })

  it('does not activate for Mermaid source shown inside a longer Markdown fence', async () => {
    const result = await createMarkdownRenderer().render(
      ['````markdown', '```mermaid', 'graph LR', 'A --> B', '```', '````'].join('\n'),
      { markdown: { plugins: [mermaid()] } }
    )

    expect(result.assets.pluginClients).toEqual([])
    expect(result.assets.pluginStyles).toEqual([])
  })

  it('recognizes executable Mermaid fences inside lists and blockquotes', () => {
    const plugin = mermaid()
    const inList = ['1. Diagram', '', '   ```mermaid', '   graph LR', '   A --> B', '   ```'].join('\n')
    const inQuote = ['> ```mermaid', '> graph LR', '> A --> B', '> ```'].join('\n')

    expect(plugin.appliesTo?.({ source: inList, mode: 'markdown' })).toBe(true)
    expect(plugin.appliesTo?.({ source: inQuote, mode: 'markdown' })).toBe(true)
    expect(plugin.appliesTo?.({ source: '    ```mermaid\n    graph LR\n    ```', mode: 'markdown' })).toBe(
      false
    )
  })
})
