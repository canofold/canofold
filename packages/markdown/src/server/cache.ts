import { markdownPluginsIdentity } from '../compiler/plugins.js'
import { prepareMarkdown } from '../compiler/prepareMarkdown.js'
import { stableJson } from '../compiler/stableJson.js'
import { createHash } from 'node:crypto'
import type { PreparedMarkdown, RenderMarkdownOptions } from '../compiler/types.js'
import { prepareMdx } from '../compiler/mdxPlugins.js'
import type { MarkdownContentAnalysis } from '../compiler/analyze.js'
import type { MarkdownAssets } from '../compiler/assets.js'
import { createPreparationCache, preparedMarkdownWeight } from '../compiler/preparationCache.js'

/** Compiled content and resource facts, without retaining the presentation tree. */
export interface MarkdownAnalysisResult extends MarkdownContentAnalysis {
  assets: MarkdownAssets
}

export interface MarkdownServerContextOptions {
  /** Maximum number of prepared entries retained per format (Markdown and MDX). */
  maxEntries?: number
}

interface MarkdownServerContext {
  analyze(
    source: string,
    options?: RenderMarkdownOptions,
    mode?: 'markdown' | 'mdx'
  ): Promise<MarkdownAnalysisResult>
  prepare(source: string, options?: RenderMarkdownOptions): Promise<PreparedMarkdown>
  prepareMdx(source: string, options?: RenderMarkdownOptions): ReturnType<typeof prepareMdx>
  clear(): void
}

function cacheKey(source: string, options?: RenderMarkdownOptions): string | undefined {
  // Plugin functions are not serializable; their declared identity
  // (name/version/cacheKey) stands in for them. Anything else that fails to
  // serialize safely disables caching for that options shape.
  const { plugins, ...rest } = options ?? {}
  const optionsKey = stableJson({ ...rest, plugins: markdownPluginsIdentity(plugins) })
  if (optionsKey === undefined) return undefined
  return createHash('sha256').update(source).update('\0').update(optionsKey).digest('hex')
}

/**
 * Renderer-scoped Markdown cache. It deduplicates concurrent preparation and
 * stays bounded; hosts clear it when a full build invalidates the content
 * graph, while safe single-page dev rebuilds can retain hot entries.
 */
export function createMarkdownServerContext({
  maxEntries = 64
}: MarkdownServerContextOptions = {}): MarkdownServerContext {
  const warningState = new Set<string>()
  const limit = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : 64
  const compilerContext = { warnedLanguages: warningState }
  const prepared = createPreparationCache<PreparedMarkdown>(limit, 16 * 1024 * 1024, preparedMarkdownWeight)
  const mdx = createPreparationCache<Awaited<ReturnType<typeof prepareMdx>>>(
    limit,
    16 * 1024 * 1024,
    (value) => (value.code.length + JSON.stringify(value.analysis).length) * 2
  )
  // Analysis retains content facts, not highlighted trees or executable MDX.
  // Its independent byte budget accommodates large projects without retaining
  // their presentation trees, and remains bounded across deleted/edited pages.
  const analysis = createPreparationCache<MarkdownAnalysisResult>(
    Infinity,
    8 * 1024 * 1024,
    (value) => JSON.stringify(value).length * 2
  )

  return {
    analyze(source, options, mode = 'markdown') {
      const key = cacheKey(source, options)
      return analysis.get(key === undefined ? undefined : `${mode}:${key}`, async () => {
        const result =
          mode === 'mdx' ? await this.prepareMdx(source, options) : await this.prepare(source, options)
        return { ...result.analysis, assets: result.assets }
      })
    },
    prepare(source, options) {
      return prepared.get(cacheKey(source, options), () => prepareMarkdown(source, options, compilerContext))
    },
    prepareMdx(source, options) {
      return mdx.get(cacheKey(source, options), () => prepareMdx(source, options, compilerContext))
    },
    clear() {
      prepared.clear()
      mdx.clear()
      analysis.clear()
      warningState.clear()
    }
  }
}
