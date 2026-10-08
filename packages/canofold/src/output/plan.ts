import { posix } from 'node:path'
import type { CanofoldConfig } from '../config/types'
import { resolveRedirects } from '../content/redirects'
import { routeOutputPathFor } from '../content/routes'
import type { ContentGraph } from '../content/types'
import { searchProviderClient } from '../search'
import { portablePathKey } from '../utils/paths'
import { BUILT_IN_BRAND_OUTPUT_PATHS } from '../brand'

export interface OutputPlanEntry {
  id: string
  enabled: boolean
  paths: string[]
  /** Dynamically named files produced by this output (not collision reservations). */
  prefixes: string[]
}

function output(id: string, enabled: boolean, paths: string[], prefixes: string[] = []): OutputPlanEntry {
  return { id, enabled, paths, prefixes }
}
export const RESERVED_OUTPUT_DIRECTORIES = [
  'assets/canofold-markdown',
  'assets/canofold-demos',
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

export function planBuiltInOutputs(config: CanofoldConfig, graph: ContentGraph): OutputPlanEntry[] {
  const redirects = resolveRedirects(config, graph)
  const searchPaths = ['assets/canofold-search.js']
  if (searchProviderClient(config.search.provider) === 'compact') {
    for (const version of graph.versions) {
      for (const locale of graph.locales) {
        searchPaths.push(
          version.id === graph.currentVersion
            ? `search/${locale}.json`
            : `search/${version.id}/${locale}.json`
        )
      }
    }
  }
  return [
    output(
      'site',
      true,
      [
        '404.html',
        'assets/canofold.css',
        'assets/canofold-shell.js',
        ...BUILT_IN_BRAND_OUTPUT_PATHS,
        ...graph.pages.map((page) => page.outputPath)
      ],
      ['assets/']
    ),
    output(
      'markdownMirror',
      config.markdownMirror,
      graph.pages.map((page) => page.markdownOutputPath)
    ),
    output('search', config.search.enabled, searchPaths, ['search/', 'pagefind/']),
    output('aiPageIndex', config.ai.pageIndex, ['ai/pages.json']),
    output('aiFullContent', config.ai.fullContent, ['ai/manifest.json'], ['ai/content/']),
    output('aiMarkdownIndex', config.ai.markdownIndex, ['ai/index.md']),
    output('aiSummaries', config.ai.pageSummaries, ['ai/summaries.json']),
    output('aiCodeExamples', config.ai.codeExamples, ['ai/code-examples.json']),
    output('llmsTxt', config.ai.llmsTxt, ['llms.txt']),
    output('llmsFullTxt', config.ai.llmsFullTxt, ['llms-full.txt']),
    output('seo', true, ['robots.txt', ...(config.siteUrl ? ['sitemap.xml'] : [])]),
    output(
      'redirects',
      redirects.length > 0,
      redirects.length ? ['redirects.json', ...redirects.map(([source]) => routeOutputPathFor(source))] : []
    )
  ]
}

function plannedOutputPaths(config: CanofoldConfig, graph: ContentGraph) {
  const entries = planBuiltInOutputs(config, graph)
  const paths = [
    '.benchmark.json',
    ...entries.filter((entry) => entry.enabled).flatMap((entry) => entry.paths)
  ]
  return { paths, redirects: resolveRedirects(config, graph) }
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
      .filter((path) => path !== '.benchmark.json')
      .map((path) => `/${path.split('/').map(encodeURIComponent).join('/')}`),
    ...redirects.map(([source]) => source)
  ])
}
