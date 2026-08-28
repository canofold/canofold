import { markdownPluginsIdentity } from '../compiler/plugins'
import { prepareMarkdown } from '../compiler/prepareMarkdown'
import { stableJson } from '../compiler/stableJson'
import { createHash } from 'node:crypto'
import type { PreparedMarkdown, RenderMarkdownOptions } from '../compiler/types'

export interface MarkdownServerContextOptions {
  /** Maximum number of prepared entries retained by this context. */
  maxEntries?: number
  /** @internal Warning state shared by one renderer's Markdown and MDX paths. */
  warningState?: Set<string>
}

interface MarkdownServerContext {
  prepare(source: string, options?: RenderMarkdownOptions): Promise<PreparedMarkdown>
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

function remember<T>(cache: Map<string, Promise<T>>, key: string, value: Promise<T>, maxEntries: number) {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return value
}

function cached<T>(
  cache: Map<string, Promise<T>>,
  key: string | undefined,
  create: () => Promise<T>,
  maxEntries: number
) {
  if (!key) return create()
  const existing = cache.get(key)
  if (existing) {
    cache.delete(key)
    cache.set(key, existing)
    return existing
  }

  const value = create().catch((error) => {
    if (cache.get(key) === value) cache.delete(key)
    throw error
  })
  return remember(cache, key, value, maxEntries)
}

/**
 * Renderer-scoped Markdown cache. It deduplicates concurrent preparation and
 * stays bounded; hosts clear it when a full build invalidates the content
 * graph, while safe single-page dev rebuilds can retain hot entries.
 */
export function createMarkdownServerContext({
  maxEntries = 64,
  warningState = new Set<string>()
}: MarkdownServerContextOptions = {}): MarkdownServerContext {
  const limit = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : 64
  const prepared = new Map<string, Promise<PreparedMarkdown>>()

  return {
    prepare(source, options) {
      return cached(
        prepared,
        cacheKey(source, options),
        () => prepareMarkdown(source, options, { warnedLanguages: warningState }),
        limit
      )
    },
    clear() {
      prepared.clear()
      warningState.clear()
    }
  }
}
