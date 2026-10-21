import chokidar from 'chokidar'
import { runBuild } from '../commands/build'
import { startStaticServer, type DevReloadUpdate } from './staticServer'
import { createMarkdownRenderer } from '@canofold/markdown/server'
import { dirname, relative, resolve, sep } from 'node:path'
import { resolveBuildCacheRoot } from '../build/cache'
import { outputBackupRoot } from '../build/safety'
import { assertProjectPath, isInside, resolveOutputRoot } from '../utils/paths'
import { publicPathFor } from '../seo/urls'
import { logError } from '../utils/logger'
import type { CanofoldDemoDevRuntime } from '../demos/types'
import { createServer } from 'node:http'
import { realpath } from 'node:fs/promises'
import { acquireProjectLock } from '../utils/projectLock'
import { loadConfig } from '../config/load'
import { ContentDiagnosticsError } from '../check/diagnostics'
import { once } from 'node:events'
import { createDevPages } from './devPages'
import { documentationVersions } from '../config/versions'
import { isMarkdownPath } from '../content/fileKinds'

interface BuildScheduler {
  schedule(): void
  close(): Promise<void>
}

function shouldIgnoreGeneratedPath(cwd: string, outputDir: string, path: string) {
  const absolutePath = resolve(cwd, path)
  const segments = relative(cwd, absolutePath).split(sep)
  if (segments.includes('node_modules') || segments.includes('.git')) return true
  if (segments.includes('.canofold')) return true
  if (segments.some((segment) => /^\..+\.(?:tmp|backup)-/.test(segment))) return true
  const outputRoot = resolveOutputRoot(cwd, outputDir)
  return (
    isInside(outputRoot, absolutePath) ||
    isInside(outputBackupRoot(outputRoot), absolutePath) ||
    isInside(resolveBuildCacheRoot(cwd), absolutePath)
  )
}

/** Coalesce file events and guarantee that output builds never overlap. */
export function createBuildScheduler<Update = void>({
  build,
  reload,
  onBuildError = (error) => logError(error instanceof Error ? error.message : String(error)),
  onBuildOk,
  debounceMs = 80
}: {
  build: () => Promise<Update>
  reload: (update: Update) => void
  /** Called when a build fails; receives the raw error. */
  onBuildError?: (error: unknown) => void
  /** Called after a successful build, useful for clearing error state. */
  onBuildOk?: () => void
  debounceMs?: number
}): BuildScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: Promise<void> | undefined
  let pending = false
  let closed = false

  const run = () => {
    timer = undefined
    if (closed) return
    if (active) {
      pending = true
      return
    }

    active = (async () => {
      try {
        const update = await build()
        if (!closed) {
          onBuildOk?.()
          reload(update)
        }
      } catch (error) {
        if (!closed) onBuildError(error)
      } finally {
        active = undefined
        if (pending && !closed) {
          pending = false
          timer = setTimeout(run, 0)
        }
      }
    })()
  }

  return {
    schedule() {
      if (closed) return
      if (active) {
        pending = true
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, debounceMs)
    },
    async close() {
      closed = true
      pending = false
      if (timer) clearTimeout(timer)
      timer = undefined
      await active
    }
  }
}

export async function startDevServer({ cwd, port }: { cwd: string; port: number }) {
  cwd = await realpath(cwd)
  const lockRoot = dirname(resolveBuildCacheRoot(cwd))
  await assertProjectPath(cwd, lockRoot, 'development session')
  const session = await acquireProjectLock(lockRoot, 'dev')
  const httpServer = createServer()
  let closeWatcher: (() => Promise<void>) | undefined
  let closePages: (() => Promise<void>) | undefined
  try {
    const renderer = createMarkdownRenderer()
    let outputDir = '.canofold/dist'
    let changedDuringStartup = false
    let onFileEvent: ((event: string, path: string) => void) | undefined
    const watcher = chokidar.watch('.', {
      cwd,
      ignoreInitial: true,
      ignored: (path) => shouldIgnoreGeneratedPath(cwd, outputDir, path)
    })
    closeWatcher = () => watcher.close()
    let startupWatcherError: Error | undefined
    let onWatcherError = (error: unknown) => {
      startupWatcherError = error instanceof Error ? error : new Error(String(error))
    }
    watcher.on('error', (error: unknown) => onWatcherError(error))
    watcher.on('all', (event, path) => {
      if (onFileEvent) onFileEvent(event, path)
      else changedDuringStartup = true
    })
    await once(watcher, 'ready')
    let config = await loadConfig(cwd)
    outputDir = config.outputDir
    let buildState: Awaited<ReturnType<typeof runBuild>> | undefined
    let initialError: ContentDiagnosticsError | undefined
    try {
      buildState = await runBuild({
        cwd,
        renderer,
        config,
        demoMode: 'dev',
        demoServer: httpServer,
        renderHtml: false
      })
      config = buildState.config
      outputDir = config.outputDir
    } catch (error) {
      if (error instanceof ContentDiagnosticsError) {
        initialError = error
        logError(error.message)
      } else {
        throw error
      }
    }
    let demoRuntime: CanofoldDemoDevRuntime | undefined
    let contentDependencies = new Set(buildState?.contentDependencyPaths.map((path) => resolve(cwd, path)))
    if (startupWatcherError) throw startupWatcherError
    let demoRuntimeKey: string | undefined

    const runtimeKeyForCurrentBuild = () => {
      const engine = buildState?.config.demos.engine
      if (!buildState?.demoManifest || !engine?.startDev) return undefined
      return JSON.stringify({
        id: engine.id,
        version: engine.version ?? '',
        cacheKey: engine.cacheKey ?? null,
        basePath: buildState.config.basePath,
        outputDir: buildState.config.outputDir,
        setup: buildState.config.demos.setup ?? null
      })
    }

    const createDemoRuntime = async () => {
      const engine = buildState?.config.demos.engine
      if (!buildState?.demoManifest || !engine?.startDev) return undefined
      return engine.startDev({
        cwd,
        basePath: buildState.config.basePath,
        setup: buildState.config.demos.setup,
        server: httpServer,
        getDemos: () => Object.values(buildState?.demoManifest?.demos ?? {}),
        shouldIgnorePath: (path) => shouldIgnoreGeneratedPath(cwd, config.outputDir, path)
      })
    }

    const refreshDemoRuntime = async () => {
      const nextKey = runtimeKeyForCurrentBuild()
      if (nextKey === demoRuntimeKey) {
        await demoRuntime?.update?.()
        return
      }
      const nextRuntime = await createDemoRuntime()
      const previousRuntime = demoRuntime
      demoRuntime = nextRuntime
      demoRuntimeKey = nextKey
      if (previousRuntime !== nextRuntime) await previousRuntime?.close()
    }

    const pages = createDevPages(cwd, renderer, () => buildState)
    closePages = () => pages.close()
    const server = await startStaticServer({
      root: () => resolveOutputRoot(cwd, config.outputDir),
      port,
      server: httpServer,
      liveReload: true,
      resolveDocument: pages.resolveDocument,
      basePath: () => config.basePath,
      configureServer: async () => {
        demoRuntime = await createDemoRuntime()
        demoRuntimeKey = runtimeKeyForCurrentBuild()
        return {
          middleware(request, response, next) {
            if (!demoRuntime?.middleware) {
              next()
              return
            }
            demoRuntime.middleware(request, response, () => next())
          },
          close: () => demoRuntime?.close()
        }
      }
    })
    if (initialError) server.sendBuildError(initialError.message)
    watcher.add(buildState?.demoManifest?.dependencyPaths ?? [])
    let needsReload = Boolean(initialError)
    let forceCleanNextBuild = false
    const scheduler = createBuildScheduler({
      build: async () => {
        await session.assertOwned()
        const previousPages = new Map(buildState?.graph.pages.map((page) => [page.outputPath, page]))
        const forceClean = forceCleanNextBuild
        forceCleanNextBuild = false
        try {
          buildState = await runBuild({
            cwd,
            renderer,
            demoMode: 'dev',
            renderHtml: false,
            demoServer: httpServer,
            ...(forceClean ? { forceClean: true } : {})
          })
          config = buildState.config
          outputDir = config.outputDir
          contentDependencies = new Set(buildState.contentDependencyPaths.map((path) => resolve(cwd, path)))
          await refreshDemoRuntime()
          watcher.add(buildState.demoManifest?.dependencyPaths ?? [])
        } catch (error) {
          if (forceClean) forceCleanNextBuild = true
          throw error
        }
        if (buildState.cached && !needsReload) return undefined
        const changedSources = new Set(buildState.changedPages)
        const pages = buildState.graph.pages.filter((page) => changedSources.has(page.sourceRelativePath))
        // File events can lag or arrive during a build. Classify the content
        // actually published, not the event batch that happened to start it.
        const sourcesOnly =
          buildState.mode === 'incremental' &&
          previousPages.size === buildState.graph.pages.length &&
          pages.length > 0 &&
          pages.every((page) => {
            const previous = previousPages.get(page.outputPath)
            return (
              page.demos.length > 0 &&
              previous?.sourceRevision === page.sourceRevision &&
              previous.transformedSource === page.transformedSource
            )
          })
        const routes = pages.map((page) => publicPathFor(config, page.routePath))
        return {
          protocol: 1,
          type: 'update',
          mode: buildState.cached
            ? 'full'
            : sourcesOnly
              ? 'demo-source'
              : buildState.partialReload && routes.length === 1
                ? 'page'
                : 'full',
          routes
        } satisfies DevReloadUpdate
      },
      reload: (update) => {
        if (update) server.reload(update)
      },
      onBuildError: (error: unknown) => {
        needsReload = true
        const message = error instanceof Error ? error.message : String(error)
        logError('Build error:', message)
        server.sendBuildError(message)
      },
      onBuildOk: () => {
        needsReload = false
        server.sendBuildOk()
      }
    })
    onFileEvent = (_event, path) => {
      const absolutePath = resolve(cwd, path)
      const isDemoSource = Object.values(buildState?.demoManifest?.demos ?? {}).some(
        (demo) => resolve(demo.modulePath) === absolutePath
      )
      const isEngineDependency = buildState?.demoManifest?.dependencyPaths?.includes(absolutePath)
      const isContentInput =
        contentDependencies.has(absolutePath) ||
        documentationVersions(config).some((version) => {
          const root = resolve(cwd, version.docsDir)
          return (
            (isMarkdownPath(path) && isInside(root, absolutePath)) ||
            isInside(resolve(root, 'public'), absolutePath)
          )
        })
      if (
        !needsReload &&
        !isContentInput &&
        !isDemoSource &&
        !isEngineDependency &&
        demoRuntime?.handlesFile?.(absolutePath)
      )
        return
      scheduler.schedule()
    }
    if (changedDuringStartup) scheduler.schedule()
    onWatcherError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logError('File watcher error:', message)
      server.sendBuildError(message)
    }
    if (startupWatcherError) {
      await pages.close()
      await server.close()
      throw startupWatcherError
    }

    let closing: Promise<void> | undefined
    const handle = {
      port: server.port,
      basePath: config.basePath,
      refresh: () => {
        forceCleanNextBuild = true
        scheduler.schedule()
      },
      close: () =>
        (closing ??= watcher
          .close()
          .finally(() => scheduler.close())
          .finally(() => pages.close())
          .finally(() => renderer.clear())
          .finally(() => server.close())
          .finally(() => session.release()))
    }
    return handle
  } catch (error) {
    try {
      await closeWatcher?.()
    } finally {
      try {
        await closePages?.()
      } finally {
        httpServer.close()
        await session.release()
      }
    }
    throw error
  }
}
