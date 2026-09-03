import type {
  MarkdownCodeOptions,
  MarkdownFeatureOptions,
  MarkdownHtmlPolicy,
  MarkdownLabels,
  MarkdownPlugin
} from '@canofold/markdown'
import type { MarkdownThemeInput } from '@canofold/markdown/theme'
import type { SearchProvider } from '../search/types'
import { CANOFOLD_MARKDOWN_ELEMENT_GROUP_IDS, THEME_BASE_COLORS } from './constants'

export type ThemeBaseColor = (typeof THEME_BASE_COLORS)[number]
export type CanofoldMarkdownElementGroupId = (typeof CANOFOLD_MARKDOWN_ELEMENT_GROUP_IDS)[number]

export interface CanofoldNavigationItem {
  text: string
  link: string
}

export interface CanofoldVersionItem {
  id: string
  label: string
  docsDir: string
  /** Absolute URL base. The current version normally uses `/`. */
  base: string
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
  labels?: Partial<CanofoldLayoutLabels>
  brandTagline?: string
  quickActions?: Partial<CanofoldQuickActionMessages>
  markdownElementGroups?: Partial<
    Record<CanofoldMarkdownElementGroupId, CanofoldMarkdownElementGroupMessages>
  >
  markdown?: Partial<MarkdownLabels>
  notFound?: Partial<CanofoldNotFoundMessages>
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
  styles?: string[]
  layout?: {
    header?: boolean
  }
  markdown?: {
    html?: MarkdownHtmlPolicy
    code?: Pick<MarkdownCodeOptions, 'themes' | 'fallbackLanguage' | 'unknownLanguage'>
    features?: MarkdownFeatureOptions
    labels?: Partial<MarkdownLabels>
    /**
     * Compiler plugins imported into canofold.config.ts, e.g. from
     * `@canofold/plugins`. They execute as trusted build code; cache identity
     * comes from each plugin's `name`, `version` and `cacheKey`.
     */
    plugins?: readonly MarkdownPlugin[]
  }
  theme?: {
    logo?: string
    logoDark?: string
    favicon?: string
    accentColor?: string
    darkMode?: boolean
    radius?: number | string
    baseColor?: ThemeBaseColor
    sidebarWidth?: number | string
    outlineWidth?: number | string
    tokens?: MarkdownThemeInput
  }
  search?: {
    enabled?: boolean
    /** Use `compact` or a provider such as `pagefind()` from @canofold/plugins. */
    provider?: 'compact' | SearchProvider
  }
  extensions?: CanofoldExtensionDescriptor[]
  navigation?: Record<string, CanofoldNavigationItem[]>
  versions?: {
    current: string
    items: CanofoldVersionItem[]
  }
  redirects?: Record<string, string>
  advertising?: CanofoldAdvertisement
  i18n?: {
    defaultLocale?: string
    locales?: string[]
    localeNames?: Record<string, string>
    messages?: Record<string, CanofoldLocaleMessages>
  }
  ai?: {
    llmsTxt?: boolean
    llmsFullTxt?: boolean
    markdownIndex?: boolean
    pageSummaries?: boolean
    codeExamples?: boolean
    /** Maximum encoded size of one ai/content JSONL shard. */
    chunkSizeBytes?: number
    /** Maximum size of the legacy single-file llms-full.txt body. */
    llmsFullMaxBytes?: number
    /** Write a manifest pointer or fail when llms-full.txt exceeds its budget. */
    llmsFullOverflow?: 'manifest' | 'error'
    /** Current avoids duplicate historical answers; all publishes every configured version. */
    versions?: 'current' | 'all'
  }
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
  styles: string[]
  layout: {
    header: boolean
  }
  markdown: {
    html: MarkdownHtmlPolicy
    code: MarkdownCodeOptions
    features: MarkdownFeatureOptions
    labels: Partial<MarkdownLabels>
    plugins: readonly MarkdownPlugin[]
  }
  theme: {
    logo?: string
    logoDark?: string
    favicon?: string
    accentColor: string
    darkMode: boolean
    radius: number | string
    baseColor: ThemeBaseColor
    sidebarWidth: number | string
    outlineWidth: number | string
    tokens: MarkdownThemeInput
  }
  search: CanofoldSearchConfig
  extensions: CanofoldExtensionDescriptor[]
  navigation: Record<string, CanofoldNavigationItem[]>
  versions: {
    current: string
    items: CanofoldVersionItem[]
  }
  redirects: Record<string, string>
  advertising?: CanofoldAdvertisement
  i18n: {
    defaultLocale: string
    locales: string[]
    localeNames?: Record<string, string>
    messages?: Record<string, CanofoldLocaleMessages>
  }
  ai: {
    llmsTxt: boolean
    llmsFullTxt: boolean
    markdownIndex: boolean
    pageSummaries: boolean
    codeExamples: boolean
    chunkSizeBytes: number
    llmsFullMaxBytes: number
    llmsFullOverflow: 'manifest' | 'error'
    versions: 'current' | 'all'
  }
}
