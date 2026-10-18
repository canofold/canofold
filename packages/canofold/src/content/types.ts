import type { MarkdownContentAnalysis, MarkdownReferences } from '@canofold/markdown/server'
import type { CanofoldFrontmatter } from './frontmatter'
import type { CanofoldDemoReference } from '../demos/types'

interface PageLink {
  title: string
  routePath: string
}

export interface SidebarLink {
  type: 'link'
  title: string
  routePath: string
}

export interface SidebarTreeGroup {
  type: 'group'
  /** Sibling identity independent of translated titles. */
  segment: string
  title: string
  collapsed: boolean
  items: SidebarItem[]
}

export type SidebarItem = SidebarLink | SidebarTreeGroup

export interface SidebarGroup {
  /** First locale subdirectory; selects the section sidebar. */
  segment: string
  /** Automatic top-nav title, not shown in the sidebar. */
  title: string
  items: SidebarItem[]
}

export interface NavItem {
  title: string
  routePath: string
  activePaths?: string[]
  /** Explicit section ownership for automatic or section-root navigation. */
  section?: string
}

export interface DocPage extends Pick<MarkdownContentAnalysis, 'headings' | 'codeExamples' | 'excerpt'> {
  sourcePath: string
  /** SHA-256 of the authored file before trusted source transformations. */
  sourceRevision: string
  /** Complete extension-transformed source. */
  transformedSource: string
  /** Project-relative source path. */
  sourceRelativePath: string
  /** Path within this version's docs root. */
  relativePath: string
  version: string
  versionBase: string
  docsDir: string
  locale: string
  routePath: string
  outputPath: string
  markdownOutputPath: string
  title: string
  description: string
  order: number
  /** First locale subdirectory, or ''. */
  group: string
  status: 'draft' | 'published'
  search: boolean
  ai: boolean
  body: string
  searchText: string
  references: MarkdownReferences
  demos: CanofoldDemoReference[]
  lastUpdated: string
  previous?: PageLink
  next?: PageLink
  frontmatter: CanofoldFrontmatter
}

export interface ContentGraph {
  pages: DocPage[]
  /** Sidebar by version and locale. */
  sidebar: Record<string, Record<string, SidebarGroup[]>>
  /** Navigation by version and locale. */
  nav: Record<string, Record<string, NavItem[]>>
  locales: string[]
  defaultLocale: string
  versions: Array<{
    id: string
    label: string
    base: string
    docsDir: string
    status?: 'supported' | 'archived'
  }>
  currentVersion: string
}
