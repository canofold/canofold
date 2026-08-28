import rehypeSlug from 'rehype-slug'
import type { Options as RemarkRehypeOptions } from 'remark-rehype'
import type { Pluggable, PluggableList } from 'unified'
import { defListHastHandlers, remarkDefinitionList } from 'remark-definition-list'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import type { MarkdownAssetCollector } from './assets'
import type { NormalizedMarkdownOptions } from './normalizeOptions'
import {
  remarkFenceMetadata,
  rehypeFenceMetadata,
  remarkMdxIslandTracker,
  remarkMdxRichBlocks,
  rehypeCodeBlocks,
  rehypeRichFences
} from './plugins/code'
import {
  rehypeStepGroup,
  rehypeStepItem,
  rehypeTabGroup,
  rehypeTabItem,
  remarkCallouts,
  remarkRichDirectives,
  remarkSteps,
  remarkTabGroups,
  rehypeRichDirectives
} from './plugins/directives'
import { rehypeDocumentBlocks } from './plugins/documentBlocks'
import { rehypeTables } from './plugins/tables'
import type { MarkdownSyntaxFeatures } from './syntaxFeatures'
import { remarkValidateRichDirectives } from './directiveValidation'
import { markdownPluginDirectiveNames } from './plugins'

export interface MarkdownPluginPlan {
  remarkPlugins: PluggableList
  rehypePlugins: PluggableList
  handlers: MarkdownHandlers
}

export type MarkdownHandlers = NonNullable<RemarkRehypeOptions['handlers']> & {
  tabGroup: typeof rehypeTabGroup
  tabItem: typeof rehypeTabItem
  stepGroup: typeof rehypeStepGroup
  stepItem: typeof rehypeStepItem
}

export function createMarkdownPluginPlan(
  mode: 'markdown' | 'mdx',
  assets: MarkdownAssetCollector,
  options: NormalizedMarkdownOptions,
  syntax: MarkdownSyntaxFeatures,
  syntaxHighlighter?: Pluggable
): MarkdownPluginPlan {
  const { features } = options
  const pluginFenceLanguages = new Set(
    options.plugins.flatMap((plugin) => plugin.fenceLanguages ?? []).map((language) => language.toLowerCase())
  )
  const remarkPlugins: PluggableList = [remarkDefinitionList, remarkGfm]
  remarkPlugins.push(remarkDirective)
  remarkPlugins.push([remarkValidateRichDirectives, markdownPluginDirectiveNames(options.plugins)])

  if (features.tabs || features.codeGroups) remarkPlugins.push([remarkTabGroups, options])
  if (features.steps) remarkPlugins.push([remarkSteps, options])
  if (features.callouts) remarkPlugins.push(remarkCallouts)
  if (features.documentBlocks) remarkPlugins.push(remarkRichDirectives)
  // Syntax-owning plugins annotate mdast before the core converts rich blocks.
  for (const plugin of options.plugins) {
    if (plugin.remarkPlugins) remarkPlugins.push(...plugin.remarkPlugins)
  }
  if (mode === 'mdx') {
    remarkPlugins.push([remarkMdxIslandTracker, assets])
    if (features.terminals) remarkPlugins.push([remarkMdxRichBlocks, assets, options])
  } else if (features.terminals || syntax.highlightedCode) {
    remarkPlugins.push([remarkFenceMetadata, options])
  }

  const rehypePlugins: PluggableList = []
  if (mode === 'markdown' && features.terminals) rehypePlugins.push([rehypeRichFences, assets, options])
  if (features.documentBlocks) rehypePlugins.push(rehypeRichDirectives)
  rehypePlugins.push(rehypeSlug)
  if (syntax.highlightedCode) rehypePlugins.push(rehypeFenceMetadata)
  if (syntax.highlightedCode && syntaxHighlighter) rehypePlugins.push(syntaxHighlighter)

  if (features.documentBlocks) {
    rehypePlugins.push([rehypeDocumentBlocks, assets, options.labels])
  }
  if (features.tables) rehypePlugins.push([rehypeTables, assets, options.labels])
  if (features.codeBlocks)
    rehypePlugins.push([rehypeCodeBlocks, assets, options.labels, pluginFenceLanguages])

  // Rehype plugins see the final semantic HTML.
  for (const plugin of options.plugins) {
    if (plugin.rehypePlugins) rehypePlugins.push(...plugin.rehypePlugins)
  }

  const handlers: MarkdownPluginPlan['handlers'] = {
    ...defListHastHandlers,
    tabGroup: rehypeTabGroup,
    tabItem: rehypeTabItem,
    stepGroup: rehypeStepGroup,
    stepItem: rehypeStepItem
  }
  return { remarkPlugins, rehypePlugins, handlers }
}
