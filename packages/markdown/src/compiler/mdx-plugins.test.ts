import { describe, expect, it } from 'vitest'
import { rehypeRichDirectives, remarkRichDirectives } from './plugins/directives'
import { createMarkdownMdxPlugins } from './mdxPlugins'

describe('Markdown MDX plugins', () => {
  it('returns the shared stateless syntax and rehype plugins', async () => {
    const plugins = await createMarkdownMdxPlugins()

    expect(plugins.remarkPlugins).toContain(remarkRichDirectives)
    expect(plugins.rehypePlugins).toContain(rehypeRichDirectives)
    expect(
      plugins.remarkPlugins.every((plugin) => typeof plugin === 'function' || Array.isArray(plugin))
    ).toBe(true)
    expect(
      plugins.rehypePlugins.every((plugin) => typeof plugin === 'function' || Array.isArray(plugin))
    ).toBe(true)
    expect(plugins.remarkRehypeOptions.handlers.tabGroup).toBeTypeOf('function')
    expect(plugins.getAssets()).toEqual({
      behaviors: [],
      math: false,
      pluginClients: [],
      pluginStyles: []
    })
  })
})
