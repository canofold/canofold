import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import {
  checkCodeBlockLanguages,
  checkDuplicateHeadings,
  checkFrontmatterDescription,
  checkFrontmatterTitle,
  checkRichDirectiveSyntax,
  checkLinksAndImages,
  checkMissingTranslations,
  checkStaleTranslations
} from '../check/runChecks'
import { assertLocaleHomePages } from '../content/graph'
import { isMdxPath } from '../content/fileKinds'
import { assertVersionLocalDependencies } from '../content/versionBoundary'
import { prepareMdxSource } from '../markdown/importBoundary'
import { localComponentDependencyPaths } from '../render/localComponents'
import { resolveProjectPath } from '../utils/paths'
import { generatedPublicPaths } from '../output/plan'
import type { CheckIssue } from '../check/runChecks'
import type { CheckRuleId } from '../check/rules'
import type { ContentGraph, DocPage } from '../content/types'
import type { CanofoldConfig } from '../config/types'

import type { CheckDiagnostic } from './diagnostics'
import { analyzeMarkdown } from '@canofold/markdown/server/analyze'
import { demoDirectivePlugin } from '../demos/references'
import { markdownExtensionKey } from '../content/routes'

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
    markdownFilesByVersion: new Map(
      [...filesByVersion].map(([version, files]) => [
        version,
        new Map(
          [...files].filter((file) => /\.mdx?$/i.test(file)).map((file) => [markdownExtensionKey(file), file])
        )
      ])
    ),
    routePaths,
    routeHeadings,
    fileHeadings,
    generatedPaths: new Set([...generatedPublicPaths(config, { ...graph, pages }), ...extensionPaths])
  }
}

export async function checkContentGraph(
  cwd: string,
  config: CanofoldConfig,
  graph: ContentGraph,
  extensionPaths: readonly string[],
  contentDiagnostics: CheckDiagnostic[] = [],
  requirePublishedHome = true
): Promise<CheckDiagnostic[]> {
  const publishedPages = graph.pages.filter((page) => page.status === 'published')
  if (requirePublishedHome && !contentDiagnostics.length) assertLocaleHomePages(publishedPages, config)
  for (const page of graph.pages) {
    if (page.version === graph.currentVersion || !isMdxPath(page.relativePath)) continue
    const paths = await localComponentDependencyPaths(
      prepareMdxSource(page.body).imports,
      page.sourcePath,
      cwd
    )
    await assertVersionLocalDependencies(cwd, page, paths)
  }
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
  const publishedSources = new Set(
    publishedPages.map((page) => JSON.stringify([page.version, page.relativePath]))
  )
  for (const [version, files] of publishedExistingByVersion) {
    for (const file of files) {
      if (
        /\.mdx?$/i.test(file) &&
        !file.startsWith('public/') &&
        !publishedSources.has(JSON.stringify([version, file]))
      )
        files.delete(file)
    }
  }
  const authoringScope = referenceScope(config, graph, graph.pages, existingByVersion, extensionPaths)
  const publishedScope = referenceScope(
    config,
    graph,
    publishedPages,
    publishedExistingByVersion,
    extensionPaths
  )
  const found = [
    ...graph.pages.flatMap((page) => {
      const syntax =
        page.syntax ??
        analyzeMarkdown(page.body, {
          plugins: [...config.markdown.plugins, demoDirectivePlugin],
          mode: isMdxPath(page.relativePath) ? 'mdx' : 'markdown'
        })
      const scope = page.status === 'draft' ? authoringScope : publishedScope
      const lineOffset = bodyLineOffset(page)
      const diagnostics = [
        ...annotate(
          'code-block-language',
          checkCodeBlockLanguages(syntax, lineOffset),
          page.sourceRelativePath
        ),
        ...annotate(
          'directive-syntax',
          checkRichDirectiveSyntax(syntax, lineOffset),
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
          lineOffset,
          scope.markdownFilesByVersion.get(page.version)
        ).flatMap((issue) => annotate(referenceRule(issue), [issue], page.sourceRelativePath)),
        ...annotate('duplicate-heading', checkDuplicateHeadings(page), page.sourceRelativePath)
      ]
      if (!page.origin) return diagnostics
      return diagnostics.map(({ line, column, ...issue }) => ({
        ...issue,
        sourcePointer: page.origin!.pointer,
        message: `Generated Markdown${line === undefined ? '' : ` at ${line}${column === undefined ? '' : `:${column}`}`}: ${issue.message}`
      }))
    }),
    ...annotate('missing-translation', checkMissingTranslations(publishedGraph)),
    ...annotate('stale-translation', checkStaleTranslations(publishedGraph))
  ]
  const issues = found.flatMap((issue) => {
    const level = config.checks.rules[issue.ruleId as CheckRuleId]
    if (level === 'off') return []
    return [{ ...issue, severity: level ?? issue.severity }]
  })

  return [...contentDiagnostics, ...issues]
}
