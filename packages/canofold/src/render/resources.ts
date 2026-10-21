import { createMarkdownRenderer, type MarkdownAssets, type MarkdownRenderer } from '@canofold/markdown/server'
import type { CanofoldConfig } from '../config/types'
import { isMdxPath } from '../content/fileKinds'
import type { ContentGraph, DocPage } from '../content/types'
import { assertVersionLocalDependencies } from '../content/versionBoundary'
import { analyzeDocument } from '../markdown/analyze'
import { prepareMdxSource } from '../markdown/importBoundary'
import { mapConcurrent } from '../utils/concurrency'
import { analyzeLocalComponentImports, mergeMarkdownAssets } from './localComponents'

export type PageResources = Map<DocPage, { assets: MarkdownAssets; dependencyPaths: string[] }>

/** Build-local render inputs, deliberately separate from the content graph.
 * Reuse compiler analysis; never execute an author's MDX modules here. */
export async function preparePageResources(
  cwd: string,
  config: CanofoldConfig,
  graph: ContentGraph,
  renderer: MarkdownRenderer = createMarkdownRenderer()
): Promise<PageResources> {
  const entries = await mapConcurrent(graph.pages, 8, async (page) => {
    const mode = isMdxPath(page.relativePath) ? 'mdx' : 'markdown'
    const analysis = await analyzeDocument(
      renderer,
      config,
      page.body,
      mode,
      page.locale,
      page.demos.length > 0
    )
    const local =
      mode === 'mdx'
        ? await analyzeLocalComponentImports(
            prepareMdxSource(page.body).imports,
            page.sourcePath,
            cwd,
            config.markdown.plugins
          )
        : undefined
    if (local && page.version !== graph.currentVersion)
      await assertVersionLocalDependencies(cwd, page, local.paths)
    return [
      page,
      {
        assets: local ? mergeMarkdownAssets(analysis.assets, local.assets) : analysis.assets,
        dependencyPaths: local?.paths ?? []
      }
    ] as const
  })
  return new Map(entries)
}
