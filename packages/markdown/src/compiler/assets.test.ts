import { describe, expect, it } from 'vitest'
import { defineMarkdownPlugin } from './plugins'
import { createMarkdownAssetCollector, detectMarkdownAssets, type MarkdownBehaviorName } from './assets'

describe('Markdown asset collector', () => {
  it('keeps collection local and returns immutable snapshots', () => {
    const collector = createMarkdownAssetCollector()

    collector.markBehavior('table')

    const first = collector.snapshot()
    collector.markBehavior('gallery')

    expect(first).toEqual({
      behaviors: ['table'],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
    expect(collector.snapshot()).toEqual({
      behaviors: ['table', 'gallery'],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('tracks math independently from browser behavior names', () => {
    const collector = createMarkdownAssetCollector()
    collector.markMath()

    expect(collector.snapshot()).toEqual({
      behaviors: [],
      math: true,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it.each<[MarkdownBehaviorName, string]>([
    ['gallery', '<MarkdownGallery />'],
    ['tabs', '::::tabs[Install]\n::::'],
    ['details', '<MarkdownDetails />'],
    ['file-tree', '<MarkdownFileTree />'],
    ['terminal-toolbar', '```terminal\n$ pnpm test\n```'],
    ['image', '![Architecture](architecture.png)'],
    ['heading', '## Install'],
    ['code-toolbar', '<MarkdownCodeBlock />'],
    ['code-toolbar', '```ts\nconst answer = 42\n```'],
    ['copy-snippet', '<span data-df-component="copy-snippet">copy</span>'],
    ['table', '<MarkdownTable />'],
    ['table', '| Name | Value |\n| --- | --- |\n| Docfuse | Fast |']
  ])('detects the %s browser resource fact from MDX source', (behavior, source) => {
    expect(detectMarkdownAssets(source).behaviors).toContain(behavior)
  })

  it('detects math independently and keeps static prose free of resource facts', () => {
    const mathPlugin = defineMarkdownPlugin({
      name: 'math-test',
      appliesTo: ({ source }) => source.includes('$'),
      assets: { math: true }
    })

    expect(detectMarkdownAssets('# Formula\n\n$E = mc^2$')).toMatchObject({ math: false })
    expect(detectMarkdownAssets('# Formula\n\n$E = mc^2$', [mathPlugin])).toMatchObject({ math: true })
    expect(detectMarkdownAssets('# Plain title\n\nStatic prose.')).toEqual({
      behaviors: [],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })

  it('rejects conflicting plugin assets instead of silently keeping the first declaration', () => {
    const first = defineMarkdownPlugin({
      name: 'first-assets',
      assets: { clients: [{ id: 'shared', module: 'module-a' }] }
    })
    const second = defineMarkdownPlugin({
      name: 'second-assets',
      assets: { clients: [{ id: 'shared', module: 'module-b' }] }
    })

    expect(() => detectMarkdownAssets('content', [first, second])).toThrow(
      'Markdown plugin client id "shared" is declared with conflicting definitions'
    )

    const collector = createMarkdownAssetCollector()
    collector.markPluginAssets(first)
    expect(() => collector.markPluginAssets(second)).toThrow(
      'Markdown plugin client id "shared" is declared with conflicting definitions'
    )
  })

  it('allows identical plugin asset declarations to be shared', () => {
    const asset = { id: 'shared', module: 'shared-module' }
    const first = defineMarkdownPlugin({ name: 'first-shared', assets: { clients: [asset] } })
    const second = defineMarkdownPlugin({ name: 'second-shared', assets: { clients: [asset] } })

    expect(detectMarkdownAssets('content', [first, second]).pluginClients).toEqual([asset])
  })
})
