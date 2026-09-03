import { createMarkdownProcessor } from './createPipeline'
import { normalizeCallouts } from './plugins/directives'
import { createMarkdownAssetCollector } from './assets'
import { normalizeOptions } from './normalizeOptions'
import { createSyntaxHighlighterPlugin } from './highlighter'
import { detectMarkdownSyntax } from './syntaxFeatures'
import { activeMarkdownPlugins, markdownPluginFenceLanguages } from './plugins'
import type { PreparedMarkdown, RenderMarkdownOptions } from './types'

export type { MarkdownAssets } from './assets'
export type {
  MarkdownCodeOptions,
  MarkdownFeatureOptions,
  MarkdownHtmlPolicy,
  MarkdownLabels,
  MarkdownPlugin,
  MarkdownPluginBrowserCompiler,
  MarkdownPluginCacheValue,
  MarkdownPluginClientAsset,
  MarkdownPluginClientResource,
  MarkdownPluginClientResourceDirectory,
  MarkdownPluginContext,
  MarkdownPluginStyleAsset,
  MarkdownUnknownLanguagePolicy,
  RenderMarkdownOptions
} from './types'

export interface MarkdownCompilerContext {
  warnedLanguages: Set<string>
}

/**
 * Prepare Markdown as a transformed HAST document for the package's React
 * renderers. This compiler boundary remains internal to the package.
 */
export async function prepareMarkdown(
  source: string,
  options?: RenderMarkdownOptions,
  context: MarkdownCompilerContext = { warnedLanguages: new Set<string>() }
): Promise<PreparedMarkdown> {
  const assets = createMarkdownAssetCollector()
  const resolvedOptions = normalizeOptions(options)
  const activePlugins = activeMarkdownPlugins(resolvedOptions.plugins, { source, mode: 'markdown' })
  const pluginFenceLanguages = markdownPluginFenceLanguages(activePlugins)
  const activeOptions = { ...resolvedOptions, plugins: activePlugins }
  const syntax = detectMarkdownSyntax(source, pluginFenceLanguages)
  activePlugins.forEach((plugin) => assets.markPluginAssets(plugin))
  // Keep raw HTML parsing and sanitization out of the strip-only path. The
  // modules are cached by the ESM loader after their first use.
  const [rawModule, sanitizeModule, syntaxHighlighter] = await Promise.all([
    activeOptions.htmlPolicy !== 'strip' ? import('rehype-raw') : undefined,
    activeOptions.htmlPolicy === 'sanitize' ? import('rehype-sanitize') : undefined,
    syntax.highlightedCode
      ? createSyntaxHighlighterPlugin(
          syntax.codeLanguages,
          activeOptions,
          context.warnedLanguages,
          pluginFenceLanguages
        )
      : undefined
  ])
  const rehypeRaw = rawModule?.default
  const rehypeSanitize = sanitizeModule?.default
  const processor = createMarkdownProcessor({
    assets,
    options: activeOptions,
    rehypeRaw,
    rehypeSanitize,
    sanitizeSchema: sanitizeModule?.defaultSchema,
    syntax,
    syntaxHighlighter
  })
  const tree = processor.parse(normalizeCallouts(source))
  const document = await processor.run(tree, {
    data: { canofoldLocale: options?.locale?.trim() || undefined }
  })
  return {
    document: document as PreparedMarkdown['document'],
    assets: assets.snapshot()
  }
}
