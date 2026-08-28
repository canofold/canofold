import type {
  MarkdownCodeOptions,
  MarkdownFeatureOptions,
  MarkdownHtmlPolicy,
  MarkdownLabels,
  MarkdownPlugin
} from '@docfuse/markdown'
import type { MarkdownThemeInput } from '@docfuse/markdown/theme'
import type { SearchProvider } from '../search/types'
import { DOCFUSE_MARKDOWN_ELEMENT_GROUP_IDS, THEME_BASE_COLORS } from './constants'

export type ThemeBaseColor = (typeof THEME_BASE_COLORS)[number]
export type DocfuseMarkdownElementGroupId = (typeof DOCFUSE_MARKDOWN_ELEMENT_GROUP_IDS)[number]

export interface DocfuseNavigationItem {
  text: string
  link: string
}

export interface DocfuseVersionItem {
  id: string
  label: string
  docsDir: string
  /** Absolute URL base. The current version normally uses `/`. */
  base: string
}

export interface DocfuseAdvertisement {
  image: string
  href: string
  alt: string
  label?: string
}

export interface DocfuseSentryMonitoring {
  provider: 'sentry'
  /** Sentry's browser loader URL, for example https://js.sentry-cdn.com/{key}.min.js. */
  loaderUrl: string
  environment?: string
  release?: string
  tracesSampleRate?: number
}

export interface DocfuseSearchConfig {
  enabled: boolean
  provider: 'compact' | SearchProvider
}

export type DocfuseJsonValue =
  string | number | boolean | null | DocfuseJsonValue[] | { [key: string]: DocfuseJsonValue }

export interface DocfuseExtensionDescriptor {
  /** Project-relative TypeScript or JavaScript module. Extensions execute as trusted build code. */
  resolve: string
  /** JSON-serializable factory options; functions and environment-specific values are rejected. */
  options?: { [key: string]: DocfuseJsonValue }
}

export interface DocfuseLayoutLabels {
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

export interface DocfuseQuickActionMessages {
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

interface DocfuseMarkdownElementGroupMessages {
  label?: string
  detail?: string
  hash?: string
}

export interface DocfuseNotFoundMessages {
  title: string
  description: string
  home: string
}

export interface DocfuseLocaleMessages {
  labels?: Partial<DocfuseLayoutLabels>
  brandTagline?: string
  quickActions?: Partial<DocfuseQuickActionMessages>
  markdownElementGroups?: Partial<Record<DocfuseMarkdownElementGroupId, DocfuseMarkdownElementGroupMessages>>
  markdown?: Partial<MarkdownLabels>
  notFound?: Partial<DocfuseNotFoundMessages>
}

/** Public authoring contract for docfuse.config.ts. Runtime validation uses the matching strict schema. */
export interface DocfuseConfigInput {
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
     * Compiler plugins imported into docfuse.config.ts, e.g. from
     * `@docfuse/plugins`. They execute as trusted build code; cache identity
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
    /** Use `compact` or a provider such as `pagefind()` from @docfuse/plugins. */
    provider?: 'compact' | SearchProvider
  }
  extensions?: DocfuseExtensionDescriptor[]
  navigation?: Record<string, DocfuseNavigationItem[]>
  versions?: {
    current: string
    items: DocfuseVersionItem[]
  }
  redirects?: Record<string, string>
  advertising?: DocfuseAdvertisement
  monitoring?: DocfuseSentryMonitoring
  i18n?: {
    defaultLocale?: string
    locales?: string[]
    localeNames?: Record<string, string>
    messages?: Record<string, DocfuseLocaleMessages>
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

export interface DocfuseConfig {
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
  search: DocfuseSearchConfig
  extensions: DocfuseExtensionDescriptor[]
  navigation: Record<string, DocfuseNavigationItem[]>
  versions: {
    current: string
    items: DocfuseVersionItem[]
  }
  redirects: Record<string, string>
  advertising?: DocfuseAdvertisement
  monitoring?: DocfuseSentryMonitoring
  i18n: {
    defaultLocale: string
    locales: string[]
    localeNames?: Record<string, string>
    messages?: Record<string, DocfuseLocaleMessages>
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
