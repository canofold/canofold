import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { canofoldVersion } from '../version'
import { resolveProjectPath } from '../utils/paths'
import { BUILD_MANIFEST_SCHEMA_VERSION, type BuildManifest } from './types'
import { acquireProjectLock } from '../utils/projectLock'

function isSafeOutputPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}

export function resolveBuildCacheRoot(cwd: string) {
  return resolveProjectPath(cwd, '.canofold/cache', 'build cache')
}

export function resolveBuildTemporaryRoot(cwd: string) {
  return resolveProjectPath(cwd, '.canofold/tmp', 'temporary build files')
}

function manifestPath(cacheRoot: string) {
  return join(cacheRoot, 'build-manifest.json')
}

function isPageState(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const page = value as Record<string, unknown>
  return (
    typeof page.fingerprint === 'string' &&
    isSafeOutputPath(page.outputPath) &&
    isSafeOutputPath(page.markdownOutputPath) &&
    Array.isArray(page.assetOutputPaths) &&
    page.assetOutputPaths.every(isSafeOutputPath)
  )
}

function isOutputState(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const output = value as Record<string, unknown>
  return (
    typeof output.fingerprint === 'string' && Number.isSafeInteger(output.size) && Number(output.size) >= 0
  )
}

function isBuildManifest(value: unknown): value is BuildManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Record<string, unknown>
  return (
    manifest.schemaVersion === BUILD_MANIFEST_SCHEMA_VERSION &&
    manifest.canofoldVersion === canofoldVersion &&
    typeof manifest.buildFingerprint === 'string' &&
    typeof manifest.sharedFingerprint === 'string' &&
    Array.isArray(manifest.contentDependencyPaths) &&
    manifest.contentDependencyPaths.every((path) => typeof path === 'string' && path.length > 0) &&
    Boolean(manifest.pages) &&
    typeof manifest.pages === 'object' &&
    Object.values(manifest.pages as Record<string, unknown>).every(isPageState) &&
    Boolean(manifest.outputs) &&
    typeof manifest.outputs === 'object' &&
    Object.keys(manifest.outputs as Record<string, unknown>).length > 0 &&
    Object.keys(manifest.outputs as Record<string, unknown>).every(isSafeOutputPath) &&
    Object.values(manifest.outputs as Record<string, unknown>).every(isOutputState)
  )
}

export async function readBuildManifest(cacheRoot: string): Promise<BuildManifest | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(manifestPath(cacheRoot), 'utf8'))
    return isBuildManifest(parsed) ? parsed : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return undefined
    throw error
  }
}

export async function writeBuildManifest(cacheRoot: string, manifest: BuildManifest) {
  await writeBuildCacheJson(cacheRoot, 'build-manifest', manifest)
}

export async function writeBuildCacheJson(
  cacheRoot: string,
  name: 'build-manifest' | 'build-report',
  value: unknown
) {
  await mkdir(cacheRoot, { recursive: true })
  const target = join(cacheRoot, `${name}.json`)
  const temporary = join(cacheRoot, `.${name}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
      flush: true
    })
    try {
      await rename(temporary, target)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'EPERM') throw error
      await rm(target, { force: true })
      await rename(temporary, target)
    }
  } finally {
    await rm(temporary, { force: true })
  }
}

export type AssertBuildLockOwned = () => Promise<void>

export async function withBuildLock<T>(
  cacheRoot: string,
  build: (assertOwned: AssertBuildLockOwned) => Promise<T>
): Promise<T> {
  const lock = await acquireProjectLock(dirname(cacheRoot), 'build')
  try {
    const result = await build(lock.assertOwned)
    await lock.assertOwned()
    return result
  } finally {
    await lock.release()
  }
}
