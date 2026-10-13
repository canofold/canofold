// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhance as enhanceKroki } from './kroki'
import { enhance as enhanceMermaid, loadMermaidModule, normalizeMermaidColor } from './mermaid'
import { enhance as enhancePlantuml } from './plantuml'

afterEach(() => {
  document.body.innerHTML = ''
  const runtime = globalThis as typeof globalThis & {
    __canofoldFinishMermaid?: () => void
    __canofoldMermaidRenders?: number
    __canofoldMermaidActive?: number
    __canofoldMermaidMaxActive?: number
  }
  delete runtime.__canofoldFinishMermaid
  delete runtime.__canofoldMermaidRenders
  delete runtime.__canofoldMermaidActive
  delete runtime.__canofoldMermaidMaxActive
  vi.restoreAllMocks()
})

describe('diagram client entries', () => {
  it('renders Kroki figures through a host renderer and releases the object URL on dispose', async () => {
    document.body.innerHTML = `
      <figure
        data-cf-plugin-diagram="kroki"
        data-cf-diagram-language="dot"
        data-cf-diagram-type="graphviz"
        data-cf-image-alt="Kroki diagram"
        data-cf-source="digraph G { a -&gt; b }"
      >
        <div class="cf-diagram-preview"><div class="cf-diagram-placeholder">Loading</div></div>
      </figure>`
    const createObjectURL = vi.fn(() => 'blob:canofold-diagram')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    let renderSignal: AbortSignal | undefined
    const renderer = vi.fn(async (request) => {
      renderSignal = request.signal
      return { svg: '<svg viewBox="0 0 10 10"></svg>' }
    })

    const diagrams = enhanceKroki(document, { renderer })
    await diagrams.ready

    expect(renderer).toHaveBeenCalledWith({
      kind: 'kroki',
      language: 'dot',
      diagramType: 'graphviz',
      source: 'digraph G { a -> b }',
      signal: expect.any(AbortSignal)
    })
    const image = document.querySelector<HTMLImageElement>('.cf-diagram-img')
    expect(image?.src).toBe('blob:canofold-diagram')
    expect(image?.alt).toBe('Kroki diagram')

    diagrams.dispose()
    expect(renderSignal?.aborted).toBe(true)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:canofold-diagram')
    expect(document.querySelector('.cf-diagram-placeholder')?.textContent).toBe('Loading')
    vi.unstubAllGlobals()
  })

  it('renders PlantUML figures through the same public renderer contract', async () => {
    document.body.innerHTML = `
      <figure
        data-cf-plugin-diagram="plantuml"
        data-cf-diagram-language="puml"
        data-cf-diagram-type="plantuml"
        data-cf-source="A -&gt; B"
      ><div class="cf-diagram-preview"></div></figure>`
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:plantuml'),
      revokeObjectURL: vi.fn()
    })
    const renderer = vi.fn(async () => ({ svg: '<svg></svg>' }))

    const diagrams = enhancePlantuml(document, { renderer })
    await diagrams.ready

    expect(renderer).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'plantuml', language: 'puml', diagramType: 'plantuml' })
    )
    diagrams.dispose()
    vi.unstubAllGlobals()
  })

  it('shows and restores a localized client-renderer failure', async () => {
    document.body.innerHTML = `
      <figure data-cf-plugin-diagram="kroki" data-cf-source="a -&gt; b">
        <div class="cf-diagram-preview">
          <div class="cf-diagram-placeholder" data-cf-render-error-label="无法渲染图表预览。">正在渲染</div>
        </div>
      </figure>`
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const diagrams = enhanceKroki(document, {
      renderer: async () => {
        throw new Error('renderer unavailable')
      }
    })

    await diagrams.ready

    const figure = document.querySelector<HTMLElement>('figure')!
    expect(figure.dataset.cfRenderError).toBe('true')
    expect(document.querySelector('.cf-diagram-placeholder')?.textContent).toBe('无法渲染图表预览。')
    diagrams.dispose()
    expect(figure.dataset.cfRenderError).toBeUndefined()
    expect(document.querySelector('.cf-diagram-placeholder')?.textContent).toBe('正在渲染')
    error.mockRestore()
  })

  it('normalizes CSS Color 4 sRGB values for Mermaid', () => {
    expect(normalizeMermaidColor('color(srgb 0.890196 0.890196 0.909804 / 0.12)', '#d2d2d7')).toBe(
      'rgba(227, 227, 232, 0.12)'
    )
    expect(normalizeMermaidColor('color(srgb 0 0.533333 1)', '#0071e3')).toBe('rgb(0, 136, 255)')
    expect(normalizeMermaidColor('color(srgb 100% 0 50%)', '#0071e3')).toBe('rgb(255, 0, 128)')
    expect(normalizeMermaidColor('color(srgb 100% 0% 0% / 50%)', '#0071e3')).toBe('rgba(255, 0, 0, 0.5)')
    expect(normalizeMermaidColor('rgb(29, 29, 31)', '#1d1d1f')).toBe('rgb(29, 29, 31)')
    expect(normalizeMermaidColor('oklch(62% 0.2 250)', '#0071e3')).toBe('#0071e3')
    expect(normalizeMermaidColor('oklab(0.62 -0.04 -0.2)', '#0071e3')).toBe('#0071e3')
  })

  it.each([
    ['kroki', enhanceKroki],
    ['plantuml', enhancePlantuml]
  ])('enhances and disposes the %s browser entry', (kind, enhance) => {
    document.body.innerHTML = `<figure data-cf-plugin-diagram="${kind}"></figure>`
    const figure = document.querySelector<HTMLElement>('figure')!

    const dispose = enhance(document)
    expect(figure.dataset.cfEnhanced).toBe('true')

    dispose()
    expect(figure.dataset.cfEnhanced).toBeUndefined()
  })

  it('renders Mermaid from its configured self-hosted module and stops observing after disposal', async () => {
    const moduleSource = `export default {
      initialize() {},
      async render() {
        globalThis.__canofoldMermaidRenders = (globalThis.__canofoldMermaidRenders || 0) + 1;
        return { svg: '<svg data-rendered="true"></svg>' };
      }
    }`
    const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}`
    document.body.innerHTML = `<figure data-cf-plugin-diagram="mermaid" data-cf-source="A --&gt; B" data-cf-module-url="${moduleUrl}"><div class="cf-diagram-preview"></div></figure>`

    const dispose = enhanceMermaid(document)
    await vi.waitFor(() =>
      expect(document.querySelector('.cf-diagram-preview svg')?.getAttribute('data-rendered')).toBe('true')
    )
    expect(
      (globalThis as typeof globalThis & { __canofoldMermaidRenders?: number }).__canofoldMermaidRenders
    ).toBe(1)

    dispose()
    document.documentElement.classList.toggle('dark')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(
      (globalThis as typeof globalThis & { __canofoldMermaidRenders?: number }).__canofoldMermaidRenders
    ).toBe(1)
  })

  it('does not observe a detached document without a browsing context', () => {
    const detached = document.implementation.createHTMLDocument('detached')
    const observe = vi.fn()
    const observer = vi.spyOn(globalThis, 'MutationObserver').mockImplementation(
      class {
        observe = observe
        disconnect() {}
      } as unknown as typeof MutationObserver
    )

    const dispose = enhanceMermaid(detached)

    expect(detached.defaultView).toBeNull()
    expect(observer).not.toHaveBeenCalled()
    expect(observe).not.toHaveBeenCalled()
    dispose()
  })

  it('retries a Mermaid module after a transient import failure', async () => {
    const api = { initialize: vi.fn(), render: vi.fn() }
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary module failure'))
      .mockResolvedValueOnce({ default: api })
    const moduleUrl = `https://cdn.example/mermaid-retry-${Date.now()}.mjs`

    await expect(loadMermaidModule(moduleUrl, importer)).rejects.toThrow('temporary module failure')
    await expect(loadMermaidModule(moduleUrl, importer)).resolves.toBe(api)
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it('does not write a Mermaid render that finishes after disposal', async () => {
    const moduleSource = `export default {
      initialize() {},
      render() {
        return new Promise((resolve) => {
          globalThis.__canofoldFinishMermaid = () => resolve({ svg: '<svg data-late="true"></svg>' });
        });
      }
    }`
    const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}#late`
    document.body.innerHTML = `<figure data-cf-plugin-diagram="mermaid" data-cf-source="A --&gt; B" data-cf-module-url="${moduleUrl}"><div class="cf-diagram-preview"></div></figure>`

    const dispose = enhanceMermaid(document)
    await vi.waitFor(() =>
      expect(
        (globalThis as typeof globalThis & { __canofoldFinishMermaid?: () => void }).__canofoldFinishMermaid
      ).toBeTypeOf('function')
    )
    dispose()
    ;(
      globalThis as typeof globalThis & {
        __canofoldFinishMermaid?: () => void
      }
    ).__canofoldFinishMermaid?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(document.querySelector('.cf-diagram-preview')?.innerHTML).toBe('')
  })

  it('serializes Mermaid initialize and render calls for a shared module', async () => {
    const moduleSource = `export default {
      initialize() {},
      async render(id) {
        globalThis.__canofoldMermaidActive = (globalThis.__canofoldMermaidActive || 0) + 1;
        globalThis.__canofoldMermaidMaxActive = Math.max(
          globalThis.__canofoldMermaidMaxActive || 0,
          globalThis.__canofoldMermaidActive
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        globalThis.__canofoldMermaidActive -= 1;
        return { svg: '<svg data-id="' + id + '"></svg>' };
      }
    }`
    const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}#serialized`
    document.body.innerHTML = [
      `<figure data-cf-plugin-diagram="mermaid" data-cf-source="A" data-cf-module-url="${moduleUrl}"><div class="cf-diagram-preview"></div></figure>`,
      `<figure data-cf-plugin-diagram="mermaid" data-cf-source="B" data-cf-module-url="${moduleUrl}"><div class="cf-diagram-preview"></div></figure>`
    ].join('')

    const diagrams = enhanceMermaid(document)
    await diagrams.ready

    expect(
      (globalThis as typeof globalThis & { __canofoldMermaidMaxActive?: number }).__canofoldMermaidMaxActive
    ).toBe(1)
    diagrams.dispose()
  })
})
