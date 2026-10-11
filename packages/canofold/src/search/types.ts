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

/** Whole-site indexer. Markdown plugins handle syntax; extensions handle other site outputs. */
export interface SearchProvider {
  readonly id: string
  /** Browser query protocol used by the built-in search modal. */
  readonly client: 'compact' | 'pagefind'
  readonly version?: string
  /** JSON cache identity; bump `version` when implementation changes. */
  readonly cacheKey?: CanofoldJsonValue
  write(context: SearchProviderContext): Promise<void>
}
