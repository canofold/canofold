import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuildResult } from '../commands/build'
import { createMockConfig, createMockGraph, createMockPage } from '../../test/fixtures'

const mocks = vi.hoisted(() => ({
  runBuild: vi.fn(),
  startStaticServer: vi.fn(),
  watch: vi.fn(),
  createMarkdownRenderer: vi.fn(() => ({ clear: vi.fn() }))
}))

vi.mock('../commands/build', () => ({ runBuild: mocks.runBuild }))
vi.mock('./staticServer', () => ({ startStaticServer: mocks.startStaticServer }))
vi.mock('chokidar', () => ({ default: { watch: mocks.watch } }))
vi.mock('@docfuse/markdown/server', () => ({
  createMarkdownRenderer: mocks.createMarkdownRenderer
}))

import { createBuildScheduler, startDevServer } from './devServer'

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const graph = createMockGraph()
const guidePage = createMockPage({
  sourcePath: '/project/docs/guide.md',
  sourceRelativePath: 'docs/guide.md',
  group: '',
  headings: [],
  lastUpdated: ''
})

function buildResult(overrides: Partial<BuildResult> = {}): BuildResult {
  return {
    config: createMockConfig(),
    graph,
    incremental: false,
    cached: false,
    mode: 'clean',
    changedPages: [],
    partialReload: false,
    reason: 'test',
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createBuildScheduler', () => {
  it('debounces bursts and never overlaps builds', async () => {
    let active = 0
    let maxActive = 0
    let builds = 0
    let reloads = 0
    const scheduler = createBuildScheduler({
      debounceMs: 5,
      build: async () => {
        builds += 1
        active += 1
        maxActive = Math.max(maxActive, active)
        await wait(20)
        active -= 1
      },
      reload: () => {
        reloads += 1
      }
    })

    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()
    await wait(10)
    scheduler.schedule()
    scheduler.schedule()
    await wait(70)
    await scheduler.close()

    expect(builds).toBe(2)
    expect(reloads).toBe(2)
    expect(maxActive).toBe(1)
  })

  it('does not reload after a failed build', async () => {
    const errors: unknown[] = []
    let reloads = 0
    const scheduler = createBuildScheduler({
      debounceMs: 1,
      build: async () => {
        throw new Error('build failed')
      },
      reload: () => {
        reloads += 1
      },
      onBuildError: (error: unknown) => errors.push(error)
    })

    scheduler.schedule()
    await wait(20)
    await scheduler.close()

    expect(errors).toHaveLength(1)
    expect(reloads).toBe(0)
  })
})

describe('startDevServer', () => {
  it('restores the complete changed-file batch after a failed build', async () => {
    let onFileEvent: ((eventName: string, path: string) => void) | undefined
    let onWatcherError: ((error: unknown) => void) | undefined
    const watcher = {
      on: vi.fn((eventName: string, listener: (...arguments_: unknown[]) => void) => {
        if (eventName === 'all') {
          onFileEvent = listener as (eventName: string, path: string) => void
        }
        if (eventName === 'error') onWatcherError = listener
        return watcher
      }),
      close: vi.fn(async () => {})
    }
    const staticServer = {
      port: 3333,
      reload: vi.fn(),
      sendBuildError: vi.fn(),
      sendBuildOk: vi.fn(),
      close: vi.fn(async () => {})
    }
    mocks.watch.mockReturnValue(watcher)
    mocks.startStaticServer.mockResolvedValue(staticServer)
    mocks.runBuild
      .mockResolvedValueOnce(buildResult())
      .mockRejectedValueOnce(new Error('build failed'))
      .mockResolvedValueOnce(
        buildResult({
          graph: { ...graph, pages: [guidePage] },
          incremental: true,
          mode: 'incremental',
          changedPages: ['docs/guide.md'],
          partialReload: true
        })
      )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const server = await startDevServer({ cwd: '/project', port: 3333 })

    const watchOptions = mocks.watch.mock.calls[0]?.[1]
    expect(watchOptions).not.toHaveProperty('usePolling')
    expect(watchOptions.ignored('.docfuse/cache/build-manifest.json')).toBe(true)
    expect(watchOptions.ignored('.docfuse/tmp/config-123/runtime.mjs')).toBe(true)
    expect(watchOptions.ignored('docs/guide.md')).toBe(false)
    expect(onFileEvent).toBeTypeOf('function')
    expect(onWatcherError).toBeTypeOf('function')
    onWatcherError?.(new Error('watch failed'))
    expect(staticServer.sendBuildError).toHaveBeenCalledWith('watch failed')
    expect(errorSpy).toHaveBeenCalledWith('[docfuse] File watcher error:', 'watch failed')
    onFileEvent?.('change', 'docs/first.md')
    onFileEvent?.('change', 'docs/second.md')
    await wait(120)
    expect(mocks.runBuild).toHaveBeenCalledTimes(2)
    expect(mocks.runBuild.mock.calls[1]?.[0]).not.toHaveProperty('changedPaths')
    expect(mocks.runBuild.mock.calls[1]?.[0]).not.toHaveProperty('forceClean')

    onFileEvent?.('unlink', 'docs/third.md')
    await wait(120)
    expect(mocks.runBuild).toHaveBeenCalledTimes(3)
    expect(mocks.runBuild.mock.calls[2]?.[0]).not.toHaveProperty('changedPaths')
    expect(mocks.runBuild.mock.calls[2]?.[0]).not.toHaveProperty('forceClean')
    expect(staticServer.reload).toHaveBeenCalledTimes(1)
    expect(staticServer.reload).toHaveBeenCalledWith({
      protocol: 1,
      type: 'update',
      mode: 'page',
      routes: ['/guide/']
    })

    await server.close()
    expect(watcher.close).toHaveBeenCalledOnce()
    expect(staticServer.close).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })
})
