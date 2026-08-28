import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile, type FileHandle } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { docfuseVersion } from '../version'
import { resolveProjectPath } from '../utils/paths'
import { BUILD_MANIFEST_SCHEMA_VERSION, type BuildManifest } from './types'

const STALE_LOCK_MS = 10 * 60 * 1000
const LOCK_REFRESH_MS = Math.floor(STALE_LOCK_MS / 3)

interface BuildLockRecord {
  ownerId?: unknown
  pid?: unknown
  hostname?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

interface BuildLock {
  handle: FileHandle
  path: string
  ownerId: string
  createdAt: number
}

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
  return resolveProjectPath(cwd, '.docfuse/cache', 'build cache')
}

export function resolveBuildTemporaryRoot(cwd: string) {
  return resolveProjectPath(cwd, '.docfuse/tmp', 'temporary build files')
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
    manifest.docfuseVersion === docfuseVersion &&
    typeof manifest.buildFingerprint === 'string' &&
    typeof manifest.sharedFingerprint === 'string' &&
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
  await mkdir(cacheRoot, { recursive: true })
  const target = manifestPath(cacheRoot)
  const temporary = join(cacheRoot, `.build-manifest.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
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

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function lockIsStale(lock: BuildLockRecord, modifiedAt: number, now = Date.now()) {
  if (
    lock.hostname === hostname() &&
    typeof lock.pid === 'number' &&
    Number.isSafeInteger(lock.pid) &&
    lock.pid > 0
  ) {
    if (!processIsAlive(lock.pid)) return true
  }
  const recordedTimestamp =
    typeof lock.updatedAt === 'number'
      ? lock.updatedAt
      : typeof lock.createdAt === 'number'
        ? lock.createdAt
        : undefined
  const timestamp = recordedTimestamp === undefined ? modifiedAt : Math.max(recordedTimestamp, modifiedAt)
  return (
    timestamp === undefined ||
    !Number.isFinite(timestamp) ||
    timestamp > now + STALE_LOCK_MS ||
    now - timestamp > STALE_LOCK_MS
  )
}

function lockContents(ownerId: string, createdAt: number) {
  return JSON.stringify({ ownerId, pid: process.pid, hostname: hostname(), createdAt })
}

async function readBuildLock(path: string): Promise<BuildLockRecord | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as BuildLockRecord
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function createBuildLock(path: string): Promise<BuildLock> {
  const handle = await open(path, 'wx')
  const ownerId = randomUUID()
  const createdAt = Date.now()
  try {
    await handle.writeFile(lockContents(ownerId, createdAt))
    return { handle, path, ownerId, createdAt }
  } catch (error) {
    await handle.close()
    await rm(path, { force: true })
    throw error
  }
}

async function releaseBuildLock(lock: BuildLock) {
  const current = await readBuildLock(lock.path)
  if (current?.ownerId === lock.ownerId) await rm(lock.path, { force: true })
}

async function removeStaleLock(path: string) {
  let contents: string
  let modifiedAt: number
  try {
    const [source, metadata] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    contents = source
    modifiedAt = metadata.mtimeMs
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }

  let stale: boolean
  try {
    stale = lockIsStale(JSON.parse(contents) as BuildLockRecord, modifiedAt)
  } catch {
    stale = Date.now() - modifiedAt > STALE_LOCK_MS
  }
  if (!stale) return false

  // Re-read immediately before unlinking so a contender never removes a lock
  // whose owner record changed while staleness was being checked.
  try {
    const [currentContents, currentMetadata] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    if (currentContents !== contents || currentMetadata.mtimeMs !== modifiedAt) return false
    await rm(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
}

async function acquireBuildLock(path: string) {
  try {
    return await createBuildLock(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (!(await removeStaleLock(path))) {
      throw new Error('Another Docfuse build is already running for this project')
    }
    try {
      return await createBuildLock(path)
    } catch (retryError) {
      if ((retryError as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('Another Docfuse build is already running for this project')
      }
      throw retryError
    }
  }
}

async function openBuildLock(cacheRoot: string): Promise<BuildLock> {
  const lockRoot = dirname(cacheRoot)
  await mkdir(lockRoot, { recursive: true })
  const path = join(lockRoot, 'build.lock')
  const acquisitionLock = await acquireBuildLock(`${path}.reclaim`)

  try {
    try {
      return await createBuildLock(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!(await removeStaleLock(path))) {
        throw new Error('Another Docfuse build is already running for this project')
      }
      return await createBuildLock(path)
    }
  } finally {
    await acquisitionLock.handle.close()
    await releaseBuildLock(acquisitionLock)
  }
}

async function refreshBuildLock(lock: BuildLock) {
  const current = await readBuildLock(lock.path)
  if (current?.ownerId !== lock.ownerId) return false
  const now = new Date()
  await lock.handle.utimes(now, now)
  return true
}

export type AssertBuildLockOwned = () => Promise<void>

async function assertBuildLockOwned(lock: BuildLock) {
  const current = await readBuildLock(lock.path)
  if (current?.ownerId !== lock.ownerId) {
    throw new Error('Docfuse build lock ownership was lost during the build')
  }
}

export async function withBuildLock<T>(
  cacheRoot: string,
  build: (assertOwned: AssertBuildLockOwned) => Promise<T>
): Promise<T> {
  const lock = await openBuildLock(cacheRoot)
  let refreshError: unknown
  const refreshTimer = setInterval(() => {
    void refreshBuildLock(lock)
      .then((owned) => {
        if (!owned) refreshError = new Error('Docfuse build lock ownership was lost during the build')
      })
      .catch((error: unknown) => {
        refreshError = error
      })
  }, LOCK_REFRESH_MS)
  refreshTimer.unref()
  try {
    const assertOwned = () => assertBuildLockOwned(lock)
    const result = await build(assertOwned)
    if (refreshError) throw refreshError
    await assertOwned()
    return result
  } finally {
    clearInterval(refreshTimer)
    await lock.handle.close()
    await releaseBuildLock(lock)
  }
}
