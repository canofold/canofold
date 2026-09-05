import type { CanofoldConfig } from '../config/types'
import type { CanofoldJsonValue } from '../config/types'
import type { ContentGraph } from '../content/types'

export interface SearchProviderContext {
  cwd: string
  config: CanofoldConfig
  graph: ContentGraph
  outputRoot: string
  publicPathFor(routePath: string): string
  resolveOutputPath(outputPath: string, label: string): string
}

/**
 * Whole-site index lifecycle. Unlike a Markdown plugin, a provider consumes the
 * completed ContentGraph and output root; unlike an Extension, it owns only the
 * configured search implementation's artifacts.
 */
export interface SearchProvider {
  readonly id: string
  /** Browser-side query protocol consumed by Canofold's built-in search modal. */
  readonly client: 'compact' | 'pagefind'
  readonly version?: string
  /** Resolved JSON options used for build invalidation. Bump `version` when implementation changes. */
  readonly cacheKey?: CanofoldJsonValue
  write(context: SearchProviderContext): Promise<void>
}
