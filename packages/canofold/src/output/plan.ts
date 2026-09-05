import { posix } from 'node:path'
import type { CanofoldConfig } from '../config/types'
import { resolveRedirects } from '../content/redirects'
import { routeOutputPathFor } from '../content/routes'
import type { ContentGraph } from '../content/types'
import { searchProviderClient } from '../search'
import { portablePathKey } from '../utils/paths'

const INTERNAL_OUTPUT_PATHS = new Set(['.benchmark.json'])
export const RESERVED_OUTPUT_DIRECTORIES = [
  'assets/canofold-markdown',
  'assets/canofold-playground',
  'assets/canofold-plugins',
  'assets/fonts',
  'pagefind',
  'ai/content',
  'extensions'
] as const

function assertGeneratedOutputPlan(paths: string[]) {
  const seen = new Map<string, string>()
  for (const path of paths) {
    const key = portablePathKey(path)
    const reservedDirectory = RESERVED_OUTPUT_DIRECTORIES.find(
      (directory) => key === directory || key.startsWith(`${directory}/`)
    )
    if (reservedDirectory) {
      throw new Error(`Generated output uses reserved directory "${reservedDirectory}": "${path}"`)
    }
    const previous = seen.get(key)
    if (previous) {
      throw new Error(`Generated outputs overlap: "${previous}" and "${path}"`)
    }
    seen.set(key, path)
  }

  for (const [key, path] of seen) {
    let parent = posix.dirname(key)
    while (parent !== '.') {
      const parentPath = seen.get(parent)
      if (parentPath) {
        throw new Error(`Generated outputs overlap: "${parentPath}" and "${path}"`)
      }
      parent = posix.dirname(parent)
    }
  }
}

function plannedOutputPaths(config: CanofoldConfig, graph: ContentGraph) {
  const paths = [
    '.benchmark.json',
    '404.html',
    'assets/canofold.css',
    'robots.txt',
    'ai/pages.json',
    'ai/manifest.json',
    ...graph.pages.flatMap((page) => [page.outputPath, page.markdownOutputPath])
  ]
  if (config.search.enabled) {
    paths.push('assets/canofold-search.js')
    if (searchProviderClient(config.search.provider) === 'compact') {
      for (const version of graph.versions) {
        for (const locale of graph.locales) {
          paths.push(
            version.id === graph.currentVersion
              ? `search/${locale}.json`
              : `search/${version.id}/${locale}.json`
          )
        }
      }
    }
  }
  if (config.siteUrl) paths.push('sitemap.xml')
  if (config.ai.pageSummaries) paths.push('ai/summaries.json')
  if (config.ai.codeExamples) paths.push('ai/code-examples.json')
  if (config.ai.markdownIndex) paths.push('ai/index.md')
  if (config.ai.llmsTxt) paths.push('llms.txt')
  if (config.ai.llmsFullTxt) paths.push('llms-full.txt')
  const redirects = resolveRedirects(config, graph)
  if (redirects.length) {
    paths.push('redirects.json')
    for (const [source] of redirects) paths.push(routeOutputPathFor(source))
  }
  return { paths, redirects }
}

export function generatedOutputPaths(config: CanofoldConfig, graph: ContentGraph) {
  const { paths } = plannedOutputPaths(config, graph)
  assertGeneratedOutputPlan(paths)
  return new Set(paths)
}

export function generatedPublicPaths(config: CanofoldConfig, graph: ContentGraph) {
  const { paths, redirects } = plannedOutputPaths(config, graph)
  assertGeneratedOutputPlan(paths)
  return new Set([
    ...paths
      .filter((path) => !INTERNAL_OUTPUT_PATHS.has(path))
      .map((path) => `/${path.split('/').map(encodeURIComponent).join('/')}`),
    ...redirects.map(([source]) => source)
  ])
}
