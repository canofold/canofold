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
  additionalOutputs: { paths: string[]; files: number; bytes: number }
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
  const enabledEntries = entries.filter((entry) => entry.enabled)
  const allPaths = Object.keys(manifest.outputs)
  const exactOwners = new Map(
    enabledEntries.flatMap((entry) => entry.paths.map((path) => [path, entry.id] as const))
  )
  const ownerFor = (path: string) =>
    exactOwners.get(path) ??
    enabledEntries.find(
      (entry) => entry.id !== 'site' && entry.prefixes.some((prefix) => path.startsWith(prefix))
    )?.id ??
    enabledEntries.find((entry) => entry.prefixes.some((prefix) => path.startsWith(prefix)))?.id
  const pathsByOwner = new Map(entries.map((entry) => [entry.id, [] as string[]]))
  const additionalPaths: string[] = []
  for (const path of allPaths) {
    const owner = ownerFor(path)
    if (owner) pathsByOwner.get(owner)!.push(path)
    else additionalPaths.push(path)
  }
  const bytesFor = (paths: string[]) => paths.reduce((sum, path) => sum + manifest.outputs[path]!.size, 0)
  const outputs = entries.map((entry) => {
    const paths = pathsByOwner.get(entry.id)!
    return {
      id: entry.id,
      enabled: entry.enabled,
      plannedPaths: entry.paths,
      paths,
      files: paths.length,
      bytes: bytesFor(paths),
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
    additionalOutputs: {
      paths: additionalPaths,
      files: additionalPaths.length,
      bytes: bytesFor(additionalPaths)
    },
    removedPaths: previous ? Object.keys(previous.outputs).filter((path) => !manifest.outputs[path]) : [],
    removalBaseline: Boolean(previous)
  }
}
