import type {
  MarkdownCodeOptions,
  MarkdownFeatureOptions,
  MarkdownHtmlPolicy,
  MarkdownLabels,
  MarkdownPlugin
} from '@canofold/markdown'
import type { ThemeDefinition } from '@canofold/themes'
import type { SearchProvider } from '../search/types'
import type { CanofoldDemoEngine } from '../demos/types'
import type { ContentSource } from '../content/source'
import type { CheckRuleId, CheckRuleLevel } from '../check/rules'
import { CANOFOLD_MARKDOWN_ELEMENT_GROUP_IDS } from './constants'

export type CanofoldMarkdownElementGroupId = (typeof CANOFOLD_MARKDOWN_ELEMENT_GROUP_IDS)[number]

export interface CanofoldNavigationItem {
  text: string
  link: string
  /** Additional flat document routes that belong to this navigation item. */
  activePaths?: string[]
}

export interface CanofoldVersionItem {
  id: string
  label: string
  docsDir: string
  /** Absolute URL base. The current version normally uses `/`. */
  base: string
  /** An archived version stays readable but is no longer maintained. */
  status?: 'supported' | 'archived'
}

export interface CanofoldAdvertisement {
  image: string
  href: string
  alt: string
  label?: string
}

export interface CanofoldSearchConfig {
  enabled: boolean
  provider: 'compact' | SearchProvider
}

export type CanofoldJsonValue =
  string | number | boolean | null | CanofoldJsonValue[] | { [key: string]: CanofoldJsonValue }

export interface CanofoldExtensionDescriptor {
  /** Project-relative TypeScript or JavaScript module. Extensions execute as trusted build code. */
  resolve: string
  /** JSON-serializable factory options; functions and environment-specific values are rejected. */
  options?: { [key: string]: CanofoldJsonValue }
}

export interface CanofoldLayoutLabels {
  skipToContent: string
  draftPreview: string
  archivedVersion: string
  pageUnavailableHome: string
  search: string
  searchEmpty: string
  searchUnavailable: string
  language: string
  primaryNavigation: string
  theme: string
  openSidebar: string
  onThisPage: string
  edit: string
  updated: string
  previous: string
  next: string
  close: string
  source: string
  preview: string
  copySource: string
  generatedSource: string
  sourceCopied: string
  quickActions: string
  github: string
  docsNavigation: string
  pageNavigation: string
  advertisement: string
  version: string
}

export interface CanofoldQuickActionMessages {
  headingsTitle: string
  headingsDescription: string
  codeTitle: string
  codeDescription: string
  tableTitle: string
  tableDescription: string
  diagramTitle: string
  diagramDescription: string
  sourceDescription: string
  themeDescription: string
}

interface CanofoldMarkdownElementGroupMessages {
  label?: string
  detail?: string
  hash?: string
}

export interface CanofoldNotFoundMessages {
  title: string
  description: string
  home: string
}

export interface CanofoldLocaleMessages {
  /** Localized interface copy only; theme metadata belongs to ThemeDefinition. */
  labels?: Partial<CanofoldLayoutLabels>
  brandTagline?: string
  quickActions?: Partial<CanofoldQuickActionMessages>
  markdownElementGroups?: Partial<
    Record<CanofoldMarkdownElementGroupId, CanofoldMarkdownElementGroupMessages>
  >
  markdown?: Partial<MarkdownLabels>
  notFound?: Partial<CanofoldNotFoundMessages>
}

interface CanofoldAiConfig {
  /** Stable namespace for cross-location consumers; omitted means source-local identity. */
  contentSpace?: string
  pageIndex: boolean
  fullContent: boolean
  llmsTxt: boolean
  llmsFullTxt: boolean
  markdownIndex: boolean
  pageSummaries: boolean
  codeExamples: boolean
  /** Maximum encoded size of one ai/content JSONL shard. */
  chunkSizeBytes: number
  /** Maximum size of the legacy single-file llms-full.txt body. */
  llmsFullMaxBytes: number
  /** Write a manifest pointer or fail when llms-full.txt exceeds its budget. */
  llmsFullOverflow: 'manifest' | 'error'
  /** Current avoids duplicate historical answers; all publishes every configured version. */
  versions: 'current' | 'all'
}

/** Public authoring contract for canofold.config.ts. Runtime validation uses the matching strict schema. */
export interface CanofoldConfigInput {
  title?: string
  description?: string
  siteUrl?: string
  basePath?: string
  editUrl?: string
  github?: string
  requiredVersion?: string
  docsDir?: string
  outputDir?: string
  /** Publish a raw Markdown mirror beside each HTML page. */
  markdownMirror?: boolean
  /** Project-wide CSS overrides appended after Core and all configured theme styles. */
  styles?: string[]
  /** Theme definitions in menu order; the first appearance is the initial selection. */
  themes?: ThemeDefinition[]
  demos?: {
    engine?: CanofoldDemoEngine
    /** Optional project module that wraps every interactive demo with shared providers. */
    setup?: string
  }
  layout?: {
    /** Structural site-shell settings; visual treatment belongs to themes. */
    header?: boolean
    sidebarWidth?: number | string
    outlineWidth?: number | string
  }
  seo?: {
    robots?: 'allow' | 'disallow'
  }
  markdown?: {
    html?: MarkdownHtmlPolicy
    code?: Pick<MarkdownCodeOptions, 'themes' | 'fallbackLanguage' | 'overflow' | 'unknownLanguage'>
    features?: MarkdownFeatureOptions
    labels?: Partial<MarkdownLabels>
    /** Trusted build plugins; name, version and cacheKey identify their cached output. */
    plugins?: readonly MarkdownPlugin[]
  }
  branding?: {
    /** Brand assets shared by every configured theme. */
    logo?: string
    logoDark?: string
    favicon?: string
  }
  search?: {
    enabled?: boolean
    /** Use `compact` or a provider such as `pagefind()` from @canofold/plugins. */
    provider?: 'compact' | SearchProvider
  }
  checks?: {
    rules?: Partial<Record<CheckRuleId, CheckRuleLevel>>
  }
  sources?: ContentSource[]
  extensions?: CanofoldExtensionDescriptor[]
  navigation?: Record<string, CanofoldNavigationItem[]>
  /** Ordered documentation versions. The first is current; omitted or empty hides the control. */
  versions?: CanofoldVersionItem[]
  redirects?: Record<string, string>
  advertising?: CanofoldAdvertisement
  i18n?: {
    defaultLocale?: string
    locales?: string[]
    localeNames?: Record<string, string>
    /** Per-locale interface copy. Theme and appearance names live in ThemeDefinition. */
    messages?: Record<string, CanofoldLocaleMessages>
  }
  ai?: Partial<CanofoldAiConfig>
}

export interface CanofoldConfig {
  title: string
  description: string
  siteUrl?: string
  basePath: string
  editUrl?: string
  github?: string
  requiredVersion?: string
  docsDir: string
  outputDir: string
  markdownMirror: boolean
  styles: string[]
  themes: ThemeDefinition[]
  demos: {
    engine?: CanofoldDemoEngine
    setup?: string
  }
  layout: {
    header: boolean
    sidebarWidth: number | string
    outlineWidth: number | string
  }
  seo: {
    robots: 'allow' | 'disallow'
  }
  markdown: {
    html: MarkdownHtmlPolicy
    code: MarkdownCodeOptions
    features: MarkdownFeatureOptions
    labels: Partial<MarkdownLabels>
    plugins: readonly MarkdownPlugin[]
  }
  branding: {
    logo?: string
    logoDark?: string
    favicon?: string
  }
  search: CanofoldSearchConfig
  checks: {
    rules: Partial<Record<CheckRuleId, CheckRuleLevel>>
  }
  sources: ContentSource[]
  extensions: CanofoldExtensionDescriptor[]
  navigation: Record<string, CanofoldNavigationItem[]>
  versions: CanofoldVersionItem[]
  redirects: Record<string, string>
  advertising?: CanofoldAdvertisement
  i18n: {
    defaultLocale: string
    locales: string[]
    localeNames?: Record<string, string>
    messages?: Record<string, CanofoldLocaleMessages>
  }
  ai: CanofoldAiConfig
}
