import { createMarkdownRenderer } from '@canofold/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { plantUml } from './index'

describe('plantUml plugin', () => {
  it('owns both PlantUML fence labels and produces a server URL', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
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
    expect(warning).toHaveBeenCalledWith(
      '[canofold/plugins] PlantUML sends diagram source to its configured external service. Use a trusted self-hosted service for private content.'
    )
    warning.mockRestore()
  })

  it('keeps source-only output when no server is configured', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await createMarkdownRenderer().render('```plantuml\nA -> B\n```', {
      markdown: { plugins: [plantUml()] }
    })
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('data-cf-plugin-diagram="plantuml"')
    expect(html).not.toContain('src="https://plantuml.example/')
    expect(html).not.toContain('class="cf-diagram-zoom-controls"')
    expect(warning).not.toHaveBeenCalled()
    warning.mockRestore()
  })

  it('prepares a local preview shell when a host renderer is selected', async () => {
    const plugin = plantUml({ renderer: 'client' })
    const result = await createMarkdownRenderer().render('```puml\nA -> B\n```', {
      markdown: { plugins: [plugin] }
    })
    const html = renderToStaticMarkup(result.content)

    expect(html).toContain('data-cf-diagram-language="puml"')
    expect(html).toContain('data-cf-diagram-type="plantuml"')
    expect(html).toContain('class="cf-diagram-zoom-controls"')
    expect(html).not.toContain('<img')
    expect(plugin.browserCompiler?.options).toEqual({ renderer: 'client' })
  })

  it('rejects simultaneous remote and client renderers', () => {
    expect(() => plantUml({ server: 'https://plantuml.example/svg', renderer: 'client' })).toThrow(
      'PlantUML cannot use server and client rendering at the same time.'
    )
  })

  it('rejects an invalid explicit server', () => {
    expect(() => plantUml({ server: '' })).toThrow(
      'PlantUML server must be an HTTP(S) base URL without a query or fragment.'
    )
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
