import { activeMarkdownPlugins } from './plugins'
import type { MarkdownPlugin, MarkdownPluginClientAsset, MarkdownPluginStyleAsset } from './types'
import { stableJson } from './stableJson'

export interface MarkdownAssets {
  /** Browser behaviors required by the rendered document. */
  behaviors: MarkdownBehaviorName[]
  /** Whether the document needs KaTeX CSS and font resources. */
  math: boolean
  /** Browser entries contributed by active compiler plugins. */
  pluginClients: MarkdownPluginClientAsset[]
  /** Published CSS entries contributed by active compiler plugins. */
  pluginStyles: MarkdownPluginStyleAsset[]
}

/** Canonical browser behavior facts shared by the compiler and client runtime. */
export const MARKDOWN_BEHAVIOR_NAMES = [
  'gallery',
  'code-toolbar',
  'copy-snippet',
  'terminal-toolbar',
  'table',
  'image',
  'heading',
  'tabs',
  'details',
  'file-tree'
] as const

export type MarkdownBehaviorName = (typeof MARKDOWN_BEHAVIOR_NAMES)[number]

export interface MarkdownAssetCollector {
  markBehavior(name: MarkdownBehaviorName): void
  markMath(): void
  markPluginAssets(plugin: MarkdownPlugin): void
  snapshot(): MarkdownAssets
}

function registerAsset<T extends { id: string }>(assets: T[], asset: T, kind: string) {
  const existing = assets.find((current) => current.id === asset.id)
  if (!existing) {
    assets.push(asset)
    return
  }
  if (stableJson(existing) !== stableJson(asset)) {
    throw new Error(`Markdown plugin ${kind} id "${asset.id}" is declared with conflicting definitions`)
  }
}

function uniqueAssets<T extends { id: string }>(assets: readonly T[], kind: string) {
  const unique: T[] = []
  assets.forEach((asset) => registerAsset(unique, asset, kind))
  return unique
}

export function createMarkdownAssetCollector(): MarkdownAssetCollector {
  const assets: MarkdownAssets = {
    behaviors: [],
    math: false,
    pluginClients: [],
    pluginStyles: []
  }

  return {
    markBehavior(name) {
      if (!assets.behaviors.includes(name)) assets.behaviors.push(name)
    },
    markMath() {
      assets.math = true
    },
    markPluginAssets(plugin) {
      if (plugin.assets?.math) assets.math = true
      for (const client of plugin.assets?.clients ?? []) {
        registerAsset(assets.pluginClients, client, 'client')
      }
      for (const style of plugin.assets?.styles ?? []) {
        registerAsset(assets.pluginStyles, style, 'style')
      }
    },
    snapshot() {
      return {
        behaviors: [...assets.behaviors],
        math: assets.math,
        pluginClients: [...assets.pluginClients],
        pluginStyles: [...assets.pluginStyles]
      }
    }
  }
}

/**
 * Conservative source-level detection for MDX pages.
 *
 * MDX is evaluated by its own compiler, so it cannot reuse the Markdown HAST
 * visitor without first executing trusted JSX. This detector intentionally
 * prefers a false positive over omitting an interaction script.
 */
export function detectMarkdownAssets(
  source: string,
  plugins: readonly MarkdownPlugin[] = [],
  mode: 'markdown' | 'mdx' = 'markdown'
): MarkdownAssets {
  const activePlugins = activeMarkdownPlugins(plugins, { source, mode })
  const hasGallery = /<(?:Markdown)?Gallery\b/i.test(source)
  const hasTabs = /:::\s*(?:tabs|code-group)\b|<(?:Markdown)?(?:Tabs|CodeGroup)\b/i.test(source)
  const hasFileTree = /<(?:Markdown)?FileTree\b/i.test(source)
  const hasDetails = /<(?:Markdown)?Details\b/i.test(source)
  const hasGfmTable =
    /^ {0,3}(?:\|[^\r\n]*\||[^\r\n|]+\|[^\r\n]*)\r?\n {0,3}\|? *:?-+:? *(?:\| *:?-+:? *)+\|? *$/m
  const behaviors: MarkdownBehaviorName[] = []
  if (hasGallery) behaviors.push('gallery')
  if (hasTabs) behaviors.push('tabs')
  if (hasDetails) behaviors.push('details')
  if (hasFileTree) behaviors.push('file-tree')
  if (/<(?:Markdown)?(?:Terminal)\b|(?:`{3,}|~{3,})\s*terminal\b/i.test(source))
    behaviors.push('terminal-toolbar')
  if (/<(?:Markdown)?Image\b|!\[[^\]]*\]\([^)]*\)/i.test(source)) behaviors.push('image')
  if (/(?:^|\n)\s*#{2,6}\s+\S/.test(source)) behaviors.push('heading')
  if (/<(?:Markdown)?CodeBlock\b|(?:^|\n)\s*(?:`{3,}|~{3,})(?!\s*terminal\b)/i.test(source))
    behaviors.push('code-toolbar')
  if (/<(?:Markdown)?CopySnippet\b|data-df-component=["']copy-snippet["']/i.test(source))
    behaviors.push('copy-snippet')
  if (/<(?:Markdown)?Table\b/i.test(source) || hasGfmTable.test(source)) behaviors.push('table')

  return {
    behaviors: [...new Set(behaviors)],
    math: activePlugins.some((plugin) => plugin.assets?.math),
    pluginClients: uniqueAssets(
      activePlugins.flatMap((plugin) => plugin.assets?.clients ?? []),
      'client'
    ),
    pluginStyles: uniqueAssets(
      activePlugins.flatMap((plugin) => plugin.assets?.styles ?? []),
      'style'
    )
  }
}
