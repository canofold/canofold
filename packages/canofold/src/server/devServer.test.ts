import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuildResult } from '../commands/build'
import type { CanofoldDemoDevContext } from '../demos/types'
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
vi.mock('@canofold/markdown/server', () => ({
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
  it('restarts the mounted demo engine only when its development identity changes', async () => {
    let onFileEvent: ((eventName: string, path: string) => void) | undefined
    const watcher = {
      on: vi.fn((eventName: string, listener: (...arguments_: unknown[]) => void) => {
        if (eventName === 'all') {
          onFileEvent = listener as (eventName: string, path: string) => void
        }
        return watcher
      }),
      close: vi.fn(async () => undefined)
    }
    const firstRuntime = {
      update: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    }
    const secondRuntime = {
      update: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    }
    const firstStartDev = vi.fn(async (_context: CanofoldDemoDevContext) => firstRuntime)
    const secondStartDev = vi.fn(async (_context: CanofoldDemoDevContext) => secondRuntime)
    const prepare = vi.fn(async () => ({ clientUrl: '/demo.js', demos: {} }))
    const resultWithEngine = (cacheKey: string, startDev: typeof firstStartDev): BuildResult =>
      buildResult({
        config: createMockConfig({
          demos: { engine: { id: 'fixture', version: '1', cacheKey, prepare, startDev } }
        }),
        demoManifest: { clientUrl: '/demo.js', demos: {} }
      })

    mocks.watch.mockReturnValue(watcher)
    mocks.startStaticServer.mockImplementation(async (options) => {
      const mounted = await options.configureServer?.({} as never)
      return {
        port: 3333,
        reload: vi.fn(),
        sendBuildError: vi.fn(),
        sendBuildOk: vi.fn(),
        close: vi.fn(async () => mounted?.close?.())
      }
    })
    mocks.runBuild
      .mockResolvedValueOnce(resultWithEngine('first', firstStartDev))
      .mockResolvedValueOnce(resultWithEngine('second', secondStartDev))
      .mockResolvedValueOnce(resultWithEngine('second', secondStartDev))

    const server = await startDevServer({ cwd: '/project', port: 3333 })
    expect(firstStartDev).toHaveBeenCalledOnce()
    const firstContext = firstStartDev.mock.calls[0]?.[0]
    expect(firstContext?.shouldIgnorePath('/project/.canofold/dist/index.html')).toBe(true)
    expect(firstContext?.shouldIgnorePath('/project/.dist.tmp-build/index.html')).toBe(true)
    expect(firstContext?.shouldIgnorePath('/project/src/button.tsx')).toBe(false)

    onFileEvent?.('change', 'canofold.config.ts')
    await wait(120)
    expect(secondStartDev).toHaveBeenCalledOnce()
    expect(firstRuntime.close).toHaveBeenCalledOnce()

    onFileEvent?.('change', 'docs/guide.md')
    await wait(120)
    expect(secondStartDev).toHaveBeenCalledOnce()
    expect(secondRuntime.update).toHaveBeenCalledOnce()

    await server.close()
    expect(secondRuntime.close).toHaveBeenCalledOnce()
  })

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
    expect(watchOptions.ignored('.canofold/cache/build-manifest.json')).toBe(true)
    expect(watchOptions.ignored('.canofold/tmp/config-123/runtime.mjs')).toBe(true)
    expect(watchOptions.ignored('docs/guide.md')).toBe(false)
    expect(onFileEvent).toBeTypeOf('function')
    expect(onWatcherError).toBeTypeOf('function')
    onWatcherError?.(new Error('watch failed'))
    expect(staticServer.sendBuildError).toHaveBeenCalledWith('watch failed')
    expect(errorSpy).toHaveBeenCalledWith('[canofold] File watcher error:', 'watch failed')
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
