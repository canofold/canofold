// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhance as enhanceKroki } from './kroki'
import { enhance as enhanceMermaid, loadMermaidModule, normalizeMermaidColor } from './mermaid'
import { enhance as enhancePlantuml } from './plantuml'

afterEach(() => {
  document.body.innerHTML = ''
  const runtime = globalThis as typeof globalThis & {
    __docfuseFinishMermaid?: () => void
    __docfuseMermaidRenders?: number
    __docfuseMermaidActive?: number
    __docfuseMermaidMaxActive?: number
  }
  delete runtime.__docfuseFinishMermaid
  delete runtime.__docfuseMermaidRenders
  delete runtime.__docfuseMermaidActive
  delete runtime.__docfuseMermaidMaxActive
})

describe('diagram client entries', () => {
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
    document.body.innerHTML = `<figure data-df-plugin-diagram="${kind}"></figure>`
    const figure = document.querySelector<HTMLElement>('figure')!

    const dispose = enhance(document)
    expect(figure.dataset.dfEnhanced).toBe('true')

    dispose()
    expect(figure.dataset.dfEnhanced).toBeUndefined()
  })

  it('renders Mermaid from its configured self-hosted module and stops observing after disposal', async () => {
    const moduleSource = `export default {
      initialize() {},
      async render() {
        globalThis.__docfuseMermaidRenders = (globalThis.__docfuseMermaidRenders || 0) + 1;
        return { svg: '<svg data-rendered="true"></svg>' };
      }
    }`
    const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}`
    document.body.innerHTML = `<figure data-df-plugin-diagram="mermaid" data-df-source="A --&gt; B" data-df-module-url="${moduleUrl}"><div class="df-diagram-preview"></div></figure>`

    const dispose = enhanceMermaid(document)
    await vi.waitFor(() =>
      expect(document.querySelector('.df-diagram-preview svg')?.getAttribute('data-rendered')).toBe('true')
    )
    expect(
      (globalThis as typeof globalThis & { __docfuseMermaidRenders?: number }).__docfuseMermaidRenders
    ).toBe(1)

    dispose()
    document.documentElement.classList.toggle('dark')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(
      (globalThis as typeof globalThis & { __docfuseMermaidRenders?: number }).__docfuseMermaidRenders
    ).toBe(1)
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
          globalThis.__docfuseFinishMermaid = () => resolve({ svg: '<svg data-late="true"></svg>' });
        });
      }
    }`
    const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}#late`
    document.body.innerHTML = `<figure data-df-plugin-diagram="mermaid" data-df-source="A --&gt; B" data-df-module-url="${moduleUrl}"><div class="df-diagram-preview"></div></figure>`

    const dispose = enhanceMermaid(document)
    await vi.waitFor(() =>
      expect(
        (globalThis as typeof globalThis & { __docfuseFinishMermaid?: () => void }).__docfuseFinishMermaid
      ).toBeTypeOf('function')
    )
    dispose()
    ;(
      globalThis as typeof globalThis & {
        __docfuseFinishMermaid?: () => void
      }
    ).__docfuseFinishMermaid?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(document.querySelector('.df-diagram-preview')?.innerHTML).toBe('')
  })

  it('serializes Mermaid initialize and render calls for a shared module', async () => {
    const moduleSource = `export default {
      initialize() {},
      async render(id) {
        globalThis.__docfuseMermaidActive = (globalThis.__docfuseMermaidActive || 0) + 1;
        globalThis.__docfuseMermaidMaxActive = Math.max(
          globalThis.__docfuseMermaidMaxActive || 0,
          globalThis.__docfuseMermaidActive
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        globalThis.__docfuseMermaidActive -= 1;
        return { svg: '<svg data-id="' + id + '"></svg>' };
      }
    }`
    const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}#serialized`
    document.body.innerHTML = [
      `<figure data-df-plugin-diagram="mermaid" data-df-source="A" data-df-module-url="${moduleUrl}"><div class="df-diagram-preview"></div></figure>`,
      `<figure data-df-plugin-diagram="mermaid" data-df-source="B" data-df-module-url="${moduleUrl}"><div class="df-diagram-preview"></div></figure>`
    ].join('')

    const diagrams = enhanceMermaid(document)
    await diagrams.ready

    expect(
      (globalThis as typeof globalThis & { __docfuseMermaidMaxActive?: number }).__docfuseMermaidMaxActive
    ).toBe(1)
    diagrams.dispose()
  })
})
