import type { ContentGraph, DocPage } from '../content/types'
import {
  localeRelativePathFor,
  resolveRelativeSourcePath,
  markdownExtensionKey,
  sourceLinkCandidates
} from '../content/routes'
import { createHash } from 'node:crypto'
import { canonicalRoutePath } from '../content/routes'
import type { MarkdownAnalysis } from '@canofold/markdown/server/analyze'

export interface CheckIssue {
  severity: 'warning' | 'error'
  message: string
  page?: string
  line?: number
  column?: number
  version?: string
  locale?: string
  relativePath?: string
}

function atSource(location: { line: number; column: number } | null | undefined, lineOffset: number) {
  return location ? { line: location.line + lineOffset, column: location.column } : {}
}

export function checkCodeBlockLanguages(
  analysis: Pick<MarkdownAnalysis, 'missingCodeBlockLanguageLocations'>,
  lineOffset = 0
): CheckIssue[] {
  return analysis.missingCodeBlockLanguageLocations.map((location) => ({
    severity: 'warning' as const,
    message: 'Code block is missing a language',
    ...atSource(location, lineOffset)
  }))
}

export function checkRichDirectiveSyntax(
  analysis: Pick<MarkdownAnalysis, 'directiveIssues'>,
  lineOffset = 0
): CheckIssue[] {
  return analysis.directiveIssues.map((issue) => ({
    severity: 'error' as const,
    message: issue.message,
    ...(issue.line === undefined ? {} : { line: issue.line + lineOffset }),
    ...(issue.column === undefined ? {} : { column: issue.column })
  }))
}

export function checkFrontmatterDescription(frontmatter: Record<string, unknown>): CheckIssue[] {
  return typeof frontmatter.description === 'string' && frontmatter.description.trim()
    ? []
    : [{ severity: 'warning', message: 'Frontmatter description is missing' }]
}

export function checkFrontmatterTitle(frontmatter: Record<string, unknown>, page: DocPage): CheckIssue[] {
  return typeof frontmatter.title === 'string' && frontmatter.title.trim()
    ? []
    : [
        {
          severity: 'warning',
          page: page.relativePath,
          message: 'Frontmatter title is missing'
        }
      ]
}

function isExternalTarget(target: string) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)
}

function splitTarget(target: string) {
  const hashIndex = target.indexOf('#')
  const pathWithQuery = hashIndex === -1 ? target : target.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? '' : target.slice(hashIndex + 1)
  return { path: pathWithQuery.split('?')[0] ?? '', fragment }
}

function decodeFragment(fragment: string) {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return undefined
  }
}

function publicFileFor(target: string) {
  try {
    const decoded = target
      .split('/')
      .map((segment) => {
        const value = decodeURIComponent(segment)
        if (value.includes('/') || value.includes('\\') || value === '..') {
          throw new Error('Invalid public path')
        }
        return value
      })
      .join('/')
    return `public${decoded}`
  } catch {
    return undefined
  }
}

export function checkLinksAndImages(
  analysis: Pick<DocPage['references'], 'links' | 'linkLocations' | 'images' | 'imageLocations'>,
  existingRelativeFiles: Set<string>,
  pageRelativePath = '',
  routePaths: Set<string> = new Set(),
  headingSlugs: Set<string> = new Set(),
  routeHeadingSlugs: Map<string, Set<string>> = new Map(),
  fileHeadingSlugs: Map<string, Set<string>> = new Map(),
  generatedPublicPaths: Set<string> = new Set(),
  lineOffset = 0,
  preparedMarkdownFiles?: ReadonlyMap<string, string>
): CheckIssue[] {
  const issues: CheckIssue[] = []
  const markdownFilesByExtensionKey =
    preparedMarkdownFiles ??
    new Map(
      [...existingRelativeFiles]
        .filter((path) => /\.(?:md|mdx)$/i.test(path))
        .map((path) => [markdownExtensionKey(path), path])
    )
  const missing = (kind: 'Image' | 'Link' | 'Heading', target: string, position: object) => {
    issues.push({ severity: 'error', message: `${kind} target does not exist: ${target}`, ...position })
  }

  for (const [index, image] of analysis.images.entries()) {
    const position = atSource(analysis.imageLocations[index], lineOffset)
    const target = splitTarget(image).path
    if (!target || isExternalTarget(target)) continue
    if (target.startsWith('/')) {
      if (!existingRelativeFiles.has(publicFileFor(target) ?? '')) {
        missing('Image', target, position)
      }
      continue
    }
    let resolved: string
    try {
      resolved = resolveRelativeSourcePath(pageRelativePath, target)
    } catch {
      missing('Image', target, position)
      continue
    }
    if (!existingRelativeFiles.has(resolved)) {
      missing('Image', target, position)
    }
  }

  for (const [index, link] of analysis.links.entries()) {
    const position = atSource(analysis.linkLocations[index], lineOffset)
    const { path: target, fragment } = splitTarget(link)
    const decodedFragment = decodeFragment(fragment)
    if (isExternalTarget(target)) continue
    if (!target) {
      if (fragment && (!decodedFragment || !headingSlugs.has(decodedFragment))) {
        missing('Heading', `#${fragment}`, position)
      }
      continue
    }
    if (target.startsWith('/')) {
      if (existingRelativeFiles.has(publicFileFor(target) ?? '')) continue
      let canonicalTarget: string
      try {
        canonicalTarget = canonicalRoutePath(target)
      } catch {
        missing('Link', target, position)
        continue
      }
      if (generatedPublicPaths.has(canonicalTarget)) continue
      const route = canonicalTarget === '/' ? '/' : `${canonicalTarget.replace(/\/+$/, '')}/`
      if (!routePaths.has(route)) {
        missing('Link', target, position)
      } else if (fragment && (!decodedFragment || !routeHeadingSlugs.get(route)?.has(decodedFragment))) {
        missing('Heading', link, position)
      }
      continue
    }

    let resolved: string
    try {
      resolved = resolveRelativeSourcePath(pageRelativePath, target)
    } catch {
      missing('Link', target, position)
      continue
    }
    const candidates = sourceLinkCandidates(resolved)
    const matched = candidates
      .map((candidate) =>
        existingRelativeFiles.has(candidate)
          ? candidate
          : markdownFilesByExtensionKey.get(markdownExtensionKey(candidate))
      )
      .find((candidate): candidate is string => Boolean(candidate))
    if (!matched) {
      missing('Link', target, position)
    } else if (fragment && (!decodedFragment || !fileHeadingSlugs.get(matched)?.has(decodedFragment))) {
      missing('Heading', link, position)
    }
  }

  return issues
}

export function checkDuplicateHeadings(page: DocPage): CheckIssue[] {
  const groups = new Map<string, typeof page.headings>()
  for (const heading of page.headings) {
    const key = heading.text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase(page.locale)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), heading])
  }

  return [...groups.values()]
    .filter((headings) => headings.length > 1)
    .map((headings) => {
      const heading = headings[0]!
      return {
        severity: 'warning' as const,
        page: page.relativePath,
        message: `Repeated heading "${heading.text}" uses numbered anchors (${headings
          .map((item) => `#${item.slug}`)
          .join(', ')})`
      }
    })
}

function translationRows(graph: ContentGraph) {
  const byVersion = new Map<string, Map<string, Map<string, DocPage>>>()
  for (const page of graph.pages) {
    if (page.status === 'draft' || page.origin) continue
    const paths = byVersion.get(page.version) ?? new Map<string, Map<string, DocPage>>()
    const path = localeRelativePathFor(page.relativePath, page.locale)
    const locales = paths.get(path) ?? new Map<string, DocPage>()
    locales.set(page.locale, page)
    paths.set(path, locales)
    byVersion.set(page.version, paths)
  }

  return byVersion
}

export function summarizeTranslationCoverage(graph: ContentGraph) {
  const rows = translationRows(graph)
  return graph.versions.flatMap((version) =>
    graph.locales.map((locale) => {
      const paths = rows.get(version.id) ?? new Map<string, Map<string, DocPage>>()
      const existing = [...paths.values()].filter((locales) => locales.has(locale)).length
      return { version: version.id, locale, total: paths.size, existing, missing: paths.size - existing }
    })
  )
}

export function checkMissingTranslations(graph: ContentGraph): CheckIssue[] {
  const issues: CheckIssue[] = []
  for (const [version, paths] of translationRows(graph)) {
    for (const [relativePath, locales] of paths) {
      for (const locale of graph.locales) {
        if (!locales.has(locale)) {
          issues.push({
            severity: 'warning',
            version,
            locale,
            relativePath,
            message: `Missing ${locale} translation for ${relativePath} in version ${version}`
          })
        }
      }
    }
  }
  return issues
}

/** The source fingerprint is content-based; checkout timestamps cannot change it. */
export function translationSourceHash(page: DocPage) {
  const content = JSON.stringify([page.title, page.description, page.body.replace(/\r\n?/g, '\n')])
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function summarizeTranslationStatus(graph: ContentGraph) {
  const rows = translationRows(graph)
  return graph.versions.flatMap((version) => {
    return [...(rows.get(version.id) ?? [])].flatMap(([relativePath, locales]) => {
      const source = locales.get(graph.defaultLocale)
      const sourceHash = source ? translationSourceHash(source) : undefined
      return graph.locales
        .filter((locale) => locale !== graph.defaultLocale)
        .map((locale) => {
          const target = locales.get(locale)
          const recordedSourceHash = target?.frontmatter.translation?.sourceHash
          const status = !target
            ? 'missing'
            : !sourceHash || !recordedSourceHash
              ? 'unknown'
              : sourceHash === recordedSourceHash
                ? 'current'
                : 'stale'
          return {
            version: version.id,
            relativePath,
            locale,
            status,
            ...(sourceHash ? { sourceHash } : {}),
            ...(recordedSourceHash ? { recordedSourceHash } : {}),
            ...(target ? { page: target.sourceRelativePath } : {})
          }
        })
    })
  })
}

export function checkStaleTranslations(graph: ContentGraph): CheckIssue[] {
  return summarizeTranslationStatus(graph)
    .filter((item) => item.status === 'stale')
    .map((item) => ({
      severity: 'warning' as const,
      page: item.page,
      version: item.version,
      locale: item.locale,
      relativePath: item.relativePath,
      message: `Translation source changed for ${item.relativePath} in version ${item.version}: ${item.locale}`
    }))
}
