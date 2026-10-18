import { createMarkdownAssetCollector, type MarkdownAssets } from './assets.js'
import { normalizeOptions } from './normalizeOptions.js'
import { createMarkdownPluginPlan } from './pluginPlan.js'
import type { RenderMarkdownOptions } from './types.js'
import type { PluggableList } from 'unified'
import type { MarkdownHandlers } from './pluginPlan.js'
import { createSyntaxHighlighterPlugin } from './highlighter.js'
import { detectMarkdownSyntax } from './syntaxFeatures.js'
import type { MarkdownCompilerContext } from './prepareMarkdown.js'
import {
  activeMarkdownPlugins,
  markdownPluginFenceLanguages,
  markdownPluginHighlightLanguages
} from './plugins.js'
import { compile } from '@mdx-js/mdx'
import type { Root as HastRoot } from 'hast'
import type { Plugin } from 'unified'
import { analyzeDocument, type MarkdownContentAnalysis, type MarkdownCodeExample } from './analyze.js'
import { normalizeCallouts } from './plugins/directives.js'

export async function prepareMdx(
  source: string,
  options: RenderMarkdownOptions | undefined,
  context: MarkdownCompilerContext
) {
  if (options?.html && options.html !== 'trusted') {
    throw new Error('MDX executes trusted JSX and does not support sanitize or strip HTML policies')
  }
  const plugins = await createMarkdownMdxPlugins(options, source, context)
  let analysis: MarkdownContentAnalysis | undefined
  const collect: Plugin<[], HastRoot> = () => (tree, file) => {
    analysis = analyzeDocument(tree, file.data.canofoldCodeExamples as MarkdownCodeExample[])
  }
  const compiled = await compile(
    {
      value: normalizeCallouts(source),
      data: { canofoldLocale: options?.locale?.trim() || undefined }
    },
    {
      outputFormat: 'function-body',
      remarkPlugins: plugins.remarkPlugins,
      rehypePlugins: [...plugins.rehypePlugins, collect],
      remarkRehypeOptions: plugins.remarkRehypeOptions
    }
  )
  if (!analysis) throw new Error('MDX compilation did not produce content analysis')
  return { code: String(compiled), analysis, assets: plugins.getAssets() }
}

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
  const detectedSyntax = detectMarkdownSyntax(resolvedSource, pluginFenceLanguages)
  const codeLanguages = [
    ...new Set([...detectedSyntax.codeLanguages, ...markdownPluginHighlightLanguages(activePlugins)])
  ]
  const syntax = {
    highlightedCode: codeLanguages.length > 0,
    codeLanguages
  }
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
