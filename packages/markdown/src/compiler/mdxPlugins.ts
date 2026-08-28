import { createMarkdownAssetCollector, type MarkdownAssets } from './assets'
import { normalizeOptions } from './normalizeOptions'
import { createMarkdownPluginPlan } from './pluginPlan'
import type { RenderMarkdownOptions } from './types'
import type { PluggableList } from 'unified'
import type { MarkdownHandlers } from './pluginPlan'
import { createSyntaxHighlighterPlugin } from './highlighter'
import { detectMarkdownSyntax } from './syntaxFeatures'
import type { MarkdownCompilerContext } from './prepareMarkdown'
import { activeMarkdownPlugins, markdownPluginFenceLanguages } from './plugins'

interface MarkdownMdxPlugins {
  remarkPlugins: PluggableList
  rehypePlugins: PluggableList
  remarkRehypeOptions: {
    handlers: MarkdownHandlers
  }
  getAssets: () => MarkdownAssets
}

/** MDX owns JSX evaluation while sharing Markdown's ordered plugin plan. */
export async function createMarkdownMdxPlugins(
  options: RenderMarkdownOptions = {},
  source?: string,
  context: MarkdownCompilerContext = { warnedLanguages: new Set<string>() }
): Promise<MarkdownMdxPlugins> {
  const normalized = normalizeOptions(options)
  const assets = createMarkdownAssetCollector()
  const resolvedSource = source ?? ''
  const activePlugins = activeMarkdownPlugins(normalized.plugins, { source: resolvedSource, mode: 'mdx' })
  const pluginFenceLanguages = markdownPluginFenceLanguages(activePlugins)
  const activeOptions = { ...normalized, plugins: activePlugins }
  const syntax = detectMarkdownSyntax(resolvedSource, pluginFenceLanguages)
  activePlugins.forEach((plugin) => assets.markPluginAssets(plugin))
  const syntaxHighlighter = syntax.highlightedCode
    ? await createSyntaxHighlighterPlugin(
        syntax.codeLanguages,
        activeOptions,
        context.warnedLanguages,
        pluginFenceLanguages
      )
    : undefined
  const plan = createMarkdownPluginPlan('mdx', assets, activeOptions, syntax, syntaxHighlighter)

  return {
    remarkPlugins: plan.remarkPlugins,
    rehypePlugins: plan.rehypePlugins,
    remarkRehypeOptions: { handlers: plan.handlers },
    getAssets: () => assets.snapshot()
  }
}
