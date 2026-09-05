import { mkdtemp, rm } from 'node:fs/promises'
import { onTestFinished } from 'vitest'
import { defaultConfig } from '../src/config/defaults'
import type { CanofoldConfig } from '../src/config/types'
import type { ContentGraph, DocPage } from '../src/content/types'

export async function trackedMkdtemp(prefix: string) {
  const directory = await mkdtemp(prefix)
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

export function createMockConfig(overrides: Partial<CanofoldConfig> = {}): CanofoldConfig {
  return Object.assign(structuredClone(defaultConfig), overrides)
}

export function createMockPage(overrides: Partial<DocPage> = {}): DocPage {
  const relativePath = overrides.relativePath ?? 'guide.md'
  const routePath = overrides.routePath ?? '/guide/'
  const routeOutput = routePath === '/' ? '' : routePath.replace(/^\/+|\/+$/g, '')
  return {
    sourcePath: `docs/${relativePath}`,
    transformedSource: '# Guide',
    sourceRelativePath: `docs/${relativePath}`,
    relativePath,
    version: 'current',
    versionBase: '/',
    docsDir: 'docs',
    locale: 'zh',
    routePath,
    outputPath: routeOutput ? `${routeOutput}/index.html` : 'index.html',
    markdownOutputPath: routeOutput ? `${routeOutput}/index.md` : 'index.md',
    title: 'Guide',
    description: '',
    order: 0,
    group: 'guide',
    status: 'published',
    search: true,
    ai: true,
    body: '# Guide',
    headings: [{ level: 1, text: 'Guide', slug: 'guide' }],
    searchText: 'Guide',
    codeExamples: [],
    lastUpdated: '2026-07-23T00:00:00.000Z',
    frontmatter: {},
    ...overrides
  }
}

export function createMockGraph(overrides: Partial<ContentGraph> = {}): ContentGraph {
  return {
    pages: [],
    sidebar: {},
    nav: {},
    locales: ['zh'],
    defaultLocale: 'zh',
    versions: [{ id: 'current', label: 'Current', docsDir: 'docs', base: '/' }],
    currentVersion: 'current',
    ...overrides
  }
}
