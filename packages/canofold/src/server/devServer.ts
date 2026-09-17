import chokidar from 'chokidar'
import { runBuild } from '../commands/build'
import { startStaticServer, type DevReloadUpdate } from './staticServer'
import { createMarkdownRenderer } from '@canofold/markdown/server'
import { relative, resolve, sep } from 'node:path'
import { resolveBuildCacheRoot } from '../build/cache'
import { isInside, resolveOutputRoot } from '../utils/paths'
import { publicPathFor } from '../seo/urls'
import { logError } from '../utils/logger'
import type { CanofoldDemoDevRuntime } from '../demos/types'
import type { Server as HttpServer } from 'node:http'

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
  return (
    isInside(resolveOutputRoot(cwd, outputDir), absolutePath) ||
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
        onBuildError(error)
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
  const renderer = createMarkdownRenderer()
  let buildState = await runBuild({ cwd, renderer, demoMode: 'dev' })
  let demoRuntime: CanofoldDemoDevRuntime | undefined
  let demoRuntimeKey: string | undefined
  let httpServer: HttpServer | undefined

  const runtimeKeyForCurrentBuild = () => {
    const engine = buildState.config.demos.engine
    if (!buildState.demoManifest || !engine?.startDev) return undefined
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
    const engine = buildState.config.demos.engine
    if (!buildState.demoManifest || !engine?.startDev || !httpServer) return undefined
    return engine.startDev({
      cwd,
      basePath: buildState.config.basePath,
      setup: buildState.config.demos.setup,
      server: httpServer,
      getDemos: () => Object.values(buildState.demoManifest?.demos ?? {}),
      shouldIgnorePath: (path) => shouldIgnoreGeneratedPath(cwd, buildState.config.outputDir, path)
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
    await previousRuntime?.close()
  }

  const server = await startStaticServer({
    root: () => resolveOutputRoot(cwd, buildState.config.outputDir),
    port,
    liveReload: true,
    basePath: () => buildState.config.basePath,
    configureServer: async (serverInstance) => {
      httpServer = serverInstance
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
  const watcher = chokidar.watch('.', {
    cwd,
    ignoreInitial: true,
    ignored: (path) => shouldIgnoreGeneratedPath(cwd, buildState.config.outputDir, path)
  })
  const scheduler = createBuildScheduler({
    build: async () => {
      buildState = await runBuild({
        cwd,
        renderer,
        demoMode: 'dev'
      })
      await refreshDemoRuntime()
      const routes = buildState.changedPages.flatMap((key) => {
        const page = buildState.graph.pages.find((candidate) => candidate.sourceRelativePath === key)
        return page ? [publicPathFor(buildState.config, page.routePath)] : []
      })
      return {
        protocol: 1,
        type: 'update',
        mode: buildState.partialReload && routes.length === 1 ? 'page' : 'full',
        routes
      } satisfies DevReloadUpdate
    },
    reload: (update) => server.reload(update),
    onBuildError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logError('Build error:', message)
      server.sendBuildError(message)
    },
    onBuildOk: () => server.sendBuildOk()
  })
  watcher.on('all', (_event, path) => {
    if (demoRuntime?.handlesFile?.(resolve(cwd, path))) return
    scheduler.schedule()
  })
  watcher.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    logError('File watcher error:', message)
    server.sendBuildError(message)
  })

  return {
    port: server.port,
    close: async () => {
      await watcher.close()
      await scheduler.close()
      await server.close()
    }
  }
}
