import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPackageBuildScheduler,
  createPollingWatcher,
  readDevState,
  removeOwnDevState,
  startIncrementalBuildState,
  startPackageBuildWatcher,
  writeDevState
} from './packageBuildWatcher.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('createPackageBuildScheduler', () => {
  it('never overlaps builds and coalesces changes during a build into one pending generation', async () => {
    let releaseFirstBuild!: () => void
    const firstBuild = new Promise<void>((resolve) => {
      releaseFirstBuild = resolve
    })
    let buildCount = 0
    let activeBuilds = 0
    let maximumActiveBuilds = 0
    const states: Array<{ status: string; generation: number }> = []
    const scheduler = createPackageBuildScheduler({
      build: async () => {
        buildCount += 1
        activeBuilds += 1
        maximumActiveBuilds = Math.max(maximumActiveBuilds, activeBuilds)
        if (buildCount === 1) await firstBuild
        activeBuilds -= 1
      },
      publishState: async (state) => states.push(state),
      debounceMs: 0
    })

    const initialBuild = scheduler.start()
    await vi.waitFor(() => expect(buildCount).toBe(1))
    scheduler.schedule()
    scheduler.schedule()
    releaseFirstBuild()
    await initialBuild
    await vi.waitFor(() => expect(buildCount).toBe(2))
    await scheduler.close()

    expect(maximumActiveBuilds).toBe(1)
    expect(states).toEqual([
      { status: 'building', generation: 1 },
      { status: 'ready', generation: 1 },
      { status: 'building', generation: 2 },
      { status: 'ready', generation: 2 }
    ])
  })

  it('publishes errors without terminating future builds', async () => {
    const onError = vi.fn()
    let shouldFail = true
    const states: Array<{ status: string; generation: number }> = []
    const scheduler = createPackageBuildScheduler({
      build: async () => {
        if (shouldFail) throw new Error('broken source')
      },
      publishState: async (state) => states.push(state),
      onError,
      debounceMs: 0
    })

    await scheduler.start()
    shouldFail = false
    scheduler.schedule()
    await vi.waitFor(() => expect(states.at(-1)).toEqual({ status: 'ready', generation: 2 }))
    await scheduler.close()

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'broken source' }))
    expect(states).toContainEqual({ status: 'error', generation: 1 })
  })
})

describe('createPollingWatcher', () => {
  it('detects source changes without allocating one file-system watcher per directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'docfuse-polling-watcher-'))
    temporaryDirectories.push(directory)
    const watcher = await createPollingWatcher([directory], { intervalMs: 10 })
    let changes = 0
    watcher.on('all', () => {
      changes += 1
    })

    await writeFile(join(directory, 'source.ts'), 'export const value = 1')
    await vi.waitFor(() => expect(changes).toBe(1))
    await watcher.close()
  })
})

describe('development state files', () => {
  it('writes atomically and only removes the owning session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'docfuse-dev-state-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'markdown.json')
    const heartbeatAt = new Date('2026-07-23T00:00:00.000Z').toISOString()
    const state = {
      package: 'markdown',
      status: 'ready',
      generation: 4,
      sessionId: 'current-session',
      heartbeatAt
    }

    await writeDevState(statePath, state)
    await expect(readDevState(statePath)).resolves.toEqual(state)
    await removeOwnDevState(statePath, 'older-session')
    await expect(readDevState(statePath)).resolves.toEqual(state)
    await removeOwnDevState(statePath, 'current-session')
    await expect(readDevState(statePath)).resolves.toBeUndefined()
  })

  it('invalidates a previous ready session before the initial build and removes its own state on close', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'docfuse-dev-session-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'docfuse.json')
    await writeDevState(statePath, {
      package: 'docfuse',
      status: 'ready',
      generation: 7,
      sessionId: 'previous-session',
      heartbeatAt: new Date().toISOString()
    })
    let releaseBuild!: () => void
    const build = new Promise<void>((resolve) => {
      releaseBuild = resolve
    })
    class FakeWatcher extends EventEmitter {
      close = vi.fn(async () => {})
    }
    const watcher = new FakeWatcher()
    const starting = startPackageBuildWatcher({
      packageName: 'docfuse',
      statePath,
      watchPaths: ['/source'],
      createWatcher: () => watcher,
      build: () => build,
      heartbeatMs: 60_000,
      log: () => {}
    })

    await vi.waitFor(async () => {
      const current = await readDevState(statePath)
      expect(current).toMatchObject({ status: 'building', generation: 8 })
      expect(current?.sessionId).not.toBe('previous-session')
    })
    releaseBuild()
    const controller = await starting
    await expect(readDevState(statePath)).resolves.toMatchObject({ status: 'ready', generation: 8 })
    await controller.close()
    await expect(readDevState(statePath)).resolves.toBeUndefined()
  })

  it('removes its state when the source watcher cannot start', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'docfuse-dev-watcher-failure-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'docfuse.json')

    await expect(
      startPackageBuildWatcher({
        packageName: 'docfuse',
        statePath,
        watchPaths: ['/source'],
        createWatcher: async () => {
          throw new Error('watch unavailable')
        },
        build: async () => {},
        log: () => {}
      })
    ).rejects.toThrow('watch unavailable')
    await expect(readDevState(statePath)).resolves.toBeUndefined()
  })

  it('publishes coherent generations for multiple incremental build tasks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'docfuse-incremental-state-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'markdown.json')
    const errors: unknown[] = []
    const controller = await startIncrementalBuildState({
      packageName: 'markdown',
      statePath,
      settleMs: 5,
      heartbeatMs: 60_000,
      onError: (error) => errors.push(error),
      log: () => {}
    })

    controller.start('library')
    controller.start('islands')
    controller.succeed('library')
    controller.succeed('islands')
    await vi.waitFor(async () => {
      await expect(readDevState(statePath)).resolves.toMatchObject({
        status: 'ready',
        generation: 1
      })
    })

    controller.start('library')
    controller.fail('library', new Error('invalid module'))
    await vi.waitFor(async () => {
      await expect(readDevState(statePath)).resolves.toMatchObject({
        status: 'error',
        generation: 2
      })
    })

    controller.start('library')
    controller.succeed('library')
    await vi.waitFor(async () => {
      await expect(readDevState(statePath)).resolves.toMatchObject({
        status: 'ready',
        generation: 3
      })
    })
    expect(errors).toHaveLength(1)

    await controller.close()
    await expect(readDevState(statePath)).resolves.toBeUndefined()
  })
})
import { EventEmitter } from 'node:events'
