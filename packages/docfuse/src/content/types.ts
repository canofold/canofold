import type { MarkdownCodeExample, MarkdownHeading } from '@docfuse/markdown/server/analyze'
import type { DocfuseFrontmatter } from './frontmatter'

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
  /** Stable identity among sibling directories; display titles may be translated or duplicated. */
  segment: string
  title: string
  collapsed: boolean
  items: SidebarItem[]
}

export type SidebarItem = SidebarLink | SidebarTreeGroup

export interface SidebarGroup {
  /** First directory segment under the locale; used to select a section sidebar. */
  segment: string
  /** Section title used by automatic top navigation, not rendered inside the sidebar. */
  title: string
  items: SidebarItem[]
}

export interface NavItem {
  title: string
  routePath: string
}

export interface DocPage {
  sourcePath: string
  /** Complete source after extension transforms, including frontmatter and MDX imports. */
  transformedSource: string
  /** Project-relative source path, including a version-specific docsDir. */
  sourceRelativePath: string
  /** Path relative to this version's docs root. */
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
  /** First sub-directory segment under the locale, '' for root-level pages. */
  group: string
  status: 'draft' | 'published'
  search: boolean
  ai: boolean
  body: string
  headings: MarkdownHeading[]
  searchText: string
  codeExamples: MarkdownCodeExample[]
  lastUpdated: string
  previous?: PageLink
  next?: PageLink
  frontmatter: DocfuseFrontmatter
}

export interface ContentGraph {
  pages: DocPage[]
  /** Grouped sidebar entries per version and locale. */
  sidebar: Record<string, Record<string, SidebarGroup[]>>
  /** Top navigation entries per version and locale. */
  nav: Record<string, Record<string, NavItem[]>>
  locales: string[]
  defaultLocale: string
  versions: Array<{ id: string; label: string; base: string; docsDir: string }>
  currentVersion: string
}
