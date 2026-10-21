import { readFile, readdir } from 'node:fs/promises'
import { resolve as resolveModule } from 'import-meta-resolve'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CanofoldConfig } from '../config/types'
import { documentationVersions } from '../config/versions'
import type { ContentGraph, DocPage } from '../content/types'
import { canofoldVersion } from '../version'
import { collectPageAssets } from '../render/siteAssets'
import { resolveThemeStylePath } from '../render/buildCss'
import { preparePageResources, type PageResources } from '../render/resources'
import { mapConcurrent } from '../utils/concurrency'
import { isInside, resolveProjectPath } from '../utils/paths'
import { fingerprint, fingerprintBytes } from './fingerprint'
import { BUILD_MANIFEST_SCHEMA_VERSION, type BuildManifest } from './types'
import type { CanofoldDemoManifest } from '../demos/types'

const SUPPORT_FILE_CONCURRENCY = 16

function portablePath(cwd: string, path: string) {
  return relative(resolve(cwd), resolve(path)).replace(/\\/g, '/')
}

/** Stable manifest identity for pages whose source file can appear in multiple versions. */
export function buildPageKey(page: Pick<DocPage, 'version' | 'sourceRelativePath' | 'locale' | 'origin'>) {
  return JSON.stringify(
    page.origin
      ? [page.version, page.locale, page.origin.kind, page.origin.id, page.origin.key]
      : [page.version, page.sourceRelativePath]
  )
}

async function supportFilesUnder(root: string): Promise<string[]> {
  async function walk(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true })
    return (
      await Promise.all(
        entries.map(async (entry) => {
          const path = join(directory, entry.name)
          if (entry.isDirectory()) return walk(path)
          if (entry.isSymbolicLink()) {
            throw new Error(
              `Documentation support files must not use symbolic links: ${portablePath(root, path)}`
            )
          }
          if (!entry.isFile() || /\.mdx?$/i.test(entry.name)) return []
          return [path]
        })
      )
    ).flat()
  }
  return walk(root)
}

export async function fingerprintExistingFiles(paths: string[]) {
  const unique = [...new Set(paths.map((path) => resolve(path)))].sort()
  const entries = (
    await mapConcurrent(unique, SUPPORT_FILE_CONCURRENCY, async (path) => {
      try {
        return { path, fingerprint: fingerprintBytes(await readFile(path)) }
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
        return null
      }
    })
  ).filter((entry): entry is { path: string; fingerprint: string } => entry !== null)
  return fingerprint(entries)
}

async function runtimeFingerprint() {
  const runtimeDirs = ['canofold', '@canofold/markdown/server'].map((specifier) =>
    dirname(fileURLToPath(resolveModule(specifier, import.meta.url)))
  )
  const files = (await Promise.all(runtimeDirs.map(supportFilesUnder))).flat()
  // Types and source maps cannot change rendered output. All JS, styles and
  // runtime assets can, including linked Markdown packages at the same version.
  return fingerprintExistingFiles(files.filter((path) => !/\.(?:map|d\.(?:ts|mts|cts))$/.test(path)))
}

async function supportFingerprint(cwd: string, config: CanofoldConfig, pageDependencies: Set<string>) {
  const docsRoots = [...new Set(documentationVersions(config).map((version) => version.docsDir))].map(
    (docsDir) => resolveProjectPath(cwd, docsDir, 'docsDir')
  )
  const supportFiles = (await Promise.all(docsRoots.map((root) => supportFilesUnder(root)))).flat()
  const styles = new Set<string>()
  for (const style of config.styles) {
    styles.add(resolveProjectPath(cwd, style, 'styles'))
  }
  for (const style of config.themes.flatMap((theme) => theme.styles)) {
    styles.add(resolveThemeStylePath(cwd, style))
  }
  const uniqueFiles = [...new Set([...supportFiles, ...styles].map((path) => resolve(path)))]
    .filter(
      (path) =>
        styles.has(path) ||
        docsRoots.some((root) => isInside(join(root, 'public'), path)) ||
        !pageDependencies.has(path)
    )
    .sort()
  const entries = await mapConcurrent(uniqueFiles, SUPPORT_FILE_CONCURRENCY, async (path) => ({
    path: portablePath(cwd, path),
    fingerprint: fingerprintBytes(await readFile(path))
  }))
  return fingerprint(entries)
}

function serializablePage(page: DocPage) {
  return {
    sourceRelativePath: page.sourceRelativePath,
    sourceRevision: page.sourceRevision,
    origin: page.origin ?? null,
    relativePath: page.relativePath,
    version: page.version,
    versionBase: page.versionBase,
    docsDir: page.docsDir,
    locale: page.locale,
    routePath: page.routePath,
    outputPath: page.outputPath,
    markdownOutputPath: page.markdownOutputPath,
    title: page.title,
    description: page.description,
    order: page.order,
    group: page.group,
    navigation: page.navigation,
    status: page.status,
    search: page.search,
    ai: page.ai,
    body: page.body,
    transformedSource: page.transformedSource,
    headings: page.headings,
    searchText: page.searchText,
    excerpt: page.excerpt,
    codeExamples: page.codeExamples,
    references: page.references,
    demos: page.demos,
    lastUpdated: page.lastUpdated,
    ...(page.previous ? { previous: page.previous } : {}),
    ...(page.next ? { next: page.next } : {}),
    frontmatter: page.frontmatter
  }
}

function pageLayoutContext(graph: ContentGraph, page: DocPage) {
  return {
    sidebar: graph.sidebar[page.version]?.[page.locale] ?? [],
    nav: graph.nav[page.version]?.[page.locale] ?? [],
    locales: graph.locales,
    defaultLocale: graph.defaultLocale,
    versions: graph.versions,
    currentVersion: graph.currentVersion
  }
}

function serializableConfig(config: CanofoldConfig) {
  const provider = config.search.provider
  return {
    ...config,
    sources: config.sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      revision: source.revision,
      root: source.root,
      entry: source.entry,
      version: source.version,
      locale: source.locale,
      base: source.base,
      cacheKey: source.cacheKey
    })),
    demos: {
      setup: config.demos.setup ?? null,
      engine: config.demos.engine
        ? {
            id: config.demos.engine.id,
            version: config.demos.engine.version ?? '',
            cacheKey: config.demos.engine.cacheKey ?? null
          }
        : null
    },
    markdown: {
      ...config.markdown,
      plugins: config.markdown.plugins.map((plugin) => ({
        name: plugin.name,
        version: plugin.version ?? '',
        cacheKey: plugin.cacheKey ?? null
      }))
    },
    search: {
      ...config.search,
      provider:
        typeof provider === 'string'
          ? provider
          : {
              id: provider.id,
              client: provider.client,
              version: provider.version ?? '',
              cacheKey: provider.cacheKey ?? null
            }
    }
  }
}

export async function createBuildManifest(
  cwd: string,
  config: CanofoldConfig,
  graph: ContentGraph,
  extensionFingerprint = fingerprint({ extensions: [] }),
  demoManifest?: CanofoldDemoManifest,
  demoDelivery: 'build' | 'dev' | 'dev-request' = 'build',
  resources?: PageResources
): Promise<BuildManifest> {
  const pageResources = resources ?? (await preparePageResources(cwd, config, graph))
  // A component library's barrel can make hundreds of Demos share the same
  // files. Share reads within this build only; the next build must read again.
  const dependencyFingerprints = new Map<string, Promise<{ path: string; fingerprint: string }>>()
  const fingerprintDependency = (path: string) => {
    const absolutePath = resolve(path)
    let entry = dependencyFingerprints.get(absolutePath)
    if (!entry) {
      entry = readFile(absolutePath).then((source) => ({
        path: portablePath(cwd, absolutePath),
        fingerprint: fingerprintBytes(source)
      }))
      dependencyFingerprints.set(absolutePath, entry)
    }
    return entry
  }
  const dependenciesByPage = new Map<string, Array<{ path: string; fingerprint: string }>>()
  const hotDependencies = new Set<string>()
  const contentDependencies = new Set<string>([
    ...config.styles.map((style) => resolveProjectPath(cwd, style, 'styles')),
    ...config.themes.flatMap((theme) => theme.styles.map((style) => resolveThemeStylePath(cwd, style)))
  ])
  const usesHotReload = demoDelivery !== 'build' && demoManifest?.hotReload === true
  const assetPathsByPage = new Map<string, string[]>()
  await mapConcurrent(graph.pages, SUPPORT_FILE_CONCURRENCY, async (page) => {
    const assets = await collectPageAssets(cwd, [page])
    contentDependencies.add(page.sourcePath)
    assets.forEach((asset) => contentDependencies.add(asset.source))
    page.origin?.dependencies.forEach(({ path }) => contentDependencies.add(resolve(cwd, path)))
    assetPathsByPage.set(buildPageKey(page), [...new Set(assets.map((asset) => asset.outputPath))].sort())
    const paths = pageResources.get(page)!.dependencyPaths
    const dependencies = await mapConcurrent(paths, SUPPORT_FILE_CONCURRENCY, fingerprintDependency)
    paths.forEach((path) => contentDependencies.add(path))
    dependencies.push(
      ...(page.origin?.dependencies ?? []).map(({ path, revision }) => ({ path, fingerprint: revision }))
    )
    const demoDependencyPaths = new Set<string>()
    for (const reference of page.demos) {
      const demo = demoManifest?.demos[reference.id]
      if (!demo) continue
      const demoDependencies = demo.dependencyPaths?.length ? demo.dependencyPaths : [demo.modulePath]
      if (usesHotReload) {
        demoDependencies.forEach((path) => hotDependencies.add(path))
        demoDependencyPaths.add(demo.modulePath)
      } else {
        demoDependencies.forEach((path) => demoDependencyPaths.add(path))
      }
    }
    dependencies.push(
      ...(await mapConcurrent([...demoDependencyPaths], SUPPORT_FILE_CONCURRENCY, fingerprintDependency))
    )
    if (dependencies.length === 0) return
    dependenciesByPage.set(
      buildPageKey(page),
      [...new Map(dependencies.map((dependency) => [dependency.path, dependency])).values()].sort((a, b) =>
        a.path.localeCompare(b.path)
      )
    )
  })
  const pageDependencyPaths = new Set([
    ...[...hotDependencies].map((path) => resolve(cwd, path)),
    ...[...dependenciesByPage.values()].flat().map((dependency) => resolve(cwd, dependency.path))
  ])
  const configFingerprint = fingerprint(serializableConfig(config))
  const sharedFingerprint = fingerprint({
    canofoldVersion,
    runtimeFingerprint: await runtimeFingerprint(),
    configFingerprint,
    benchmarkReport: process.env.CANOFOLD_BENCHMARK_REPORT === '1',
    extensionFingerprint,
    math: [...pageResources.values()].some(({ assets }) => assets.math),
    playground: graph.pages.some((page) => page.frontmatter.layout === 'playground'),
    support: await supportFingerprint(cwd, config, pageDependencyPaths),
    demoDelivery: demoManifest ? demoDelivery : null,
    htmlDelivery: demoDelivery === 'dev-request' ? 'request' : 'static',
    hotReload: usesHotReload,
    demoRuntime: demoManifest
      ? {
          clientUrl: demoManifest.clientUrl,
          markdownClientUrl: demoManifest.markdownClientUrl ?? null,
          styleUrls: demoManifest.styleUrls ?? [],
          outputPaths: demoManifest.outputPaths ?? []
        }
      : null,
    demoEngineDependencies: await fingerprintExistingFiles(demoManifest?.dependencyPaths ?? [])
  })
  const layoutFingerprints = new Map<string, string>()
  const pages = Object.fromEntries(
    graph.pages.map((page) => {
      const scope = JSON.stringify([page.version, page.locale])
      let layout = layoutFingerprints.get(scope)
      if (!layout) {
        layout = fingerprint(pageLayoutContext(graph, page))
        layoutFingerprints.set(scope, layout)
      }
      return [
        buildPageKey(page),
        {
          fingerprint: fingerprint({
            page: serializablePage(page),
            localComponents: dependenciesByPage.get(buildPageKey(page)) ?? [],
            layout
          }),
          outputPath: page.outputPath,
          markdownOutputPath: page.markdownOutputPath,
          assetOutputPaths: assetPathsByPage.get(buildPageKey(page))!
        }
      ]
    })
  )
  const buildFingerprint = fingerprint({ sharedFingerprint, pages })
  return {
    schemaVersion: BUILD_MANIFEST_SCHEMA_VERSION,
    canofoldVersion,
    buildFingerprint,
    sharedFingerprint,
    contentDependencyPaths: [...contentDependencies].map((path) => portablePath(cwd, path)).sort(),
    pages,
    outputs: {}
  }
}
