import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import {
  checkCodeBlockLanguages,
  checkDuplicateHeadings,
  checkFrontmatterDescription,
  checkFrontmatterTitle,
  checkRichDirectiveSyntax,
  checkLinksAndImages,
  checkMissingTranslations,
  checkStaleTranslations,
  summarizeTranslationStatus,
  summarizeTranslationCoverage
} from '../check/runChecks'
import { loadConfig } from '../config/load'
import { assertLocaleHomePages, buildContentGraph } from '../content/graph'
import { isMdxPath } from '../content/fileKinds'
import { assertVersionLocalDependencies } from '../content/versionBoundary'
import { prepareMdxSource } from '../markdown/importBoundary'
import { localComponentDependencyPaths } from '../render/localComponents'
import { resolveProjectPath } from '../utils/paths'
import { generatedPublicPaths } from '../output/plan'
import { loadExtensionHost } from '../extensions/host'
import { demoDirectivePlugin } from '../demos/references'
import { prepareDemoManifest } from '../demos/prepare'
import type { CheckIssue } from '../check/runChecks'
import type { CheckRuleId } from '../check/rules'
import type { ContentGraph, DocPage } from '../content/types'
import type { CanofoldConfig } from '../config/types'

export interface CheckDiagnostic extends CheckIssue {
  ruleId: CheckRuleId
  /** Project-relative source path, including the version-specific docs directory. */
  page?: string
  suggestion?: string
}

const suggestions: Record<CheckRuleId, string> = {
  'code-block-language': 'Add a language to the code fence.',
  'directive-syntax': 'Fix the directive at this location.',
  'frontmatter-title': 'Add a frontmatter title.',
  'frontmatter-description': 'Add a frontmatter description.',
  'broken-link': 'Fix the link or publish its target.',
  'broken-image': 'Fix the image path or add the file.',
  'broken-heading': 'Fix the fragment or add the heading.',
  'duplicate-heading': 'Use distinct heading names.',
  'missing-translation': 'Add the page in this locale and version.',
  'stale-translation': 'Review the translation, then update translation.sourceHash.'
}

function annotate(ruleId: CheckRuleId, issues: CheckIssue[], sourcePath?: string): CheckDiagnostic[] {
  return issues.map((issue) => ({
    ...issue,
    ruleId,
    ...(sourcePath ? { page: sourcePath } : {}),
    suggestion: suggestions[ruleId]
  }))
}

function referenceRule(issue: CheckIssue): CheckRuleId {
  if (issue.message.startsWith('Image target')) return 'broken-image'
  if (issue.message.startsWith('Heading target')) return 'broken-heading'
  return 'broken-link'
}

async function collectFiles(root: string) {
  const files = new Set<string>()
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    const path = relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/')
    if (entry.isSymbolicLink()) {
      throw new Error(`Documentation files must not use symbolic links: ${path}`)
    }
    if (entry.isFile()) files.add(path)
  }
  return files
}

function bodyLineOffset(page: { transformedSource: string; body: string }) {
  if (!page.body) return 0
  const bodyIndex = page.transformedSource.lastIndexOf(page.body)
  return bodyIndex < 0 ? 0 : page.transformedSource.slice(0, bodyIndex).split('\n').length - 1
}

function referenceScope(
  config: CanofoldConfig,
  graph: ContentGraph,
  pages: DocPage[],
  filesByVersion: Map<string, Set<string>>,
  extensionPaths: readonly string[]
) {
  const routePaths = new Set<string>()
  const routeHeadings = new Map<string, Set<string>>()
  const fileHeadings = new Map<string, Map<string, Set<string>>>()
  for (const page of pages) {
    const headings = new Set(page.references.anchors)
    routePaths.add(page.routePath)
    routeHeadings.set(page.routePath, headings)
    const versionFiles = fileHeadings.get(page.version) ?? new Map<string, Set<string>>()
    versionFiles.set(page.relativePath, headings)
    fileHeadings.set(page.version, versionFiles)
  }
  return {
    filesByVersion,
    routePaths,
    routeHeadings,
    fileHeadings,
    generatedPaths: new Set([...generatedPublicPaths(config, { ...graph, pages }), ...extensionPaths])
  }
}

export async function runCheck({ cwd, format = 'text' }: { cwd: string; format?: 'text' | 'json' }) {
  const config = await loadConfig(cwd)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'canofold-check-'))
  const extensions = await loadExtensionHost(cwd, temporaryRoot, config.extensions).finally(() =>
    rm(temporaryRoot, { recursive: true, force: true })
  )
  const graph = await buildContentGraph(cwd, config, extensions, { includeDrafts: true })
  const publishedPages = graph.pages.filter((page) => page.status === 'published')
  assertLocaleHomePages(publishedPages, config)
  for (const page of graph.pages) {
    if (page.version === graph.currentVersion || !isMdxPath(page.relativePath)) continue
    const paths = await localComponentDependencyPaths(
      prepareMdxSource(page.body).imports,
      page.sourcePath,
      cwd
    )
    await assertVersionLocalDependencies(cwd, page, paths)
  }
  await prepareDemoManifest({ cwd, config, graph, mode: 'analyze' })
  const publishedGraph = { ...graph, pages: publishedPages }
  const existingByVersion = new Map(
    await Promise.all(
      graph.versions.map(
        async (version) =>
          [
            version.id,
            await collectFiles(resolveProjectPath(cwd, version.docsDir, `versions[${version.id}].docsDir`))
          ] as const
      )
    )
  )
  const publishedExistingByVersion = new Map(
    [...existingByVersion].map(([version, files]) => [version, new Set(files)] as const)
  )
  for (const page of graph.pages) {
    if (page.status === 'draft') publishedExistingByVersion.get(page.version)?.delete(page.relativePath)
  }
  const authoringScope = referenceScope(
    config,
    graph,
    graph.pages,
    existingByVersion,
    extensions.publicOutputPaths
  )
  const publishedScope = referenceScope(
    config,
    graph,
    publishedPages,
    publishedExistingByVersion,
    extensions.publicOutputPaths
  )
  const found = [
    ...graph.pages.flatMap((page) => {
      const scope = page.status === 'draft' ? authoringScope : publishedScope
      const lineOffset = bodyLineOffset(page)
      return [
        ...annotate(
          'code-block-language',
          checkCodeBlockLanguages(page.body, lineOffset),
          page.sourceRelativePath
        ),
        ...annotate(
          'directive-syntax',
          checkRichDirectiveSyntax(
            page.body,
            lineOffset,
            [...config.markdown.plugins, demoDirectivePlugin],
            isMdxPath(page.relativePath) ? 'mdx' : 'markdown'
          ),
          page.sourceRelativePath
        ),
        ...annotate(
          'frontmatter-title',
          checkFrontmatterTitle(page.frontmatter, page),
          page.sourceRelativePath
        ),
        ...annotate(
          'frontmatter-description',
          checkFrontmatterDescription(page.frontmatter),
          page.sourceRelativePath
        ),
        ...checkLinksAndImages(
          page.references,
          scope.filesByVersion.get(page.version) ?? new Set(),
          page.relativePath,
          scope.routePaths,
          new Set(page.references.anchors),
          scope.routeHeadings,
          scope.fileHeadings.get(page.version),
          scope.generatedPaths,
          lineOffset
        ).flatMap((issue) => annotate(referenceRule(issue), [issue], page.sourceRelativePath)),
        ...annotate('duplicate-heading', checkDuplicateHeadings(page), page.sourceRelativePath)
      ]
    }),
    ...annotate('missing-translation', checkMissingTranslations(publishedGraph)),
    ...annotate('stale-translation', checkStaleTranslations(publishedGraph))
  ]
  const issues = found.flatMap((issue) => {
    const level = config.checks.rules[issue.ruleId]
    if (level === 'off') return []
    return [{ ...issue, severity: level ?? issue.severity }]
  })

  if (format === 'json') {
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          diagnostics: issues,
          translationCoverage: summarizeTranslationCoverage(publishedGraph),
          translationStatus: summarizeTranslationStatus(publishedGraph)
        },
        null,
        2
      )
    )
  } else {
    for (const issue of issues) {
      const location = issue.page
        ? ` ${issue.page}${issue.line === undefined ? '' : `:${issue.line}${issue.column === undefined ? '' : `:${issue.column}`}`}`
        : ''
      console.log(`${issue.severity.toUpperCase()} [${issue.ruleId}]:${location} ${issue.message}`)
    }
  }

  if (issues.some((issue) => issue.severity === 'error')) {
    process.exitCode = 1
  }

  return issues
}
