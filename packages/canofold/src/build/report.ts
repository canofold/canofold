import type { CanofoldConfig } from '../config/types'
import type { ContentGraph } from '../content/types'
import { planBuiltInOutputs } from '../output/plan'
import type { BuildManifest, BuildMode } from './types'

export interface OutputReport {
  id: string
  enabled: boolean
  plannedPaths: string[]
  paths: string[]
  files: number
  bytes: number
  missingPaths: string[]
}

export interface BuildReport {
  schemaVersion: 1
  pages: number
  locales: string[]
  versions: string[]
  mode: BuildMode
  cacheHit: boolean
  reason: string
  changedPages: string[]
  durationMs: number
  outputs: OutputReport[]
  removedPaths: string[]
  removalBaseline: boolean
}

export function createBuildReport({
  config,
  graph,
  manifest,
  previous,
  mode,
  reason,
  changedPages,
  durationMs
}: {
  config: CanofoldConfig
  graph: ContentGraph
  manifest: BuildManifest
  previous?: BuildManifest
  mode: BuildMode
  reason: string
  changedPages: string[]
  durationMs: number
}): BuildReport {
  const entries = planBuiltInOutputs(config, graph)
  const allPaths = Object.keys(manifest.outputs)
  const ownerFor = (path: string) =>
    entries.find((entry) => entry.paths.includes(path))?.id ??
    entries.find((entry) => entry.id !== 'site' && entry.prefixes.some((prefix) => path.startsWith(prefix)))
      ?.id ??
    entries.find((entry) => entry.prefixes.some((prefix) => path.startsWith(prefix)))?.id
  const outputs = entries.map((entry) => {
    const paths = allPaths.filter((path) => ownerFor(path) === entry.id)
    return {
      id: entry.id,
      enabled: entry.enabled,
      plannedPaths: entry.paths,
      paths,
      files: paths.length,
      bytes: paths.reduce((sum, path) => sum + manifest.outputs[path]!.size, 0),
      missingPaths: entry.enabled ? entry.paths.filter((path) => !manifest.outputs[path]) : []
    }
  })
  return {
    schemaVersion: 1,
    pages: graph.pages.length,
    locales: graph.locales,
    versions: graph.versions.map((version) => version.id),
    mode,
    cacheHit: mode === 'cached',
    reason,
    changedPages,
    durationMs: Math.round(durationMs),
    outputs,
    removedPaths: previous ? Object.keys(previous.outputs).filter((path) => !manifest.outputs[path]) : [],
    removalBaseline: Boolean(previous)
  }
}
