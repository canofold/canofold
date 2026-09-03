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
  checkMissingTranslations
} from '../check/runChecks'
import { loadConfig } from '../config/load'
import { buildContentGraph } from '../content/graph'
import { resolveProjectPath } from '../utils/paths'
import { generatedPublicPaths } from '../output/plan'
import { loadExtensionHost } from '../extensions/host'

async function collectFiles(root: string) {
  const files = new Set<string>()
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isSymbolicLink()) {
        throw new Error(`Documentation files must not use symbolic links: ${relative(root, full)}`)
      } else {
        files.add(relative(root, full).replace(/\\/g, '/'))
      }
    }
  }
  await walk(root)
  return files
}

function bodyLineOffset(page: { transformedSource: string; body: string }) {
  if (!page.body) return 0
  const bodyIndex = page.transformedSource.lastIndexOf(page.body)
  return bodyIndex < 0 ? 0 : page.transformedSource.slice(0, bodyIndex).split('\n').length - 1
}

export async function runCheck({ cwd }: { cwd: string }) {
  const config = await loadConfig(cwd)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'canofold-check-'))
  const extensions = await loadExtensionHost(cwd, temporaryRoot, config.extensions).finally(() =>
    rm(temporaryRoot, { recursive: true, force: true })
  )
  const graph = await buildContentGraph(cwd, config, extensions)
  const knownGeneratedPaths = new Set([
    ...generatedPublicPaths(config, graph),
    ...extensions.publicOutputPaths
  ])
  const existingByVersion = new Map(
    await Promise.all(
      config.versions.items.map(
        async (version) =>
          [
            version.id,
            await collectFiles(
              resolveProjectPath(cwd, version.docsDir, `versions.items[${version.id}].docsDir`)
            )
          ] as const
      )
    )
  )
  const routePaths = new Set(graph.pages.map((page) => page.routePath))
  const routeHeadingSlugs = new Map(
    graph.pages.map((page) => [page.routePath, new Set(page.headings.map((heading) => heading.slug))])
  )
  const fileHeadingSlugsByVersion = new Map(
    graph.versions.map((version) => [
      version.id,
      new Map(
        graph.pages
          .filter((page) => page.version === version.id)
          .map((page) => [page.relativePath, new Set(page.headings.map((heading) => heading.slug))])
      )
    ])
  )
  const issues = [
    ...graph.pages.flatMap((page) => [
      ...checkCodeBlockLanguages(page.body).map((issue) => ({ ...issue, page: page.relativePath })),
      ...checkRichDirectiveSyntax(page.body, bodyLineOffset(page), config.markdown.plugins).map((issue) => ({
        ...issue,
        page: page.relativePath
      })),
      ...checkFrontmatterTitle(page.frontmatter, page),
      ...checkFrontmatterDescription(page.frontmatter).map((issue) => ({
        ...issue,
        page: page.relativePath
      })),
      ...checkLinksAndImages(
        page.body,
        existingByVersion.get(page.version) ?? new Set(),
        page.relativePath,
        routePaths,
        new Set(page.headings.map((heading) => heading.slug)),
        routeHeadingSlugs,
        fileHeadingSlugsByVersion.get(page.version),
        knownGeneratedPaths
      ).map((issue) => ({
        ...issue,
        page: page.sourceRelativePath
      })),
      ...checkDuplicateHeadings(page)
    ]),
    ...checkMissingTranslations(graph)
  ]

  for (const issue of issues) {
    const page = issue.page ? ` ${issue.page}` : ''
    console.log(`${issue.severity.toUpperCase()}:${page} ${issue.message}`)
  }

  if (issues.some((issue) => issue.severity === 'error')) {
    process.exitCode = 1
  }

  return issues
}
