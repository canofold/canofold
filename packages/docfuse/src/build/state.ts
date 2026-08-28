import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DocfuseConfig } from '../config/types'
import { isMdxPath } from '../content/fileKinds'
import type { ContentGraph, DocPage } from '../content/types'
import { docfuseVersion } from '../version'
import { pageAssetOutputPathsFor } from '../render/siteAssets'
import { localComponentDependencyPaths } from '../render/localComponents'
import { prepareMdxSource } from '../markdown/importBoundary'
import { mapConcurrent } from '../utils/concurrency'
import { resolveProjectPath } from '../utils/paths'
import { detectMarkdownAssets } from '@docfuse/markdown/server/analyze'
import { fingerprint, fingerprintBytes } from './fingerprint'
import { BUILD_MANIFEST_SCHEMA_VERSION, type BuildManifest } from './types'

const SUPPORT_FILE_CONCURRENCY = 16

function portablePath(cwd: string, path: string) {
  return relative(resolve(cwd), resolve(path)).replace(/\\/g, '/')
}

/** Stable manifest identity for pages whose source file can appear in multiple versions. */
export function buildPageKey(page: Pick<DocPage, 'version' | 'sourceRelativePath'>) {
  return JSON.stringify([page.version, page.sourceRelativePath])
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

async function filesUnderIfPresent(root: string) {
  try {
    return await supportFilesUnder(root)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

async function runtimeFingerprint() {
  // tsup emits flat chunks under dist/, so import.meta.url is dist/chunk-*.js.
  // Tests import this file from src/build/. Hash whatever actually exists beside us.
  const here = dirname(fileURLToPath(import.meta.url))
  const markdownFiles: string[] = []
  try {
    const markdownTheme = fileURLToPath(import.meta.resolve('@docfuse/markdown/theme'))
    const markdownDir = dirname(markdownTheme)
    markdownFiles.push(
      join(markdownDir, 'tokens.css'),
      join(markdownDir, 'styles.css'),
      join(markdownDir, 'theme.css'),
      join(markdownDir, 'base.css'),
      markdownTheme
    )
  } catch {
    // Tests and incomplete installs still fingerprint the local renderer.
  }
  return fingerprintExistingFiles([
    ...(await filesUnderIfPresent(here)),
    ...(await filesUnderIfPresent(join(here, 'render'))),
    ...(await filesUnderIfPresent(fileURLToPath(new URL('../render', import.meta.url)))),
    ...markdownFiles
  ])
}

async function supportFingerprint(cwd: string, config: DocfuseConfig, pageDependencies: Set<string>) {
  const docsRoots = [...new Set(config.versions.items.map((version) => version.docsDir))].map((docsDir) =>
    resolveProjectPath(cwd, docsDir, 'docsDir')
  )
  const supportFiles = (await Promise.all(docsRoots.map((root) => supportFilesUnder(root)))).flat()
  for (const style of config.styles) {
    supportFiles.push(resolveProjectPath(cwd, style, 'styles'))
  }
  const uniqueFiles = [...new Set(supportFiles.map((path) => resolve(path)))]
    .filter((path) => !pageDependencies.has(path))
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
    status: page.status,
    search: page.search,
    ai: page.ai,
    body: page.body,
    transformedSource: page.transformedSource,
    headings: page.headings,
    searchText: page.searchText,
    codeExamples: page.codeExamples,
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

function serializableConfig(config: DocfuseConfig) {
  const provider = config.search.provider
  return {
    ...config,
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
  config: DocfuseConfig,
  graph: ContentGraph,
  extensionFingerprint = fingerprint({ extensions: [] })
): Promise<BuildManifest> {
  const dependenciesByPage = new Map<string, Array<{ path: string; fingerprint: string }>>()
  await mapConcurrent(graph.pages, SUPPORT_FILE_CONCURRENCY, async (page) => {
    if (!isMdxPath(page.relativePath)) return
    const imports = prepareMdxSource(page.body).imports
    const paths = await localComponentDependencyPaths(imports, page.sourcePath, cwd)
    const dependencies = await mapConcurrent(paths, SUPPORT_FILE_CONCURRENCY, async (path) => ({
      path: portablePath(cwd, path),
      fingerprint: fingerprintBytes(await readFile(path))
    }))
    dependenciesByPage.set(
      buildPageKey(page),
      dependencies.sort((a, b) => a.path.localeCompare(b.path))
    )
  })
  const pageDependencyPaths = new Set(
    [...dependenciesByPage.values()].flat().map((dependency) => resolve(cwd, dependency.path))
  )
  const configFingerprint = fingerprint(serializableConfig(config))
  const sharedFingerprint = fingerprint({
    docfuseVersion,
    runtimeFingerprint: await runtimeFingerprint(),
    configFingerprint,
    benchmarkReport: process.env.DOCFUSE_BENCHMARK_REPORT === '1',
    extensionFingerprint,
    math: graph.pages.some(
      (page) =>
        detectMarkdownAssets(
          page.body,
          config.markdown.plugins,
          isMdxPath(page.relativePath) ? 'mdx' : 'markdown'
        ).math
    ),
    playground: graph.pages.some((page) => page.frontmatter.layout === 'playground'),
    support: await supportFingerprint(cwd, config, pageDependencyPaths)
  })
  const pages = Object.fromEntries(
    graph.pages.map((page) => [
      buildPageKey(page),
      {
        fingerprint: fingerprint({
          page: serializablePage(page),
          localComponents: dependenciesByPage.get(buildPageKey(page)) ?? [],
          layout: pageLayoutContext(graph, page)
        }),
        outputPath: page.outputPath,
        markdownOutputPath: page.markdownOutputPath,
        assetOutputPaths: [...pageAssetOutputPathsFor([page])].sort()
      }
    ])
  )
  const buildFingerprint = fingerprint({ sharedFingerprint, pages })
  return {
    schemaVersion: BUILD_MANIFEST_SCHEMA_VERSION,
    docfuseVersion,
    buildFingerprint,
    sharedFingerprint,
    pages,
    outputs: {}
  }
}
