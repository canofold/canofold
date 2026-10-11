import type { Server as HttpServer } from 'node:http'
import type { CanofoldConfig } from '../config/types'
import type { ContentGraph } from '../content/types'
import { assertVersionLocalDependencies } from '../content/versionBoundary'
import { resolveOutputRoot } from '../utils/paths'
import type { CanofoldDemoManifest } from './types'

export async function prepareDemoManifest({
  cwd,
  config,
  graph,
  mode,
  server
}: {
  cwd: string
  config: CanofoldConfig
  graph: ContentGraph
  mode: 'analyze' | 'build' | 'dev'
  server?: HttpServer
}): Promise<CanofoldDemoManifest | undefined> {
  const demos = graph.pages.flatMap((page) => page.demos)
  if (demos.length === 0) {
    if (config.demos.setup && !config.demos.engine) {
      throw new Error('demos.setup requires demos.engine')
    }
    return undefined
  }
  const engine = config.demos.engine
  if (!engine) {
    throw new Error(
      `Found ${demos.length} demo directive${demos.length === 1 ? '' : 's'}, but no demos.engine is configured`
    )
  }
  const manifest = await engine.prepare({
    cwd,
    outputRoot: resolveOutputRoot(cwd, config.outputDir),
    basePath: config.basePath,
    mode,
    server,
    setup: config.demos.setup,
    demos
  })
  for (const page of graph.pages) {
    if (page.version === graph.currentVersion || page.demos.length === 0) continue
    if (config.demos.setup) {
      throw new Error(`Historical demos cannot use global demos.setup: ${page.sourceRelativePath}`)
    }
    for (const reference of page.demos) {
      const prepared = manifest.demos[reference.id]
      if (!prepared?.dependencyPaths) {
        throw new Error(`Demo engine must report historical demo dependencies: ${page.sourceRelativePath}`)
      }
      await assertVersionLocalDependencies(cwd, page, [prepared.modulePath, ...prepared.dependencyPaths])
    }
  }
  return manifest
}
