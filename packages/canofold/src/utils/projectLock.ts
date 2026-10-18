import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rm, stat, type FileHandle } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'

const STALE_LOCK_MS = 10 * 60 * 1000
const LOCK_REFRESH_MS = Math.floor(STALE_LOCK_MS / 3)

interface LockRecord {
  ownerId?: unknown
  pid?: unknown
  hostname?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

interface FileLock {
  handle: FileHandle
  path: string
  ownerId: string
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function lockIsStale(lock: LockRecord, modifiedAt: number, now = Date.now()) {
  if (
    lock.hostname === hostname() &&
    typeof lock.pid === 'number' &&
    Number.isSafeInteger(lock.pid) &&
    lock.pid > 0 &&
    !processIsAlive(lock.pid)
  )
    return true
  const recordedTimestamp =
    typeof lock.updatedAt === 'number'
      ? lock.updatedAt
      : typeof lock.createdAt === 'number'
        ? lock.createdAt
        : undefined
  const timestamp = recordedTimestamp === undefined ? modifiedAt : Math.max(recordedTimestamp, modifiedAt)
  return !Number.isFinite(timestamp) || timestamp > now + STALE_LOCK_MS || now - timestamp > STALE_LOCK_MS
}

async function readLock(path: string): Promise<LockRecord | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as LockRecord
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function createLock(path: string): Promise<FileLock> {
  const handle = await open(path, 'wx')
  const ownerId = randomUUID()
  try {
    await handle.writeFile(
      JSON.stringify({ ownerId, pid: process.pid, hostname: hostname(), createdAt: Date.now() })
    )
    return { handle, path, ownerId }
  } catch (error) {
    await handle.close()
    await rm(path, { force: true })
    throw error
  }
}

async function releaseLock(lock: FileLock) {
  const current = await readLock(lock.path)
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
    stale = lockIsStale(JSON.parse(contents) as LockRecord, modifiedAt)
  } catch {
    stale = Date.now() - modifiedAt > STALE_LOCK_MS
  }
  if (!stale) return false
  // Keep the owner record and its heartbeat unchanged across reclamation.
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

async function acquireLock(path: string, busyMessage: string) {
  try {
    return await createLock(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (!(await removeStaleLock(path))) throw new Error(busyMessage)
    try {
      return await createLock(path)
    } catch (retryError) {
      if ((retryError as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(busyMessage)
      throw retryError
    }
  }
}

async function openLock(path: string, busyMessage: string) {
  await mkdir(dirname(path), { recursive: true })
  const acquisitionLock = await acquireLock(`${path}.reclaim`, busyMessage)
  try {
    try {
      return await createLock(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!(await removeStaleLock(path))) throw new Error(busyMessage)
      return await createLock(path)
    }
  } finally {
    await acquisitionLock.handle.close()
    await releaseLock(acquisitionLock)
  }
}

/** Own a project activity until release; dead owners can be reclaimed after a crash. */
export async function acquireProjectLock(lockRoot: string, activity: 'build' | 'dev') {
  const label = `Canofold ${activity}`
  const busyMessage = `Another ${label} is already running for this project${
    activity === 'dev' ? ` (${dirname(lockRoot)}). Stop the existing dev server before starting another.` : ''
  }`
  const lostMessage = `${label} lock ownership was lost during the ${activity === 'dev' ? 'dev session' : 'build'}`
  const lock = await openLock(join(lockRoot, `${activity}.lock`), busyMessage)
  let refreshError: unknown
  const refreshTimer = setInterval(() => {
    void (async () => {
      if ((await readLock(lock.path))?.ownerId !== lock.ownerId) throw new Error(lostMessage)
      const now = new Date()
      await lock.handle.utimes(now, now)
    })().catch((error: unknown) => {
      refreshError = error
    })
  }, LOCK_REFRESH_MS)
  refreshTimer.unref()
  let releasing: Promise<void> | undefined
  return {
    async assertOwned() {
      if (refreshError) throw refreshError
      if ((await readLock(lock.path))?.ownerId !== lock.ownerId) throw new Error(lostMessage)
    },
    release() {
      return (releasing ??= (async () => {
        clearInterval(refreshTimer)
        await lock.handle.close()
        await releaseLock(lock)
      })())
    }
  }
}
