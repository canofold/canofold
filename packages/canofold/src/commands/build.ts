import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import type { Server as HttpServer } from 'node:http'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { writeAiOutputs } from '../ai/writeAiOutputs'
import { loadConfig } from '../config/load'
import type { CanofoldConfig } from '../config/types'
import { buildContentGraph } from '../content/graph'
import { writeRedirects } from '../content/redirects'
import type { ContentGraph, DocPage } from '../content/types'
import { canofoldVersion } from '../version'
import { renderSite, type PreviousPageOutput } from '../render/renderSite'
import { preparePageResources, type PageResources } from '../render/resources'
import { writeSearchIndexes } from '../search/index'
import { writeRobots } from '../seo/robots'
import { writeSitemap } from '../seo/sitemap'
import { logSuccess } from '../utils/logger'
import {
  assertProjectPath,
  pathExists,
  portablePathKey,
  resolveOutputPath,
  resolveOutputRoot
} from '../utils/paths'
import { createMarkdownRenderer, type MarkdownRenderer } from '@canofold/markdown/server'
import { satisfies, valid, validRange } from 'semver'
import {
  readBuildManifest,
  resolveBuildCacheRoot,
  resolveBuildTemporaryRoot,
  withBuildLock,
  writeBuildCacheJson,
  type AssertBuildLockOwned,
  writeBuildManifest
} from '../build/cache'
import { planBuild } from '../build/invalidation'
import { captureBuildOutputs, copyBuildOutputs, verifyBuildOutputs } from '../build/outputs'
import { buildPageKey, createBuildManifest } from '../build/state'
import type { BuildMode, PageBuildState } from '../build/types'
import { createBuildReport, type BuildReport } from '../build/report'
import { outputBackupRoot, resolveSafeOutputRoot } from '../build/safety'
import { loadExtensionHost, type ExtensionHost } from '../extensions/host'
import { prepareDemoManifest } from '../demos/prepare'
import type { CanofoldDemoManifest } from '../demos/types'
import { checkContentGraph } from '../check/project'
import { ContentDiagnosticsError, formatDiagnostic, type CheckDiagnostic } from '../check/diagnostics'

export interface BuildOptions {
  cwd: string
  /** @internal Reused by the dev server so preparation caches survive rebuilds. */
  renderer?: MarkdownRenderer
  /** Ignore the previous manifest and perform a clean build. A fresh manifest is still written. */
  noCache?: boolean
  /** Force a clean build because a caller observed an event outside the incremental contract. */
  forceClean?: boolean
  /** @internal The dev server requests browser modules without emitting a production bundle. */
  demoMode?: 'build' | 'dev'
  /** @internal Shared listener used by browser tooling during development. */
  demoServer?: HttpServer
  /** @internal The dev server renders requested HTML from the validated graph. */
  renderHtml?: boolean
  /** @internal Validated startup config; subsequent rebuilds load it afresh. */
  config?: CanofoldConfig
}

export interface BuildResult {
  config: CanofoldConfig
  graph: ContentGraph
  incremental: boolean
  cached: boolean
  mode: BuildMode
  changedPages: string[]
  /** True only when exactly one existing route changed without renaming or deleting outputs. */
  partialReload: boolean
  reason: string
  report: BuildReport
  demoManifest?: CanofoldDemoManifest
  /** Inputs whose changes require document rendering even if an engine also imports them. */
  contentDependencyPaths: string[]
  /** Whether this revision materialized document HTML for whole-site consumers. */
  renderHtml: boolean
}

export function versionSatisfies(version: string, range: string) {
  if (!valid(version)) throw new Error(`Invalid Canofold version: ${version}`)
  if (!validRange(range)) throw new Error(`Invalid requiredVersion range: ${range}`)
  return satisfies(version, range)
}

function assertRequiredVersion(config: CanofoldConfig) {
  if (config.requiredVersion && !versionSatisfies(canofoldVersion, config.requiredVersion)) {
    throw new Error(`Canofold ${canofoldVersion} does not satisfy requiredVersion ${config.requiredVersion}`)
  }
}

function logBuildReport(options: BuildOptions, report: BuildReport, outputDir: string) {
  if (options.demoMode === 'dev' && report.cacheHit) return
  logSuccess(
    `${report.cacheHit ? 'Reused' : 'Built'} ${outputDir} · ${report.pages} pages · ${report.durationMs} ms (${report.mode})`
  )
}

async function writeBuildOutputs({
  cwd,
  config,
  graph,
  pages,
  previousPages,
  renderer,
  writeSharedAssets,
  extensions,
  demoManifest,
  renderHtml,
  resources
}: {
  cwd: string
  config: CanofoldConfig
  graph: ContentGraph
  pages: DocPage[]
  previousPages?: PreviousPageOutput[]
  renderer: MarkdownRenderer
  writeSharedAssets: boolean
  extensions: ExtensionHost
  demoManifest?: CanofoldDemoManifest
  renderHtml?: boolean
  resources: PageResources
}) {
  await renderSite({
    cwd,
    config,
    graph,
    pages,
    previousPages,
    renderer,
    writeSharedAssets,
    demoManifest,
    renderHtml,
    resources
  })
  await writeSearchIndexes(cwd, config, graph)
  await writeSitemap(cwd, config, graph)
  await writeRobots(cwd, config)
  await writeAiOutputs(cwd, config, graph)
  await writeRedirects(cwd, config, graph)
  await extensions.generate(resolveOutputRoot(cwd, config.outputDir), graph.pages)

  if (process.env.CANOFOLD_BENCHMARK_REPORT === '1') {
    await writeFile(
      join(resolveOutputRoot(cwd, config.outputDir), '.benchmark.json'),
      JSON.stringify({ maxRssBytes: process.resourceUsage().maxRSS * 1024 })
    )
  }
}

async function recoverInterruptedOutputReplacement(outputRoot: string) {
  const backupRoot = outputBackupRoot(outputRoot)
  if (!(await pathExists(backupRoot))) return
  if (await pathExists(outputRoot)) await rm(backupRoot, { recursive: true, force: true })
  else await rename(backupRoot, outputRoot)
}

async function replaceOutputDirectory(outputRoot: string, temporaryRoot: string) {
  const backupRoot = outputBackupRoot(outputRoot)
  const hadPreviousOutput = await pathExists(outputRoot)
  try {
    if (hadPreviousOutput) await rename(outputRoot, backupRoot)
    await rename(temporaryRoot, outputRoot)
  } catch (error) {
    if (hadPreviousOutput && (await pathExists(backupRoot))) {
      await rm(outputRoot, { recursive: true, force: true })
      await rename(backupRoot, outputRoot)
    }
    throw error
  }
  await rm(backupRoot, { recursive: true, force: true })
}

async function removeDeletedPageOutputs(
  cwd: string,
  config: CanofoldConfig,
  removedPages: PageBuildState[],
  currentPages: PageBuildState[]
) {
  const outputRoot = resolveOutputRoot(cwd, config.outputDir)
  const currentPaths = new Set(
    currentPages.flatMap((page) => [page.outputPath, page.markdownOutputPath]).map(portablePathKey)
  )
  await Promise.all(
    removedPages.flatMap((page) =>
      [page.outputPath, page.markdownOutputPath]
        .filter((path) => !currentPaths.has(portablePathKey(path)))
        .map((path) =>
          rm(resolveOutputPath(outputRoot, path, `removed page output ${path}`), { force: true })
        )
    )
  )
}

async function runBuildLocked(
  options: BuildOptions,
  cacheRoot: string,
  config: CanofoldConfig,
  outputRoot: string,
  assertBuildLockOwned: AssertBuildLockOwned,
  startedAt: number
): Promise<BuildResult> {
  await recoverInterruptedOutputReplacement(outputRoot)
  const extensions = await loadExtensionHost(
    options.cwd,
    resolveBuildTemporaryRoot(options.cwd),
    config.extensions
  )
  const renderer = options.renderer ?? createMarkdownRenderer()
  // Pluggable whole-site indexers may read emitted HTML. Only the built-in
  // graph index (or disabled search) permits request-time HTML delivery.
  const renderHtml =
    options.demoMode !== 'dev' ||
    options.renderHtml !== false ||
    (config.search.enabled && typeof config.search.provider !== 'string')
  if (options.forceClean || options.noCache) renderer.clear()
  const contentDiagnostics: CheckDiagnostic[] = []
  const graph = await buildContentGraph(options.cwd, config, extensions, {
    includeDrafts: options.demoMode === 'dev',
    renderer,
    diagnostics: contentDiagnostics
  })
  const diagnostics = await checkContentGraph(
    options.cwd,
    config,
    graph,
    extensions.publicOutputPaths,
    contentDiagnostics,
    options.demoMode !== 'dev'
  )
  const errors = diagnostics.filter((issue) => issue.severity === 'error')
  if (errors.length) throw new ContentDiagnosticsError(errors)
  const resources = await preparePageResources(options.cwd, config, graph, renderer)
  const analyzedDemoManifest = await prepareDemoManifest({
    cwd: options.cwd,
    config,
    graph,
    mode: options.demoMode === 'dev' ? 'dev' : 'analyze',
    server: options.demoServer
  })
  const currentManifest = await createBuildManifest(
    options.cwd,
    config,
    graph,
    extensions.fingerprint,
    analyzedDemoManifest,
    options.demoMode === 'dev' ? (renderHtml ? 'dev' : 'dev-request') : 'build',
    resources
  )
  const previousManifest = options.noCache ? undefined : await readBuildManifest(cacheRoot)
  const outputExists = await pathExists(outputRoot)
  const outputValid =
    outputExists && previousManifest
      ? await verifyBuildOutputs(outputRoot, previousManifest.outputs)
      : outputExists
  const plan = planBuild({
    current: currentManifest,
    previous: previousManifest,
    outputExists,
    outputValid,
    forceClean: options.forceClean || options.noCache
  })
  if (options.demoMode !== 'dev' || plan.mode !== 'cached') {
    for (const issue of diagnostics) console.warn(formatDiagnostic(issue))
  }

  if (plan.mode === 'cached') {
    const report = createBuildReport({
      config,
      graph,
      manifest: previousManifest!,
      previous: previousManifest,
      mode: plan.mode,
      reason: plan.reason,
      changedPages: [],
      renderHtml,
      durationMs: performance.now() - startedAt
    })
    await writeBuildCacheJson(cacheRoot, 'build-report', report)
    logBuildReport(options, report, config.outputDir)
    return {
      config,
      graph,
      incremental: false,
      cached: true,
      mode: plan.mode,
      changedPages: [],
      partialReload: false,
      reason: plan.reason,
      report,
      contentDependencyPaths: currentManifest.contentDependencyPaths,
      renderHtml,
      ...(analyzedDemoManifest ? { demoManifest: analyzedDemoManifest } : {})
    }
  }

  const pagesByKey = new Map(graph.pages.map((page) => [buildPageKey(page), page]))
  const changedPages = plan.changedPageKeys.flatMap((key) => {
    const page = pagesByKey.get(key)
    return page ? [page] : []
  })

  const temporaryRoot = join(dirname(outputRoot), `.${basename(outputRoot)}.tmp-${randomUUID()}`)
  const temporaryConfig = {
    ...config,
    outputDir: relative(resolve(options.cwd), temporaryRoot)
  }
  await mkdir(dirname(temporaryRoot), { recursive: true })
  try {
    if (plan.mode === 'incremental') {
      await copyBuildOutputs(outputRoot, temporaryRoot, previousManifest?.outputs ?? {})
    }
    const demoManifest =
      options.demoMode === 'dev'
        ? analyzedDemoManifest
        : await prepareDemoManifest({
            cwd: options.cwd,
            config: temporaryConfig,
            graph,
            mode: 'build',
            server: options.demoServer
          })
    await writeBuildOutputs({
      cwd: options.cwd,
      config: temporaryConfig,
      graph,
      pages: plan.mode === 'incremental' ? changedPages : graph.pages,
      previousPages:
        plan.mode === 'incremental' && previousManifest ? Object.values(previousManifest.pages) : [],
      renderer,
      resources,
      writeSharedAssets: plan.mode !== 'incremental',
      renderHtml,
      extensions,
      demoManifest
    })
    if (plan.mode === 'incremental') {
      const removedPages = plan.removedPageKeys.flatMap((key) => {
        const page = previousManifest?.pages[key]
        return page ? [page] : []
      })
      await removeDeletedPageOutputs(
        options.cwd,
        temporaryConfig,
        removedPages,
        Object.values(currentManifest.pages)
      )
    }
    await assertBuildLockOwned()
    await replaceOutputDirectory(outputRoot, temporaryRoot)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }

  const completedManifest = {
    ...currentManifest,
    outputs: await captureBuildOutputs(outputRoot)
  }
  await assertBuildLockOwned()
  await writeBuildManifest(cacheRoot, completedManifest)

  const changedPagePaths = [...new Set(changedPages.map((page) => page.sourceRelativePath))]
  const report = createBuildReport({
    config,
    graph,
    manifest: completedManifest,
    previous: outputValid ? previousManifest : undefined,
    mode: plan.mode,
    reason: plan.reason,
    changedPages: changedPagePaths,
    renderHtml,
    durationMs: performance.now() - startedAt
  })
  await writeBuildCacheJson(cacheRoot, 'build-report', report)
  logBuildReport(options, report, config.outputDir)
  return {
    config,
    graph,
    incremental: plan.mode === 'incremental',
    cached: false,
    mode: plan.mode,
    changedPages: changedPagePaths,
    partialReload:
      plan.mode === 'incremental' &&
      plan.changedPageKeys.length === 1 &&
      plan.removedPageKeys.length === 0 &&
      Boolean(
        previousManifest?.pages[plan.changedPageKeys[0] ?? '']?.outputPath ===
        currentManifest.pages[plan.changedPageKeys[0] ?? '']?.outputPath
      ),
    reason: plan.reason,
    report,
    contentDependencyPaths: currentManifest.contentDependencyPaths,
    renderHtml,
    ...(analyzedDemoManifest ? { demoManifest: analyzedDemoManifest } : {})
  }
}

export async function runBuild(options: BuildOptions): Promise<BuildResult> {
  const startedAt = performance.now()
  const cacheRoot = resolveBuildCacheRoot(options.cwd)
  await assertProjectPath(options.cwd, cacheRoot, 'build cache')
  const config = options.config ?? (await loadConfig(options.cwd))
  assertRequiredVersion(config)
  const outputRoot = await resolveSafeOutputRoot(options.cwd, config, cacheRoot)
  return withBuildLock(cacheRoot, (assertOwned) =>
    runBuildLocked(options, cacheRoot, config, outputRoot, assertOwned, startedAt)
  )
}
