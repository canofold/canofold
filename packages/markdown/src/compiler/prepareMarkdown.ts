import { createMarkdownProcessor } from './createPipeline.js'
import { normalizeCallouts } from './plugins/directives.js'
import { createMarkdownAssetCollector } from './assets.js'
import { normalizeOptions } from './normalizeOptions.js'
import { createSyntaxHighlighterPlugin } from './highlighter.js'
import { detectMarkdownSyntax } from './syntaxFeatures.js'
import {
  activeMarkdownPlugins,
  markdownPluginFenceLanguages,
  markdownPluginHighlightLanguages
} from './plugins.js'
import type { PreparedMarkdown, RenderMarkdownOptions } from './types.js'
import { analyzeDocument, type MarkdownCodeExample } from './analyze.js'

export type { MarkdownAssets } from './assets.js'
export type {
  MarkdownCodeOverflow,
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
} from './types.js'

export interface MarkdownCompilerContext {
  warnedLanguages: Set<string>
  signal?: AbortSignal
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
  context.signal?.throwIfAborted()
  const assets = createMarkdownAssetCollector()
  const resolvedOptions = normalizeOptions(options)
  const activePlugins = activeMarkdownPlugins(resolvedOptions.plugins, { source, mode: 'markdown' })
  const pluginFenceLanguages = markdownPluginFenceLanguages(activePlugins)
  const activeOptions = { ...resolvedOptions, plugins: activePlugins }
  const detectedSyntax = detectMarkdownSyntax(source, pluginFenceLanguages)
  const codeLanguages = [
    ...new Set([...detectedSyntax.codeLanguages, ...markdownPluginHighlightLanguages(activePlugins)])
  ]
  const syntax = {
    definitionLists: detectedSyntax.definitionLists,
    highlightedCode: codeLanguages.length > 0,
    codeLanguages
  }
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
          pluginFenceLanguages,
          context.signal
        )
      : undefined
  ])
  const rehypeRaw = rawModule?.default
  context.signal?.throwIfAborted()
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
  const value = normalizeCallouts(source)
  const tree = processor.parse(value)
  const data = {
    canofoldLocale: options?.locale?.trim() || undefined,
    canofoldCodeExamples: [] as MarkdownCodeExample[]
  }
  const document = (await processor.run(tree, { value, data })) as PreparedMarkdown['document']
  context.signal?.throwIfAborted()
  return {
    document,
    analysis: analyzeDocument(document, data.canofoldCodeExamples),
    assets: assets.snapshot()
  }
}
