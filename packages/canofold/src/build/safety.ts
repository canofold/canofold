import type { CanofoldConfig } from '../config/types'
import { assertDisjointPaths, assertProjectPath, resolveOutputRoot, resolveProjectPath } from '../utils/paths'

export async function resolveSafeOutputRoot(cwd: string, config: CanofoldConfig, cacheRoot: string) {
  const outputRoot = resolveOutputRoot(cwd, config.outputDir)
  await assertProjectPath(cwd, outputRoot, 'outputDir')
  await assertProjectPath(cwd, cacheRoot, 'build cache')
  await assertDisjointPaths(outputRoot, cacheRoot, 'build cache')
  for (const version of config.versions.items) {
    const docsRoot = resolveProjectPath(cwd, version.docsDir, `versions.items[${version.id}].docsDir`)
    await assertProjectPath(cwd, docsRoot, `versions.items[${version.id}].docsDir`)
    await assertDisjointPaths(outputRoot, docsRoot, `versions.items[${version.id}].docsDir`)
    await assertDisjointPaths(cacheRoot, docsRoot, `versions.items[${version.id}].docsDir`, 'build cache')
  }
  for (const [index, style] of config.styles.entries()) {
    const stylePath = resolveProjectPath(cwd, style, `styles[${index}]`)
    await assertProjectPath(cwd, stylePath, `styles[${index}]`)
    await assertDisjointPaths(outputRoot, stylePath, `styles[${index}]`)
    await assertDisjointPaths(cacheRoot, stylePath, `styles[${index}]`, 'build cache')
  }
  return outputRoot
}
