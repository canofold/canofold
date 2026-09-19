import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { access, readFile, readdir } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Server as HttpServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import type {
  CanofoldDemoDevContext,
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
  type ModuleNode,
  type Plugin,
  type ViteDevServer
} from 'vite'
import { demoRuntimeSource } from './runtime'

const PUBLIC_CLIENT_ID = 'virtual:canofold-demo-client'
const RESOLVED_CLIENT_ID = `\0${PUBLIC_CLIENT_ID}`
const PUBLIC_MARKDOWN_CLIENT_ID = 'virtual:canofold-markdown-client'
const RESOLVED_MARKDOWN_CLIENT_ID = `\0${PUBLIC_MARKDOWN_CLIENT_ID}`
const PACKAGE_MODULE_PATH = fileURLToPath(import.meta.url)
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
  state: {
    demos: CanofoldPreparedDemo[]
    setup?: string
  }
}

const devSessions = new WeakMap<HttpServer, DevSession>()

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

function isProjectSource(cwd: string, path: string) {
  const projectRelative = relative(canonicalPath(cwd), canonicalPath(path))
  return (
    projectRelative !== '..' &&
    !projectRelative.startsWith(`..${sep}`) &&
    !isAbsolute(projectRelative) &&
    !projectRelative.split(sep).some((segment) => segment === 'node_modules' || segment === '.canofold')
  )
}

function moduleRequestUrl(server: ViteDevServer, modulePath: string) {
  const rootRelative = relative(canonicalPath(server.config.root), canonicalPath(modulePath))
  if (rootRelative !== '..' && !rootRelative.startsWith(`..${sep}`) && !isAbsolute(rootRelative)) {
    return `/${normalizePath(rootRelative)}`
  }
  return `/@fs/${normalizePath(modulePath)}`
}

async function collectLocalDependencies(server: ViteDevServer, modulePath: string, cwd: string) {
  await server.transformRequest(moduleRequestUrl(server, modulePath))
  const first =
    server.moduleGraph.getModuleById(normalizePath(modulePath)) ??
    server.moduleGraph.getModulesByFile(modulePath)?.values().next().value
  const visited = new Set<string>()
  const dependencies = new Set<string>()

  async function visit(module: ModuleNode | undefined): Promise<void> {
    if (!module) return
    const key = module.id ?? module.url
    if (visited.has(key)) return
    visited.add(key)
    if (!module.file || !isProjectSource(cwd, module.file)) return
    dependencies.add(canonicalPath(module.file))
    await server.transformRequest(module.url)
    await Promise.all([...module.importedModules].map((dependency) => visit(dependency)))
  }

  await visit(first)
  return [...dependencies].sort()
}

async function resolveDemo(
  server: ViteDevServer,
  reference: CanofoldDemoReference,
  cwd: string
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
  if (!isProjectSource(cwd, modulePath)) {
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
    dependencyPaths: await collectLocalDependencies(server, modulePath, cwd),
    source,
    language: languageFor(modulePath)
  }
}

async function resolvedSetup(server: ViteDevServer, setup: string | undefined, cwd: string) {
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
  if (!isProjectSource(cwd, modulePath)) {
    throw new Error(`demos.setup ${JSON.stringify(setup)} must resolve inside the Canofold project root`)
  }
  return {
    id: normalizePath(resolved.id),
    dependencyPaths: await collectLocalDependencies(server, modulePath, cwd)
  }
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
      return demoRuntimeSource(entries, setupImport, PUBLIC_MARKDOWN_CLIENT_ID)
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
  return {
    root: canonicalPath(options.root ? resolve(cwd, options.root) : cwd),
    configFile,
    base: basePath,
    appType: 'custom' as const,
    plugins: Array.isArray(plugins) ? plugins : [plugins],
    // The dev server ships native ESM to the current browser. Avoid asking
    // esbuild to lower dependency syntax that its transformer cannot lower.
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
    resolve: { dedupe: ['react', 'react-dom'] }
  }
}

function demoBuildOptions(context: CanofoldDemoPrepareContext): BuildOptions {
  return {
    // The project may itself be a Vite library. Demos are a browser app and
    // must not inherit library externals or output conventions.
    lib: false,
    minify: 'esbuild',
    outDir: join(context.outputRoot, 'assets/canofold-demos'),
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: true,
    rollupOptions: {
      external: () => false,
      // Canofold loads both browser entries with dynamic import() and consumes
      // their named exports. Vite's application default may otherwise remove
      // entry exports that are not referenced inside the bundle.
      preserveEntrySignatures: 'strict',
      input: {
        index: PUBLIC_CLIENT_ID,
        markdown: PUBLIC_MARKDOWN_CLIENT_ID
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
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
    esbuild: {
      jsxDev: false
    },
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
    demos = await Promise.all(context.demos.map((reference) => resolveDemo(server, reference, context.cwd)))
    const resolved = await resolvedSetup(server, context.setup, context.cwd)
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

async function prepareDevDemos(context: CanofoldDemoPrepareContext, options: CanofoldViteOptions) {
  if (!context.server) {
    throw new Error('@canofold/vite requires the shared Canofold HTTP server in dev mode')
  }
  const key = devSessionKey(context, options)
  const projectRoot = canonicalPath(options.root ? resolve(context.cwd, options.root) : context.cwd)
  let session = devSessions.get(context.server)
  const environmentChanged =
    session?.key === key &&
    (await devEnvironmentSignature(session.server, projectRoot)) !== session.environmentSignature
  if (environmentChanged && session) {
    await session.server.restart(true)
    session.environmentSignature = await devEnvironmentSignature(session.server, projectRoot)
  }
  if (session?.key !== key) {
    if (session) await session.server.close()
    const state: DevSession['state'] = { demos: [] }
    const plugin = virtualClientPlugin({
      projectRoot,
      getDemos: () => state.demos,
      getSetup: () => state.setup
    })
    const server = await createViteServer({
      ...inlineConfig(context.cwd, context.basePath, options, plugin),
      server: {
        middlewareMode: true,
        hmr: { server: context.server },
        watch: { ignored: (path) => isGeneratedPath(context, path) }
      }
    })
    session = {
      key,
      environmentSignature: await devEnvironmentSignature(server, projectRoot),
      server,
      plugin,
      state
    }
    devSessions.set(context.server, session)
  }

  const wasInitialized = session.state.demos.length > 0 || session.state.setup !== undefined
  const previousSignature = JSON.stringify([
    session.state.demos.map((demo) => [demo.id, demo.modulePath]),
    session.state.setup
  ])
  const demos = await Promise.all(
    context.demos.map((reference) => resolveDemo(session.server, reference, context.cwd))
  )
  const setup = await resolvedSetup(session.server, context.setup, context.cwd)
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

export function vite(options: CanofoldViteOptions = {}): CanofoldDemoEngine {
  return {
    id: '@canofold/vite',
    version: '2',
    cacheKey: {
      root: options.root ?? null,
      configFile: options.configFile ?? null
    },
    async prepare(context) {
      const prepared =
        context.mode === 'dev'
          ? await prepareDevDemos(context, options)
          : await prepareDemos(context, options)
      if (context.mode === 'build') {
        const build = demoBuildOptions(context)
        await viteBuild(await isolatedBuildConfig(context, options, prepared.plugin, build))
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
        markdownClientUrl,
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
      if (!session) {
        throw new Error('@canofold/vite dev session was not prepared on the shared HTTP server')
      }
      const { server } = session
      return {
        middleware(request, response, next) {
          server.middlewares(request, response, next)
        },
        handlesFile(path) {
          const absolutePath = canonicalPath(path)
          return Boolean(server.moduleGraph.getModulesByFile(absolutePath)?.size)
        },
        async close() {
          if (devSessions.get(context.server) === session) {
            devSessions.delete(context.server)
          }
          await server.close()
        }
      }
    }
  }
}

export default vite
