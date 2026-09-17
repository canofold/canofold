import type { CanofoldConfig } from '../config/types'
import type { ContentGraph } from '../content/types'
import { resolveOutputRoot } from '../utils/paths'
import type { CanofoldDemoManifest } from './types'

export async function prepareDemoManifest({
  cwd,
  config,
  graph,
  mode
}: {
  cwd: string
  config: CanofoldConfig
  graph: ContentGraph
  mode: 'analyze' | 'build' | 'dev'
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
  return engine.prepare({
    cwd,
    outputRoot: resolveOutputRoot(cwd, config.outputDir),
    basePath: config.basePath,
    mode,
    setup: config.demos.setup,
    demos
  })
}
