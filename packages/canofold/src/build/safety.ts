import type { CanofoldConfig } from '../config/types'
import { documentationVersions } from '../config/versions'
import { basename, dirname, join } from 'node:path'
import { resolveBuildTemporaryRoot } from './cache'
import { assertDisjointPaths, assertProjectPath, resolveOutputRoot, resolveProjectPath } from '../utils/paths'

export function outputBackupRoot(outputRoot: string) {
  return join(dirname(outputRoot), `.${basename(outputRoot)}.backup`)
}

export async function resolveSafeOutputRoot(cwd: string, config: CanofoldConfig, cacheRoot: string) {
  const outputRoot = resolveOutputRoot(cwd, config.outputDir)
  await assertProjectPath(cwd, outputRoot, 'outputDir')
  const workPaths = [
    [cacheRoot, 'build cache'],
    [resolveBuildTemporaryRoot(cwd), 'temporary build files'],
    [outputBackupRoot(outputRoot), 'interrupted build backup']
  ] as const
  for (const [path, field] of workPaths) {
    await assertProjectPath(cwd, path, field)
    await assertDisjointPaths(outputRoot, path, field)
  }
  const inputs = [
    ...documentationVersions(config).map(
      (version) => [version.docsDir, `versions[${version.id}].docsDir`] as const
    ),
    ...config.styles.map((style, index) => [style, `styles[${index}]`] as const),
    ...config.sources.map((source) => [source.root, `sources[${source.id}].root`] as const)
  ]
  for (const [path, field] of inputs) {
    const source = resolveProjectPath(cwd, path, field)
    await assertProjectPath(cwd, source, field)
    await assertDisjointPaths(outputRoot, source, field)
    for (const [workPath, workField] of workPaths) {
      await assertDisjointPaths(workPath, source, field, workField)
    }
  }
  return outputRoot
}
