import { createMarkdownRenderer } from '@canofold/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { plantUml } from './index'

describe('plantUml plugin', () => {
  it('owns both PlantUML fence labels and produces a server URL', async () => {
    const plugin = plantUml({ server: 'https://plantuml.example/svg/' })
    const result = await createMarkdownRenderer().render('```puml\nAlice -> Bob: hello\n```', {
      markdown: { plugins: [plugin] }
    })
    const html = renderToStaticMarkup(result.content)

    expect(plugin.fenceLanguages).toEqual(['plantuml', 'puml'])
    expect(html).toContain('data-cf-plugin-diagram="plantuml"')
    expect(html).toContain('src="https://plantuml.example/svg/')
    expect(html).toContain('<pre class="cf-diagram-source"')
    expect(html).toContain('class="cf-diagram-zoom-controls"')
    expect(html).toContain('Alice -&gt; Bob: hello')
  })

  it('keeps source-only output when no server is configured', async () => {
    const result = await createMarkdownRenderer().render('```plantuml\nA -> B\n```', {
      markdown: { plugins: [plantUml()] }
    })
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('data-cf-plugin-diagram="plantuml"')
    expect(html).not.toContain('src="https://plantuml.example/')
    expect(html).not.toContain('class="cf-diagram-zoom-controls"')
  })

  it('localizes generated image alternative text', async () => {
    const result = await createMarkdownRenderer().render('```puml\nA -> B\n```', {
      markdown: { locale: 'zh', plugins: [plantUml({ server: 'https://plantuml.example/svg' })] }
    })

    expect(renderToStaticMarkup(result.content)).toContain('alt="PlantUML 图表"')
  })

  it('does not activate for PlantUML source shown inside a longer Markdown fence', () => {
    const plugin = plantUml()
    const source = ['````markdown', '```plantuml', 'A -> B', '```', '````'].join('\n')

    expect(plugin.appliesTo?.({ source, mode: 'markdown' })).toBe(false)
  })
})
