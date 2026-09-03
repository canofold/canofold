import type { ContentGraph, DocPage } from '../content/types'
import { localeRelativePathFor } from '../content/routes'
import { posix } from 'node:path'
import { analyzeMarkdown } from '@canofold/markdown/server/analyze'
import { canonicalRoutePath } from '../content/routes'
import type { MarkdownPlugin } from '@canofold/markdown'

export interface CheckIssue {
  severity: 'warning' | 'error'
  message: string
  page?: string
}

export function checkCodeBlockLanguages(markdown: string): CheckIssue[] {
  return Array.from({ length: analyzeMarkdown(markdown).missingCodeBlockLanguages }, () => ({
    severity: 'warning' as const,
    message: 'Code block is missing a language'
  }))
}

export function checkRichDirectiveSyntax(
  markdown: string,
  lineOffset = 0,
  plugins: readonly MarkdownPlugin[] = []
): CheckIssue[] {
  return analyzeMarkdown(markdown, { plugins }).directiveIssues.map((issue) => ({
    severity: 'error',
    message: `${issue.message}${
      issue.line === undefined
        ? ''
        : ` (line ${issue.line + lineOffset}${issue.column === undefined ? '' : `, column ${issue.column}`})`
    }`
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

function resolveRelativeTarget(pageRelativePath: string, target: string) {
  const decoded = target
    .split('/')
    .map((segment) => {
      const value = decodeURIComponent(segment)
      if (value.includes('/') || value.includes('\\')) throw new Error('Encoded path separator')
      return value
    })
    .join('/')
  return posix.normalize(posix.join(posix.dirname(pageRelativePath), decoded.replace(/^\.\//, '')))
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

function markdownExtensionKey(path: string) {
  return path.replace(/\.(?:md|mdx)$/i, (extension) => extension.toLocaleLowerCase('en-US'))
}

export function checkLinksAndImages(
  markdown: string,
  existingRelativeFiles: Set<string>,
  pageRelativePath = '',
  routePaths: Set<string> = new Set(),
  headingSlugs: Set<string> = new Set(),
  routeHeadingSlugs: Map<string, Set<string>> = new Map(),
  fileHeadingSlugs: Map<string, Set<string>> = new Map(),
  generatedPublicPaths: Set<string> = new Set()
): CheckIssue[] {
  const issues: CheckIssue[] = []
  const analysis = analyzeMarkdown(markdown)
  const markdownFilesByExtensionKey = new Map(
    [...existingRelativeFiles]
      .filter((path) => /\.(?:md|mdx)$/i.test(path))
      .map((path) => [markdownExtensionKey(path), path])
  )

  for (const image of analysis.images) {
    const target = splitTarget(image).path
    if (!target || isExternalTarget(target)) continue
    if (target.startsWith('/')) {
      if (!existingRelativeFiles.has(publicFileFor(target) ?? '')) {
        issues.push({ severity: 'error', message: `Image target does not exist: ${target}` })
      }
      continue
    }
    let resolved: string
    try {
      resolved = resolveRelativeTarget(pageRelativePath, target)
    } catch {
      issues.push({ severity: 'error', message: `Image target does not exist: ${target}` })
      continue
    }
    if (!existingRelativeFiles.has(resolved)) {
      issues.push({ severity: 'error', message: `Image target does not exist: ${target}` })
    }
  }

  for (const link of analysis.links) {
    const { path: target, fragment } = splitTarget(link)
    const decodedFragment = decodeFragment(fragment)
    if (isExternalTarget(target)) continue
    if (!target) {
      if (fragment && (!decodedFragment || !headingSlugs.has(decodedFragment))) {
        issues.push({ severity: 'error', message: `Heading target does not exist: #${fragment}` })
      }
      continue
    }
    if (target.startsWith('/')) {
      if (existingRelativeFiles.has(publicFileFor(target) ?? '')) continue
      let canonicalTarget: string
      try {
        canonicalTarget = canonicalRoutePath(target)
      } catch {
        issues.push({ severity: 'error', message: `Link target does not exist: ${target}` })
        continue
      }
      if (generatedPublicPaths.has(canonicalTarget)) continue
      const route = canonicalTarget === '/' ? '/' : `${canonicalTarget.replace(/\/+$/, '')}/`
      if (!routePaths.has(route)) {
        issues.push({ severity: 'error', message: `Link target does not exist: ${target}` })
      } else if (fragment && (!decodedFragment || !routeHeadingSlugs.get(route)?.has(decodedFragment))) {
        issues.push({ severity: 'error', message: `Heading target does not exist: ${link}` })
      }
      continue
    }

    let resolved: string
    try {
      resolved = resolveRelativeTarget(pageRelativePath, target)
    } catch {
      issues.push({ severity: 'error', message: `Link target does not exist: ${target}` })
      continue
    }
    const candidates = /\.mdx?$/i.test(resolved)
      ? [resolved]
      : [
          resolved,
          `${resolved}.md`,
          `${resolved}.mdx`,
          posix.join(resolved, 'index.md'),
          posix.join(resolved, 'index.mdx')
        ]
    const matched = candidates
      .map((candidate) =>
        existingRelativeFiles.has(candidate)
          ? candidate
          : markdownFilesByExtensionKey.get(markdownExtensionKey(candidate))
      )
      .find((candidate): candidate is string => Boolean(candidate))
    if (!matched) {
      issues.push({ severity: 'error', message: `Link target does not exist: ${target}` })
    } else if (fragment && (!decodedFragment || !fileHeadingSlugs.get(matched)?.has(decodedFragment))) {
      issues.push({ severity: 'error', message: `Heading target does not exist: ${link}` })
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

export function checkMissingTranslations(graph: ContentGraph): CheckIssue[] {
  const byKey = new Map<string, Set<string>>()
  for (const page of graph.pages) {
    const key = `${page.version}:${localeRelativePathFor(page.relativePath, page.locale)}`
    byKey.set(key, (byKey.get(key) ?? new Set()).add(page.locale))
  }

  const issues: CheckIssue[] = []
  for (const [key, locales] of byKey) {
    for (const locale of graph.locales) {
      if (!locales.has(locale)) {
        const [version, ...path] = key.split(':')
        issues.push({
          severity: 'warning',
          message: `Missing ${locale} translation for ${path.join(':')} in version ${version}`
        })
      }
    }
  }
  return issues
}
