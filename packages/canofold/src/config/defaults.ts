import type { CanofoldConfig } from './types'
import { DEFAULT_BRAND_ASSET_PATHS } from '../brand'

export const defaultConfig: CanofoldConfig = {
  title: 'Canofold',
  description: 'Technical documentation',
  basePath: '/',
  docsDir: 'docs',
  outputDir: '.canofold/dist',
  styles: [],
  demos: {},
  layout: {
    header: true
  },
  seo: {
    robots: 'allow'
  },
  markdown: {
    html: 'sanitize',
    code: {},
    features: {},
    labels: {},
    plugins: []
  },
  theme: {
    accentColor: 'canofold',
    darkMode: false,
    radius: 8,
    baseColor: 'paper',
    sidebarWidth: '17.5rem',
    outlineWidth: '18.75rem',
    logo: DEFAULT_BRAND_ASSET_PATHS.logo,
    logoDark: DEFAULT_BRAND_ASSET_PATHS.logoDark,
    favicon: DEFAULT_BRAND_ASSET_PATHS.favicon,
    tokens: {}
  },
  search: {
    enabled: true,
    provider: 'compact'
  },
  extensions: [],
  navigation: {},
  versions: {
    current: 'current',
    items: [{ id: 'current', label: 'Current', docsDir: 'docs', base: '/' }]
  },
  redirects: {},
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh'],
    localeNames: {},
    messages: {}
  },
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownIndex: true,
    pageSummaries: true,
    codeExamples: true,
    chunkSizeBytes: 256 * 1024,
    llmsFullMaxBytes: 10 * 1024 * 1024,
    llmsFullOverflow: 'manifest',
    versions: 'current'
  }
}
