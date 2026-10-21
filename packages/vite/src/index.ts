import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { access, readFile, readdir } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Server as HttpServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import type {
  CanofoldDemoDevContext,
  CanofoldDemoDevRuntime,
  CanofoldDemoEngine,
  CanofoldDemoPrepareContext,
  CanofoldDemoReference,
  CanofoldPreparedDemo
} from 'canofold/demo-engine'
import {
  build as viteBuild,
  createServer as createViteServer,
  loadConfigFromFile,
  mergeConfig,
  normalizePath,
  type BuildOptions,
  type InlineConfig,
  type Manifest,
  type ModuleNode,
  type Plugin,
  type ViteDevServer,
  version as viteVersion
} from 'vite'
import { onDemoBuildWarning } from './buildWarnings'
import { demoRuntimeSource } from './runtime'

const PUBLIC_CLIENT_ID = 'virtual:canofold-demo-client'
const RESOLVED_CLIENT_ID = `\0${PUBLIC_CLIENT_ID}`
const PUBLIC_MARKDOWN_CLIENT_ID = 'virtual:canofold-markdown-client'
const RESOLVED_MARKDOWN_CLIENT_ID = `\0${PUBLIC_MARKDOWN_CLIENT_ID}`
const PACKAGE_MODULE_PATH = fileURLToPath(import.meta.url)
const BROWSER_RUNTIME_DEPENDENCIES = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@canofold/vite > @canofold/markdown > hast-util-to-jsx-runtime',
  '@canofold/vite > @canofold/markdown > lucide-react'
] as const
const PROJECT_METADATA_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb'
] as const

interface DevSession {
  key: string
  environmentSignature: string
  server: ViteDevServer
  plugin: Plugin
  runtime?: CanofoldDemoDevRuntime
  state: {
    demos: CanofoldPreparedDemo[]
    setup?: string
  }
}

const devSessions = new WeakMap<HttpServer, DevSession>()

type VersionedOptimizeDeps = NonNullable<InlineConfig['optimizeDeps']> & {
  rolldownOptions?: {
    transform?: { target?: string | string[] }
  }
}

export interface CanofoldViteOptions {
  /** Project root passed to Vite. Defaults to the Canofold project root. */
  root?: string
  /** Vite config file. Use false to disable config discovery. */
  configFile?: string | false
}

function jsonForJavaScript(value: string) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function baseUrl(basePath: string, path: string) {
  const prefix = basePath === '/' ? '' : basePath.replace(/\/$/, '')
  return `${prefix}/${path.replace(/^\//, '')}`
}

function languageFor(path: string): CanofoldPreparedDemo['language'] {
  const extension = extname(path).toLowerCase()
  if (extension === '.tsx') return 'tsx'
  if (extension === '.jsx') return 'jsx'
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return 'js'
  return 'ts'
}

function filePathFromResolvedId(id: string) {
  const clean = id.replace(/[?#].*$/, '')
  if (clean.startsWith('/@fs/')) return clean.slice('/@fs'.length)
  return clean
}

function importerFor(reference: CanofoldDemoReference) {
  return normalizePath(reference.pageSourcePath)
}

function canonicalPath(path: string) {
  try {
    return realpathSync.native(resolve(path))
  } catch {
    return resolve(path)
  }
}

async function projectMetadataPaths(projectRoot: string) {
  const candidates = PROJECT_METADATA_FILES.map((file) => join(projectRoot, file))
  const existing = await Promise.all(
    candidates.map(async (path) => {
      try {
        await access(path)
        return canonicalPath(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
    })
  )
  return existing.filter((path): path is string => Boolean(path))
}

const MODULE_CONCURRENCY = 32

/** Settle active transforms before propagating the first failure or closing Vite. */
async function settleModuleBatch<T>(tasks: Promise<T>[]): Promise<T[]> {
  let failure: { error: unknown } | undefined
  const results = await Promise.allSettled(
    tasks.map((task) =>
      task.catch((error: unknown) => {
        failure ??= { error }
        throw error
      })
    )
  )
  if (failure) throw failure.error
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}

function mergeDependencyPaths(left: readonly string[], right: readonly string[]): string[] {
  const merged: string[] = []
  let a = 0,
    b = 0
  while (a < left.length || b < right.length) {
    if (b === right.length || (a < left.length && left[a]! < right[b]!)) merged.push(left[a++]!)
    else if (a === left.length || right[b]! < left[a]!) merged.push(right[b++]!)
    else {
      merged.push(left[a++]!)
      b += 1
    }
  }
  return merged
}

function createDependencyCollector(server: ViteDevServer, cwd: string) {
  const projectRoot = canonicalPath(cwd)
  const viteRoot = canonicalPath(server.config.root)
  const paths = new Map<string, string>()
  const canonical = (path: string) => {
    let value = paths.get(path)
    if (!value) paths.set(path, (value = canonicalPath(path)))
    return value
  }
  const contains = (path: string) => {
    const projectRelative = relative(projectRoot, canonical(path))
    return (
      projectRelative !== '..' &&
      !projectRelative.startsWith(`..${sep}`) &&
      !isAbsolute(projectRelative) &&
      !projectRelative.split(sep).some((part) => part === 'node_modules' || part === '.canofold')
    )
  }
  const transforms = new Map<string, ReturnType<ViteDevServer['transformRequest']>>()
  const transform = (url: string) => {
    let pending = transforms.get(url)
    if (!pending) transforms.set(url, (pending = server.transformRequest(url)))
    return pending
  }
  const modules = new Map<ModuleNode, { path: string; imports: ModuleNode[] }>()
  const queued = new Set<ModuleNode>()
  const pending: ModuleNode[] = []
  let loading: Promise<void> | undefined
  const enqueue = (module: ModuleNode) => {
    if (queued.has(module)) return
    queued.add(module)
    pending.push(module)
  }
  const loadGraph = async (first: ModuleNode) => {
    enqueue(first)
    while (pending.length > 0 || loading) {
      loading ??= (async () => {
        while (pending.length > 0) {
          const batch = pending.splice(0, MODULE_CONCURRENCY)
          await settleModuleBatch(
            batch.map(async (module) => {
              if (!module.file) return
              const path = canonical(module.file)
              if (!contains(path)) return
              await transform(module.url)
              const imports = [...module.importedModules]
              modules.set(module, { path, imports })
              imports.forEach(enqueue)
            })
          )
        }
      })().finally(() => {
        loading = undefined
      })
      await loading
      // A new root can arrive while the previous drain's promise is settling.
      // Recheck the queue so that root cannot observe a partially loaded graph.
    }
  }

  // Library barrels are imported by many Demo roots. Their reachable files are
  // stable in this prepared snapshot, so traverse each shared import once.
  // Cache complete iterative walks, not recursive partial results (cycles).
  const closures = new Map<ModuleNode, readonly string[]>()
  const importedFiles = (first: ModuleNode) => {
    const known = closures.get(first)
    if (known) return known
    const visited = new Set<ModuleNode>()
    const dependencies = new Set<string>()
    const remaining = [first]
    while (remaining.length) {
      const module = remaining.pop()!
      if (visited.has(module)) continue
      visited.add(module)
      const cached = closures.get(module)
      if (cached) {
        cached.forEach((path) => dependencies.add(path))
        continue
      }
      const entry = modules.get(module)
      if (!entry) continue
      dependencies.add(entry.path)
      remaining.push(...entry.imports)
    }
    const files = [...dependencies].sort()
    closures.set(first, files)
    return files
  }

  // Hydrate each module once, then walk its snapshot synchronously per root.
  // Allocating an async traversal per Demo and dependency multiplies promises
  // and peak memory for library barrels. The queue also handles import cycles.
  // All state remains preparation-scoped so edits and removed imports are fresh.
  return {
    contains,
    async collect(modulePath: string) {
      const rootRelative = relative(viteRoot, canonical(modulePath))
      const url =
        rootRelative !== '..' && !rootRelative.startsWith(`..${sep}`) && !isAbsolute(rootRelative)
          ? `/${normalizePath(rootRelative)}`
          : `/@fs/${normalizePath(modulePath)}`
      await transform(url)
      const first =
        server.moduleGraph.getModuleById(normalizePath(modulePath)) ??
        server.moduleGraph.getModulesByFile(modulePath)?.values().next().value
      if (!first) return []
      await loadGraph(first)
      const entry = modules.get(first)
      let dependencies: string[] = []
      if (entry) {
        dependencies = [entry.path]
        for (const imported of entry.imports)
          dependencies = mergeDependencyPaths(dependencies, importedFiles(imported))
      }
      return dependencies
    }
  }
}

async function resolveDemo(
  server: ViteDevServer,
  reference: CanofoldDemoReference,
  collectDependencies: ReturnType<typeof createDependencyCollector>
): Promise<CanofoldPreparedDemo> {
  const resolved = await server.pluginContainer.resolveId(reference.specifier, importerFor(reference))
  if (!resolved || resolved.external || resolved.id.startsWith('\0')) {
    throw new Error(
      `Vite could not resolve demo ${JSON.stringify(reference.specifier)} in ${reference.pageSourceRelativePath}`
    )
  }
  const modulePath = filePathFromResolvedId(resolved.id)
  if (!isAbsolute(modulePath)) {
    throw new Error(
      `Demo ${JSON.stringify(reference.specifier)} must resolve to a local source file, got ${JSON.stringify(resolved.id)}`
    )
  }
  if (!collectDependencies.contains(modulePath)) {
    throw new Error(
      `Demo ${JSON.stringify(reference.specifier)} must resolve inside the Canofold project root`
    )
  }
  let source: string
  try {
    source = await readFile(modulePath, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read demo source ${modulePath}: ${message}`)
  }
  return {
    ...reference,
    modulePath,
    moduleUrl: normalizePath(resolved.id),
    dependencyPaths: await collectDependencies.collect(modulePath),
    source,
    language: languageFor(modulePath)
  }
}

async function resolvedSetup(
  server: ViteDevServer,
  setup: string | undefined,
  cwd: string,
  collectDependencies: ReturnType<typeof createDependencyCollector>
) {
  if (!setup) return undefined
  const importer = normalizePath(join(cwd, 'canofold.config.ts'))
  const resolved = await server.pluginContainer.resolveId(setup, importer)
  if (!resolved || resolved.external || resolved.id.startsWith('\0')) {
    throw new Error(`Vite could not resolve demos.setup ${JSON.stringify(setup)}`)
  }
  const modulePath = filePathFromResolvedId(resolved.id)
  if (!isAbsolute(modulePath)) {
    throw new Error(`demos.setup must resolve to a local source file, got ${JSON.stringify(resolved.id)}`)
  }
  if (!collectDependencies.contains(modulePath)) {
    throw new Error(`demos.setup ${JSON.stringify(setup)} must resolve inside the Canofold project root`)
  }
  return {
    id: normalizePath(resolved.id),
    dependencyPaths: await collectDependencies.collect(modulePath)
  }
}

async function resolveDemos(
  server: ViteDevServer,
  demos: readonly CanofoldDemoReference[],
  dependencies: ReturnType<typeof createDependencyCollector>
) {
  const prepared: CanofoldPreparedDemo[] = []
  for (let index = 0; index < demos.length; index += MODULE_CONCURRENCY) {
    prepared.push(
      ...(await settleModuleBatch(
        demos.slice(index, index + MODULE_CONCURRENCY).map((demo) => resolveDemo(server, demo, dependencies))
      ))
    )
  }
  return prepared
}

function hasPackageAlias(config: InlineConfig, packageName: string) {
  const alias = config.resolve?.alias
  if (!alias) return false
  if (!Array.isArray(alias)) return Object.hasOwn(alias, packageName)
  return alias.some(({ find }) =>
    typeof find === 'string' ? find === packageName : new RegExp(find.source, find.flags).test(packageName)
  )
}

function singleLibraryEntry(config: InlineConfig) {
  const library = config.build?.lib
  if (!library) return undefined
  const { entry } = library
  if (!entry) return undefined
  if (typeof entry === 'string') return entry
  if (Array.isArray(entry)) return entry.length === 1 ? entry[0] : undefined
  const entries = Object.values(entry)
  return entries.length === 1 ? entries[0] : undefined
}

async function inferredPackageAlias(config: InlineConfig, projectRoot: string) {
  const entry = singleLibraryEntry(config)
  if (!entry) return undefined
  try {
    const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')) as {
      name?: unknown
    }
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) return undefined
    if (hasPackageAlias(config, manifest.name)) return undefined
    return {
      find: new RegExp(`^${manifest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      replacement: canonicalPath(resolve(projectRoot, entry))
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function virtualClientPlugin({
  projectRoot,
  getDemos,
  getSetup
}: {
  projectRoot: string
  getDemos: () => readonly CanofoldPreparedDemo[]
  getSetup: () => string | undefined
}): Plugin {
  return {
    name: 'canofold-demo-client',
    enforce: 'post',
    async config(config) {
      const alias = await inferredPackageAlias(config, projectRoot)
      return alias ? { resolve: { alias: [alias] } } : undefined
    },
    resolveId(id) {
      if (id === PUBLIC_CLIENT_ID) return RESOLVED_CLIENT_ID
      if (id === PUBLIC_MARKDOWN_CLIENT_ID) return RESOLVED_MARKDOWN_CLIENT_ID
      return undefined
    },
    async load(id) {
      if (id === RESOLVED_MARKDOWN_CLIENT_ID) {
        const markdownClient = await this.resolve('@canofold/markdown/client', PACKAGE_MODULE_PATH, {
          skipSelf: true
        })
        if (!markdownClient || markdownClient.external) {
          throw new Error('@canofold/vite could not resolve its @canofold/markdown client dependency')
        }
        return `export { enhanceMarkdown } from ${jsonForJavaScript(normalizePath(markdownClient.id))};`
      }
      if (id !== RESOLVED_CLIENT_ID) return undefined
      const entries: string[] = []
      const registry: string[] = []
      getDemos().forEach((demo) => {
        registry.push(
          `[${jsonForJavaScript(demo.id)}, () => import(${jsonForJavaScript(normalizePath(demo.modulePath))})]`
        )
      })
      entries.push(`const CANOFOLD_DEMO_REGISTRY = [${registry.join(',')}];`)
      const setup = getSetup()
      const setupImport = setup ? `import CanofoldDemoSetup from ${jsonForJavaScript(setup)};` : undefined
      const runtimePath = fileURLToPath(new URL('../dist/demo-runtime.js', import.meta.url))
      return demoRuntimeSource(entries, setupImport, PUBLIC_MARKDOWN_CLIENT_ID, normalizePath(runtimePath))
    }
  }
}

function inlineConfig(
  cwd: string,
  basePath: string,
  options: CanofoldViteOptions,
  plugins: Plugin | Plugin[]
): InlineConfig {
  const configFile: string | false | undefined =
    options.configFile === false ? false : options.configFile ? resolve(cwd, options.configFile) : undefined
  const optimizeDeps: VersionedOptimizeDeps =
    Number.parseInt(viteVersion, 10) >= 8
      ? {
          include: [...BROWSER_RUNTIME_DEPENDENCIES],
          rolldownOptions: { transform: { target: 'esnext' } }
        }
      : {
          include: [...BROWSER_RUNTIME_DEPENDENCIES],
          esbuildOptions: { target: 'esnext' }
        }
  return {
    root: canonicalPath(options.root ? resolve(cwd, options.root) : cwd),
    configFile,
    base: basePath,
    appType: 'custom' as const,
    plugins: Array.isArray(plugins) ? plugins : [plugins],
    // The dev server ships native ESM to the current browser. Avoid asking the
    // active dependency optimizer to lower syntax that it cannot transform.
    optimizeDeps,
    resolve: { dedupe: ['react', 'react-dom'] }
  }
}

function demoBuildOptions(context: CanofoldDemoPrepareContext): BuildOptions {
  const bundlerOptions = {
    onwarn: onDemoBuildWarning,
    external: () => false,
    // Canofold loads both browser entries with dynamic import() and consumes
    // their named exports. Vite's application default may otherwise remove
    // entry exports that are not referenced inside the bundle.
    preserveEntrySignatures: 'strict' as const,
    input: {
      index: PUBLIC_CLIENT_ID,
      markdown: PUBLIC_MARKDOWN_CLIENT_ID
    },
    output: {
      format: 'es' as const,
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash][extname]'
    }
  }
  return {
    // The project may itself be a Vite library. Demos are a browser app and
    // must not inherit library externals or output conventions.
    lib: false,
    outDir: join(context.outputRoot, 'assets/canofold-demos'),
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: true,
    manifest: true,
    ...(Number.parseInt(viteVersion, 10) >= 8
      ? { rolldownOptions: bundlerOptions }
      : { rollupOptions: bundlerOptions })
  }
}

async function isolatedBuildConfig(
  context: CanofoldDemoPrepareContext,
  options: CanofoldViteOptions,
  plugin: Plugin,
  build: BuildOptions
): Promise<InlineConfig> {
  const root = canonicalPath(options.root ? resolve(context.cwd, options.root) : context.cwd)
  const configFile = options.configFile ? resolve(context.cwd, options.configFile) : undefined
  const loaded =
    options.configFile === false
      ? undefined
      : await loadConfigFromFile(
          { command: 'build', mode: 'production', isSsrBuild: false, isPreview: false },
          configFile,
          root
        )
  let sharedConfig = { ...(loaded?.config ?? {}) }
  const packageAlias = await inferredPackageAlias(sharedConfig, root)
  if (packageAlias) {
    sharedConfig = mergeConfig(sharedConfig, { resolve: { alias: [packageAlias] } })
  }
  delete sharedConfig.build
  delete sharedConfig.server
  delete sharedConfig.preview
  const engineConfig = {
    ...inlineConfig(context.cwd, context.basePath, { ...options, configFile: false }, plugin),
    // The demo bundle is emitted below the site's own asset directory. Vite 8
    // resolves preload dependencies from `base`, so using the site root here
    // would incorrectly request demo chunks from `/chunks` and `/assets`.
    base: baseUrl(context.basePath, '/assets/canofold-demos/'),
    mode: 'production',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    // The analysis Vite server may leave NODE_ENV=development in this process.
    // Keep JSX production-only without mutating the host's process environment.
    ...(Number.parseInt(viteVersion, 10) >= 8
      ? { oxc: { jsx: { development: false } } }
      : { esbuild: { jsxDev: false } }),
    build: {
      // Markdown browser modules are published as ES2022. Keep that baseline
      // when a component project does not declare its own Vite target.
      target: loaded?.config.build?.target ?? 'es2022',
      ...build
    }
  }
  return mergeConfig(sharedConfig, engineConfig) as InlineConfig
}

async function prepareDemos(context: CanofoldDemoPrepareContext, options: CanofoldViteOptions) {
  const projectRoot = canonicalPath(options.root ? resolve(context.cwd, options.root) : context.cwd)
  let demos: CanofoldPreparedDemo[] = []
  let setup: string | undefined
  const plugin = virtualClientPlugin({
    projectRoot,
    getDemos: () => demos,
    getSetup: () => setup
  })
  const server = await createViteServer({
    ...inlineConfig(context.cwd, context.basePath, options, plugin),
    // This server only resolves source files and walks Vite's module graph.
    // Dependency pre-bundling belongs to the long-lived dev server below; when
    // started here it can keep server.close() waiting after the analysis is done.
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false }
  })
  try {
    const collectDependencies = createDependencyCollector(server, context.cwd)
    demos = await resolveDemos(server, context.demos, collectDependencies)
    const resolved = await resolvedSetup(server, context.setup, context.cwd, collectDependencies)
    setup = resolved?.id
    return {
      demos,
      setup,
      dependencyPaths: [
        ...new Set([
          ...server.config.configFileDependencies.map((path) => canonicalPath(path)),
          ...(await projectMetadataPaths(projectRoot)),
          ...(resolved?.dependencyPaths ?? [])
        ])
      ],
      plugin
    }
  } finally {
    await server.close()
  }
}

function devSessionKey(context: CanofoldDemoPrepareContext, options: CanofoldViteOptions) {
  return JSON.stringify({
    cwd: canonicalPath(context.cwd),
    outputRoot: canonicalPath(context.outputRoot),
    basePath: context.basePath,
    root: options.root ?? null,
    configFile: options.configFile ?? null
  })
}

async function configDependencySignature(paths: readonly string[]) {
  const hash = createHash('sha256')
  for (const path of [...paths].map(canonicalPath).sort()) {
    hash.update(path)
    try {
      hash.update(await readFile(path))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      hash.update('\0missing')
    }
  }
  return hash.digest('hex')
}

async function devEnvironmentSignature(server: ViteDevServer, projectRoot: string) {
  return configDependencySignature([
    ...server.config.configFileDependencies,
    ...(await projectMetadataPaths(projectRoot))
  ])
}

function isGeneratedPath(context: CanofoldDemoPrepareContext, path: string) {
  const projectRelative = relative(canonicalPath(context.cwd), canonicalPath(path))
  const outputRelative = relative(canonicalPath(context.outputRoot), canonicalPath(path))
  return (
    projectRelative
      .split(sep)
      .some((segment) => segment === 'node_modules' || segment === '.git' || segment === '.canofold') ||
    (outputRelative !== '..' && !outputRelative.startsWith(`..${sep}`) && !isAbsolute(outputRelative))
  )
}

function createDevRuntime(host: HttpServer, session: DevSession): CanofoldDemoDevRuntime {
  const { server } = session
  let closing: Promise<void> | undefined
  const close = () => {
    if (!closing) {
      host.off('close', onHostClose)
      if (devSessions.get(host) === session) devSessions.delete(host)
      closing = server.close()
    }
    return closing
  }
  // Own the session from creation, even if the host fails before startDev()
  // can return a handle (for example, Markdown rendering or listen failures).
  const onHostClose = () => {
    void close().catch((error: unknown) => {
      server.config.logger.error(`Failed to close the Demo server: ${String(error)}`)
    })
  }
  host.once('close', onHostClose)
  return {
    middleware(request, response, next) {
      server.middlewares(request, response, next)
    },
    handlesFile(path) {
      return Boolean(server.moduleGraph.getModulesByFile(canonicalPath(path))?.size)
    },
    close
  }
}

async function prepareDevDemos(context: CanofoldDemoPrepareContext, options: CanofoldViteOptions) {
  if (!context.server) {
    throw new Error('@canofold/vite requires the shared Canofold HTTP server in dev mode')
  }
  const key = devSessionKey(context, options)
  const projectRoot = canonicalPath(options.root ? resolve(context.cwd, options.root) : context.cwd)
  let session = devSessions.get(context.server)
  let createdSession = false
  const environmentChanged =
    session?.key === key &&
    (await devEnvironmentSignature(session.server, projectRoot)) !== session.environmentSignature
  if (environmentChanged && session) {
    const previousConfig = session.server.config
    await session.server.restart()
    // Vite logs configuration errors and resolves restart() without replacing
    // its config. Do not acknowledge that failed restart or cache its inputs.
    if (session.server.config === previousConfig) {
      throw new Error('Vite config restart failed; fix the configuration error reported above')
    }
    session.environmentSignature = await devEnvironmentSignature(session.server, projectRoot)
  }
  if (session?.key !== key) {
    if (session?.runtime) await session.runtime.close()
    else if (session) await session.server.close()
    const state: DevSession['state'] = { demos: [] }
    const plugin = virtualClientPlugin({
      projectRoot,
      getDemos: () => state.demos,
      getSetup: () => state.setup
    })
    const configPaths = new Set<string>()
    const configLifecycle: Plugin = {
      name: 'canofold-dev-config',
      config(config) {
        return { logLevel: config.logLevel ?? 'warn', clearScreen: config.clearScreen ?? false }
      },
      configResolved(config) {
        configPaths.clear()
        config.configFileDependencies.forEach((path) => configPaths.add(canonicalPath(path)))
      }
    }
    const server = await createViteServer({
      ...inlineConfig(context.cwd, context.basePath, options, [plugin, configLifecycle]),
      server: {
        middlewareMode: true,
        ...(Number(viteVersion.split('.')[0]) >= 8
          ? { ws: { server: context.server } }
          : { hmr: { server: context.server } }),
        // The host watches the manifest's config dependencies and serializes
        // rebuilds. Only it may restart Vite; native config restarts would race
        // prepare() while the dependency optimizer is still processing modules.
        watch: {
          ignored: (path) => configPaths.has(canonicalPath(path)) || isGeneratedPath(context, path)
        }
      }
    })
    session = {
      key,
      environmentSignature: '',
      server,
      plugin,
      state
    }
    session.runtime = createDevRuntime(context.server, session)
    devSessions.set(context.server, session)
    createdSession = true
  }

  try {
    if (createdSession) {
      session.environmentSignature = await devEnvironmentSignature(session.server, projectRoot)
    }
    const wasInitialized = session.state.demos.length > 0 || session.state.setup !== undefined
    const previousSignature = JSON.stringify([
      session.state.demos.map((demo) => [demo.id, demo.modulePath]),
      session.state.setup
    ])
    const collectDependencies = createDependencyCollector(session.server, context.cwd)
    const demos = await resolveDemos(session.server, context.demos, collectDependencies)
    const setup = await resolvedSetup(session.server, context.setup, context.cwd, collectDependencies)
    // Walking Demo and setup modules can start dependency optimization in the
    // background. Finish those requests before a config change can restart Vite.
    await session.server.waitForRequestsIdle()
    session.state.demos = demos
    session.state.setup = setup?.id
    const nextSignature = JSON.stringify([
      session.state.demos.map((demo) => [demo.id, demo.modulePath]),
      session.state.setup
    ])
    if (wasInitialized && previousSignature !== nextSignature) {
      const module = session.server.moduleGraph.getModuleById(RESOLVED_CLIENT_ID)
      if (module) session.server.moduleGraph.invalidateModule(module)
      session.server.ws.send({ type: 'full-reload' })
    }
    return {
      demos,
      setup: session.state.setup,
      dependencyPaths: [
        ...new Set([
          ...session.server.config.configFileDependencies.map((path) => canonicalPath(path)),
          ...(await projectMetadataPaths(projectRoot)),
          ...(setup?.dependencyPaths ?? [])
        ])
      ],
      plugin: session.plugin
    }
  } catch (error) {
    // An existing session must survive a bad edit; a new session has no host
    // runtime yet and must not leak its watcher when initial analysis fails.
    if (createdSession) await session.runtime?.close()
    throw error
  }
}

async function outputPathsUnder(root: string, prefix: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = `${prefix}/${entry.name}`
      return entry.isDirectory() ? outputPathsUnder(join(root, entry.name), relativePath) : [relativePath]
    })
  )
  return paths.flat().sort()
}

/** Vite's public manifest distinguishes entry/static CSS from lazy Demo CSS. */
async function builtEntryStyles(context: CanofoldDemoPrepareContext): Promise<string[]> {
  const manifest = JSON.parse(
    await readFile(join(context.outputRoot, 'assets/canofold-demos/.vite/manifest.json'), 'utf8')
  ) as Manifest
  const entry = Object.keys(manifest).find((key) => manifest[key]!.file === 'index.js')
  if (!entry) throw new Error('Vite Demo manifest is missing the index.js entry')
  const visited = new Set<string>()
  const styles = new Set<string>()
  const visit = (key: string) => {
    if (visited.has(key)) return
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Vite Demo manifest is missing imported chunk ${key}`)
    visited.add(key)
    chunk.imports?.forEach(visit)
    chunk.css?.forEach((file) => styles.add(file))
  }
  visit(entry)
  return [...styles].map((file) => baseUrl(context.basePath, `/assets/canofold-demos/${file}`))
}

export function vite(options: CanofoldViteOptions = {}): CanofoldDemoEngine {
  return {
    id: '@canofold/vite',
    version: '4',
    cacheKey: {
      root: options.root ?? null,
      configFile: options.configFile ?? null
    },
    async prepare(context) {
      let styleUrls: string[] | undefined
      const prepared =
        context.mode === 'dev'
          ? await prepareDevDemos(context, options)
          : await prepareDemos(context, options)
      if (context.mode === 'build') {
        const build = demoBuildOptions(context)
        await viteBuild(await isolatedBuildConfig(context, options, prepared.plugin, build))
        styleUrls = await builtEntryStyles(context)
      }
      const clientUrl =
        context.mode === 'build'
          ? baseUrl(context.basePath, '/assets/canofold-demos/index.js')
          : baseUrl(context.basePath, `/@id/__x00__${PUBLIC_CLIENT_ID}`)
      const markdownClientUrl =
        context.mode === 'build'
          ? baseUrl(context.basePath, '/assets/canofold-demos/markdown.js')
          : baseUrl(context.basePath, `/@id/__x00__${PUBLIC_MARKDOWN_CLIENT_ID}`)
      return {
        clientUrl,
        ...(context.mode === 'dev' ? { hotReload: true as const } : {}),
        markdownClientUrl,
        styleUrls: styleUrls?.length ? styleUrls : undefined,
        demos: Object.fromEntries(prepared.demos.map((demo) => [demo.id, demo])),
        dependencyPaths: prepared.dependencyPaths,
        ...(context.mode === 'build'
          ? {
              outputPaths: await outputPathsUnder(
                join(context.outputRoot, 'assets/canofold-demos'),
                'assets/canofold-demos'
              )
            }
          : {})
      }
    },
    async startDev(context: CanofoldDemoDevContext) {
      const session = devSessions.get(context.server)
      if (!session?.runtime) {
        throw new Error('@canofold/vite dev session was not prepared on the shared HTTP server')
      }
      return session.runtime
    }
  }
}

export default vite
