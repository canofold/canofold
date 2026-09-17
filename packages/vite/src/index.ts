import { realpathSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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

export interface CanofoldViteOptions {
  /** Project root passed to Vite. Defaults to the Canofold project root. */
  root?: string
  /** Vite config file. Use false to disable config discovery. */
  configFile?: string | false
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

function virtualClientPlugin({
  getDemos,
  getSetup,
  styleUrls = []
}: {
  getDemos: () => readonly CanofoldPreparedDemo[]
  getSetup: () => string | undefined
  styleUrls?: readonly string[]
}): Plugin {
  return {
    name: 'canofold-demo-client',
    enforce: 'post',
    resolveId(id) {
      return id === PUBLIC_CLIENT_ID ? RESOLVED_CLIENT_ID : undefined
    },
    load(id) {
      if (id !== RESOLVED_CLIENT_ID) return undefined
      const entries: string[] = []
      const registry: string[] = []
      getDemos().forEach((demo, index) => {
        const binding = `CanofoldDemo${index}`
        entries.push(`import * as ${binding} from ${JSON.stringify(normalizePath(demo.modulePath))};`)
        registry.push(`[${JSON.stringify(demo.id)}, ${binding}]`)
      })
      entries.push(`const CANOFOLD_DEMO_REGISTRY = [${registry.join(',')}];`)
      const setup = getSetup()
      const setupImport = setup ? `import CanofoldDemoSetup from ${JSON.stringify(setup)};` : undefined
      return demoRuntimeSource(entries, setupImport, styleUrls)
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
    cssCodeSplit: false,
    rollupOptions: {
      external: () => false,
      input: PUBLIC_CLIENT_ID,
      output: {
        format: 'es',
        inlineDynamicImports: true,
        entryFileNames: 'index.js',
        assetFileNames: (asset) =>
          asset.names?.some((name) => name.endsWith('.css')) ? 'styles.css' : '[name][extname]'
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
  const sharedConfig = { ...(loaded?.config ?? {}) }
  delete sharedConfig.build
  delete sharedConfig.server
  delete sharedConfig.preview
  const engineConfig = {
    ...inlineConfig(context.cwd, context.basePath, { ...options, configFile: false }, plugin),
    mode: 'production',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    esbuild: {
      jsxDev: false
    },
    build
  }
  return mergeConfig(sharedConfig, engineConfig) as InlineConfig
}

async function prepareDemos(context: CanofoldDemoPrepareContext, options: CanofoldViteOptions) {
  let demos: CanofoldPreparedDemo[] = []
  let setup: string | undefined
  const plugin = virtualClientPlugin({
    getDemos: () => demos,
    getSetup: () => setup,
    styleUrls:
      context.mode === 'build' ? [baseUrl(context.basePath, '/assets/canofold-demos/styles.css')] : []
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
          ...(resolved?.dependencyPaths ?? [])
        ])
      ],
      plugin
    }
  } finally {
    await server.close()
  }
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
      const prepared = await prepareDemos(context, options)
      if (context.mode === 'build') {
        const build = demoBuildOptions(context)
        await viteBuild(await isolatedBuildConfig(context, options, prepared.plugin, build))
        await writeFile(join(context.outputRoot, 'assets/canofold-demos/styles.css'), '', {
          flag: 'a'
        })
      }
      return {
        clientUrl:
          context.mode === 'build'
            ? baseUrl(context.basePath, '/assets/canofold-demos/index.js')
            : baseUrl(context.basePath, `/@id/__x00__${PUBLIC_CLIENT_ID}`),
        ...(context.mode === 'build'
          ? { styleUrls: [baseUrl(context.basePath, '/assets/canofold-demos/styles.css')] }
          : {}),
        demos: Object.fromEntries(prepared.demos.map((demo) => [demo.id, demo])),
        dependencyPaths: prepared.dependencyPaths,
        ...(context.mode === 'build'
          ? {
              outputPaths: ['assets/canofold-demos/index.js', 'assets/canofold-demos/styles.css']
            }
          : {})
      }
    },
    async startDev(context: CanofoldDemoDevContext) {
      const currentDemos = () => context.getDemos()
      let setup: string | undefined
      const plugin = virtualClientPlugin({ getDemos: currentDemos, getSetup: () => setup })
      const server = await createViteServer({
        ...inlineConfig(context.cwd, context.basePath, options, plugin),
        server: {
          middlewareMode: true,
          hmr: { server: context.server },
          watch: { ignored: (path) => context.shouldIgnorePath(path) }
        }
      })
      setup = (await resolvedSetup(server, context.setup, context.cwd))?.id
      let demoSignature = JSON.stringify(
        currentDemos().map((demo) => [demo.id, normalizePath(demo.modulePath)])
      )
      return {
        middleware(request, response, next) {
          server.middlewares(request, response, next)
        },
        handlesFile(path) {
          const absolutePath = canonicalPath(path)
          const isEntry = currentDemos().some((demo) => canonicalPath(demo.modulePath) === absolutePath)
          if (isEntry || (setup && canonicalPath(filePathFromResolvedId(setup)) === absolutePath)) {
            return false
          }
          return Boolean(server.moduleGraph.getModulesByFile(absolutePath)?.size)
        },
        update() {
          const nextSignature = JSON.stringify(
            currentDemos().map((demo) => [demo.id, normalizePath(demo.modulePath)])
          )
          if (nextSignature === demoSignature) return
          demoSignature = nextSignature
          const module = server.moduleGraph.getModuleById(RESOLVED_CLIENT_ID)
          if (module) server.moduleGraph.invalidateModule(module)
          server.ws.send({ type: 'full-reload' })
        },
        close: () => server.close()
      }
    }
  }
}

export default vite
