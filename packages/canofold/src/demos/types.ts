import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http'

export type CanofoldDemoCacheValue =
  string | number | boolean | null | CanofoldDemoCacheValue[] | { [key: string]: CanofoldDemoCacheValue }

export type CanofoldDemoSandbox = 'inline' | 'iframe'

export interface CanofoldDemoReference {
  id: string
  title?: string
  description?: string
  specifier: string
  sandbox: CanofoldDemoSandbox
  pageSourcePath: string
  pageSourceRelativePath: string
  routePath: string
  locale: string
  line?: number
  column?: number
  sourceOffset?: number
  sourceEndOffset?: number
}

export interface CanofoldPreparedDemo extends CanofoldDemoReference {
  modulePath: string
  moduleUrl?: string
  /** Project-local files imported by this demo, used for cache invalidation. */
  dependencyPaths?: string[]
  source: string
  language: 'tsx' | 'ts' | 'jsx' | 'js'
}

export interface CanofoldDemoManifest {
  clientUrl: string
  /** Optional Markdown browser entry emitted by the same module graph as demos. */
  markdownClientUrl?: string
  styleUrls?: string[]
  demos: Record<string, CanofoldPreparedDemo>
  /** Paths relative to the site output root, used by output safety and caching. */
  outputPaths?: string[]
  /** Project-local engine/setup files that affect every demo page. */
  dependencyPaths?: string[]
}

export interface CanofoldDemoPrepareContext {
  cwd: string
  outputRoot: string
  basePath: string
  mode: 'analyze' | 'build' | 'dev'
  /** Shared HTTP server used by the single long-lived Vite session in dev mode. */
  server?: HttpServer
  setup?: string
  demos: readonly CanofoldDemoReference[]
}

export interface CanofoldDemoDevRuntime {
  middleware?: (request: IncomingMessage, response: ServerResponse, next: () => void) => void
  handlesFile?: (path: string) => boolean
  /** Notify the engine after Canofold refreshes the demo manifest. */
  update?(): void | Promise<void>
  close(): void | Promise<void>
}

export interface CanofoldDemoDevContext {
  cwd: string
  basePath: string
  setup?: string
  server: HttpServer
  getDemos(): readonly CanofoldPreparedDemo[]
  /** Excludes Canofold output, cache, and atomic replacement files from framework watchers. */
  shouldIgnorePath(path: string): boolean
}

/**
 * Trusted build/dev adapter for interactive component examples.
 *
 * Canofold owns Markdown, routes and the demo declaration model. Engines own
 * project module resolution, browser transforms, CSS, HMR and production
 * client chunks.
 */
export interface CanofoldDemoEngine {
  id: string
  version?: string
  cacheKey?: CanofoldDemoCacheValue
  prepare(context: CanofoldDemoPrepareContext): Promise<CanofoldDemoManifest>
  startDev?(context: CanofoldDemoDevContext): Promise<CanofoldDemoDevRuntime>
}
