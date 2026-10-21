import { describe, expect, it } from 'vitest'
import { rehypeRichDirectives, remarkRichDirectives } from './plugins/directives'
import { createMarkdownMdxPlugins } from './mdxPlugins'
import { remarkDefinitionList } from 'remark-definition-list'

describe('Markdown MDX plugins', () => {
  it('keeps definition syntax when no source is available and skips only impossible matches', async () => {
    expect((await createMarkdownMdxPlugins()).remarkPlugins).toContain(remarkDefinitionList)
    expect((await createMarkdownMdxPlugins({}, 'Term\n: Meaning')).remarkPlugins).toContain(
      remarkDefinitionList
    )
    expect((await createMarkdownMdxPlugins({}, '# Plain\n\nText')).remarkPlugins).not.toContain(
      remarkDefinitionList
    )
  })
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
