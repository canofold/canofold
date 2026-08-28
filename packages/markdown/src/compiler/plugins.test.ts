import type { Element, Root as HastRoot } from 'hast'
import type { Root as MdastRoot, Text as MdastText } from 'mdast'
import { describe, expect, it } from 'vitest'
import { visit } from 'unist-util-visit'
import { createMarkdownServerContext } from '../server/cache'
import { defineMarkdownPlugin, markdownPluginsIdentity } from './plugins'
import { prepareMarkdown } from './prepareMarkdown'

function elementsByTag(document: HastRoot, tagName: string) {
  const matches: Element[] = []
  visit(document, 'element', (node: Element) => {
    if (node.tagName === tagName) matches.push(node)
  })
  return matches
}

describe('markdown compiler plugins', () => {
  it('runs plugin remark transforms on the parsed mdast', async () => {
    const shout = defineMarkdownPlugin({
      name: 'shout',
      version: '1',
      remarkPlugins: [
        () => (tree: MdastRoot) => {
          visit(tree, 'text', (node: MdastText) => {
            node.value = node.value.toUpperCase()
          })
        }
      ]
    })
    const prepared = await prepareMarkdown('hello plugins', { plugins: [shout] })
    const [paragraph] = elementsByTag(prepared.document, 'p')

    expect(paragraph?.children).toContainEqual(expect.objectContaining({ value: 'HELLO PLUGINS' }))
  })

  it('allows only explicitly declared plugin-owned directives', async () => {
    const custom = defineMarkdownPlugin({
      name: 'custom-directive',
      directiveNames: ['custom']
    })

    await expect(
      prepareMarkdown(':::custom[Plugin content]\nBody\n:::', { plugins: [custom] })
    ).resolves.toBeDefined()
    await expect(prepareMarkdown(':::custom[Plugin content]\nBody\n:::')).rejects.toThrow(
      'Unknown Markdown directive `custom`'
    )
  })

  it('runs plugin rehype transforms after the built-in pipeline', async () => {
    let observedHeadingId: unknown
    const marker = defineMarkdownPlugin({
      name: 'marker',
      version: '1',
      rehypePlugins: [
        () => (tree: HastRoot) => {
          visit(tree, 'element', (node: Element) => {
            if (node.tagName !== 'h1') return
            observedHeadingId = node.properties.id
            node.properties['data-marked'] = 'true'
          })
        }
      ]
    })
    const prepared = await prepareMarkdown('# Plugin Order', { plugins: [marker] })
    const [heading] = elementsByTag(prepared.document, 'h1')

    // rehype-slug already ran, so plugins observe the final semantic HTML.
    expect(observedHeadingId).toBe('plugin-order')
    expect(heading?.properties['data-marked']).toBe('true')
  })

  it('rejects invalid and duplicate plugin names eagerly', async () => {
    expect(() => defineMarkdownPlugin({ name: 'Bad Name' })).toThrow(/lowercase kebab-case/)
    await expect(prepareMarkdown('text', { plugins: [{ name: 'UPPER' }] })).rejects.toThrow(
      /lowercase kebab-case/
    )
    await expect(
      prepareMarkdown('text', { plugins: [{ name: 'twice' }, { name: 'twice' }] })
    ).rejects.toThrow(/unique names/)
  })

  it('rejects non-JSON cache identities and duplicate fence ownership', async () => {
    expect(() =>
      defineMarkdownPlugin({ name: 'bad-cache', cacheKey: { pattern: /alpha/ } } as never)
    ).toThrow(/cacheKey must be JSON-serializable/)
    await expect(
      prepareMarkdown('```shared\nvalue\n```', {
        plugins: [
          { name: 'first-fence', fenceLanguages: ['shared'] },
          { name: 'second-fence', fenceLanguages: ['SHARED'] }
        ]
      })
    ).rejects.toThrow('Fence language "shared" is owned by both "first-fence" and "second-fence"')
    await expect(
      prepareMarkdown(':::shared\nvalue\n:::', {
        plugins: [
          { name: 'first-directive', directiveNames: ['shared'] },
          { name: 'second-directive', directiveNames: ['shared'] }
        ]
      })
    ).rejects.toThrow('Directive "shared" is owned by both "first-directive" and "second-directive"')
  })

  it('validates browser compiler descriptors used by authoring surfaces', () => {
    expect(() =>
      defineMarkdownPlugin({
        name: 'browser-ready',
        browserCompiler: {
          module: '@scope/plugin',
          exportName: 'pluginFactory',
          options: { enabled: true }
        }
      })
    ).not.toThrow()
    expect(() =>
      defineMarkdownPlugin({
        name: 'bad-browser-export',
        browserCompiler: { module: '@scope/plugin', exportName: 'factory()' }
      })
    ).toThrow(/named JavaScript export/)
    expect(() =>
      defineMarkdownPlugin({
        name: 'bad-browser-options',
        browserCompiler: {
          module: '@scope/plugin',
          exportName: 'factory',
          options: { pattern: /alpha/ }
        }
      } as never)
    ).toThrow(/browserCompiler.options must be JSON-serializable/)
  })

  it('derives a serializable cache identity from name, version and cacheKey', () => {
    expect(
      markdownPluginsIdentity([
        { name: 'first', version: '2', cacheKey: { flag: true } },
        { name: 'second', remarkPlugins: [] }
      ])
    ).toEqual([
      { name: 'first', version: '2', cacheKey: { flag: true } },
      { name: 'second', version: '', cacheKey: null }
    ])
  })

  it('caches renders across plugin instances with the same identity', async () => {
    const context = createMarkdownServerContext()
    let runs = 0
    const counting = (version: string) =>
      defineMarkdownPlugin({
        name: 'counting',
        version,
        rehypePlugins: [
          () => () => {
            runs += 1
          }
        ]
      })

    await context.prepare('# Cached', { plugins: [counting('1')] })
    await context.prepare('# Cached', { plugins: [counting('1')] })
    expect(runs).toBe(1)

    await context.prepare('# Cached', { plugins: [counting('2')] })
    expect(runs).toBe(2)
  })
})
