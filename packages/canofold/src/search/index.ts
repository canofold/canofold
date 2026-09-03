import type { CanofoldConfig } from '../config/types'
import type { ContentGraph } from '../content/types'
import { publicPathFor } from '../seo/urls'
import { resolveOutputPath, resolveOutputRoot } from '../utils/paths'
import { assertJsonValue } from '../utils/json'
import { compactSearchProvider } from './compact'
import type { SearchProvider } from './types'

const searchProviderNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function defineSearchProvider<T extends SearchProvider>(provider: T): T {
  if (!searchProviderNamePattern.test(provider.id)) {
    throw new Error('Search provider id must be a lowercase kebab-case name')
  }
  if (provider.client !== 'compact' && provider.client !== 'pagefind') {
    throw new Error(`Search provider "${provider.id}" client must be "compact" or "pagefind"`)
  }
  if (provider.cacheKey !== undefined) {
    assertJsonValue(provider.cacheKey, `Search provider "${provider.id}" cacheKey`)
  }
  if (typeof provider.write !== 'function') {
    throw new Error(`Search provider "${provider.id}" must define write(context)`)
  }
  return Object.freeze(provider)
}

export function searchProviderClient(provider: CanofoldConfig['search']['provider']) {
  return typeof provider === 'string' ? 'compact' : provider.client
}

export function searchProviderFor(provider: CanofoldConfig['search']['provider'] | string): SearchProvider {
  if (typeof provider !== 'string') return provider
  if (provider === 'compact') return compactSearchProvider
  throw new Error(
    'The Pagefind search provider moved to @canofold/plugins. Import pagefind() and set search.provider to pagefind().'
  )
}

export async function writeSearchIndexes(cwd: string, config: CanofoldConfig, graph: ContentGraph) {
  if (!config.search.enabled) return
  const outputRoot = resolveOutputRoot(cwd, config.outputDir)
  await searchProviderFor(config.search.provider).write({
    cwd,
    config,
    graph,
    outputRoot,
    publicPathFor: (routePath) => publicPathFor(config, routePath),
    resolveOutputPath: (outputPath, label) => resolveOutputPath(outputRoot, outputPath, label)
  })
}

export type { SearchProvider, SearchProviderContext } from './types'
