import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { docfuseVersion } from '../version'
import { readBuildManifest, resolveBuildCacheRoot, withBuildLock, writeBuildManifest } from './cache'
import { BUILD_MANIFEST_SCHEMA_VERSION, type BuildManifest } from './types'

const delayedLockOpen = vi.hoisted(() => ({
  path: '',
  calls: 0,
  secondStarted: undefined as (() => void) | undefined,
  resume: () => {}
}))

const manifestWrites = vi.hoisted(() => ({ flushes: 0 }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      if (String(args[0]) === delayedLockOpen.path) {
        delayedLockOpen.calls += 1
        if (delayedLockOpen.calls === 2) {
          delayedLockOpen.secondStarted?.()
          await new Promise<void>((resolve) => {
            delayedLockOpen.resume = resolve
          })
        }
      }
      return actual.open(...args)
    },
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (String(args[0]).includes('.build-manifest.')) {
        const options = args[2]
        if (options && typeof options === 'object' && options.flush === true) {
          manifestWrites.flushes += 1
        }
      }
      return actual.writeFile(...args)
    }
  }
})

function manifest(): BuildManifest {
  return {
    schemaVersion: BUILD_MANIFEST_SCHEMA_VERSION,
    docfuseVersion,
    buildFingerprint: 'build',
    sharedFingerprint: 'shared',
    pages: {
      'docs/index.md': {
        fingerprint: 'page',
        outputPath: 'index.html',
        markdownOutputPath: 'raw/index.md',
        assetOutputPaths: []
      }
    },
    outputs: { 'index.html': { fingerprint: 'output', size: 1 } }
  }
}

describe('build cache', () => {
  beforeEach(() => {
    manifestWrites.flushes = 0
  })

  it('round-trips manifests and recovers from corrupt or unsafe cache entries', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-cache-'))
    const cacheRoot = resolveBuildCacheRoot(cwd)
    await writeBuildManifest(cacheRoot, manifest())
    expect(manifestWrites.flushes).toBe(1)
    await expect(readBuildManifest(cacheRoot)).resolves.toEqual(manifest())

    await writeFile(join(cacheRoot, 'build-manifest.json'), '{broken')
    await expect(readBuildManifest(cacheRoot)).resolves.toBeUndefined()

    const unsafe = manifest()
    unsafe.outputs = { '../outside.txt': { fingerprint: 'unsafe', size: 1 } }
    await writeFile(join(cacheRoot, 'build-manifest.json'), JSON.stringify(unsafe))
    await expect(readBuildManifest(cacheRoot)).resolves.toBeUndefined()
  })

  it('prevents overlapping builds and recovers an expired lock', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-lock-'))
    const cacheRoot = resolveBuildCacheRoot(cwd)
    let enter!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const active = withBuildLock(cacheRoot, async () => {
      enter()
      await blocked
    })
    await entered
    await expect(withBuildLock(cacheRoot, async () => {})).rejects.toThrow(
      'Another Docfuse build is already running'
    )
    release()
    await active

    await mkdir(cacheRoot, { recursive: true })
    await writeFile(
      join(dirname(cacheRoot), 'build.lock'),
      JSON.stringify({ pid: 999_999_999, hostname: hostname(), createdAt: Date.now() - 11 * 60 * 1000 })
    )
    await expect(withBuildLock(cacheRoot, async () => 'recovered')).resolves.toBe('recovered')
    await expect(readFile(join(dirname(cacheRoot), 'build.lock'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('recovers an expired lease even when its pid has been reused by a live process', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-live-lock-'))
    const cacheRoot = resolveBuildCacheRoot(cwd)
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(
      join(dirname(cacheRoot), 'build.lock'),
      JSON.stringify({
        ownerId: 'live-owner',
        pid: process.pid,
        hostname: hostname(),
        createdAt: Date.now() - 11 * 60 * 1000,
        updatedAt: Date.now() - 11 * 60 * 1000
      })
    )
    const expiredAt = new Date(Date.now() - 11 * 60 * 1000)
    await utimes(join(dirname(cacheRoot), 'build.lock'), expiredAt, expiredAt)

    await expect(withBuildLock(cacheRoot, async () => 'recovered')).resolves.toBe('recovered')
  })

  it('allows only one concurrent contender to reclaim an expired lock', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-lock-contenders-'))
    const cacheRoot = resolveBuildCacheRoot(cwd)
    const lockPath = join(dirname(cacheRoot), 'build.lock')
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(
      lockPath,
      JSON.stringify({
        ownerId: 'expired-owner',
        pid: 999_999_999,
        hostname: hostname(),
        createdAt: Date.now() - 11 * 60 * 1000
      })
    )
    const expiredAt = new Date(Date.now() - 11 * 60 * 1000)
    await utimes(lockPath, expiredAt, expiredAt)

    let entered = 0
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const contenders = Array.from({ length: 16 }, async () => {
      try {
        await withBuildLock(cacheRoot, async () => {
          entered += 1
          await blocked
        })
        return true
      } catch {
        return false
      }
    })

    await vi.waitFor(() => expect(entered).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(entered).toBe(1)
    release()
    expect((await Promise.all(contenders)).filter(Boolean)).toHaveLength(1)
    await expect(readFile(`${lockPath}.reclaim`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('holds the reclaim lock until the replacement build lock is fully created', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-lock-reclaim-window-'))
    const cacheRoot = resolveBuildCacheRoot(cwd)
    const lockPath = join(dirname(cacheRoot), 'build.lock')
    const reclaimPath = `${lockPath}.reclaim`
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(
      lockPath,
      JSON.stringify({
        ownerId: 'expired-owner',
        pid: 999_999_999,
        hostname: hostname(),
        createdAt: Date.now() - 11 * 60 * 1000
      })
    )
    const expiredAt = new Date(Date.now() - 11 * 60 * 1000)
    await utimes(lockPath, expiredAt, expiredAt)

    let secondStarted!: () => void
    const started = new Promise<void>((resolve) => {
      secondStarted = resolve
    })
    delayedLockOpen.path = lockPath
    delayedLockOpen.calls = 0
    delayedLockOpen.secondStarted = secondStarted
    delayedLockOpen.resume = () => {}

    const build = withBuildLock(cacheRoot, async () => 'recovered')
    try {
      await started
      await new Promise((resolve) => setTimeout(resolve, 20))
      await expect(readFile(reclaimPath, 'utf8')).resolves.toContain('ownerId')
    } finally {
      delayedLockOpen.resume()
      delayedLockOpen.path = ''
      delayedLockOpen.secondStarted = undefined
    }

    await expect(build).resolves.toBe('recovered')
  })

  it('recovers an orphaned reclaim lock left by an interrupted build', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-orphaned-reclaim-lock-'))
    const cacheRoot = resolveBuildCacheRoot(cwd)
    const reclaimPath = join(dirname(cacheRoot), 'build.lock.reclaim')
    await mkdir(dirname(cacheRoot), { recursive: true })
    await writeFile(
      reclaimPath,
      JSON.stringify({
        ownerId: 'orphaned-owner',
        pid: 999_999_999,
        hostname: hostname(),
        createdAt: Date.now() - 11 * 60 * 1000
      })
    )
    const expiredAt = new Date(Date.now() - 11 * 60 * 1000)
    await utimes(reclaimPath, expiredAt, expiredAt)

    await expect(withBuildLock(cacheRoot, async () => 'recovered')).resolves.toBe('recovered')
    await expect(readFile(reclaimPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not steal a newly created lock before its owner record is readable', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-new-lock-'))
    const cacheRoot = resolveBuildCacheRoot(cwd)
    const lockPath = join(dirname(cacheRoot), 'build.lock')
    await mkdir(cacheRoot, { recursive: true })
    await writeFile(lockPath, '')

    await expect(withBuildLock(cacheRoot, async () => {})).rejects.toThrow(
      'Another Docfuse build is already running'
    )
    await expect(readFile(lockPath, 'utf8')).resolves.toBe('')
  })

  it('fails a build whose lock was replaced and does not remove the new owner', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-replaced-lock-'))
    const cacheRoot = resolveBuildCacheRoot(cwd)
    const lockPath = join(dirname(cacheRoot), 'build.lock')

    await expect(
      withBuildLock(cacheRoot, async (assertOwned) => {
        await writeFile(
          lockPath,
          JSON.stringify({
            ownerId: 'replacement-owner',
            pid: process.pid,
            hostname: hostname(),
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
        )
        await assertOwned()
      })
    ).rejects.toThrow('ownership was lost')

    expect(JSON.parse(await readFile(lockPath, 'utf8'))).toMatchObject({
      ownerId: 'replacement-owner'
    })
  })
})
