import type { CanofoldConfig } from './types'
import { DEFAULT_BRAND_ASSET_PATHS } from '../brand'
import { canofold } from '@canofold/themes'

export const defaultConfig: CanofoldConfig = {
  title: 'Canofold',
  description: 'Technical documentation',
  basePath: '/',
  docsDir: 'docs',
  outputDir: '.canofold/dist',
  markdownMirror: true,
  styles: [],
  themes: [canofold],
  demos: {},
  layout: {
    header: true,
    sidebarWidth: '17.5rem',
    outlineWidth: '18.75rem'
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
  branding: {
    logo: DEFAULT_BRAND_ASSET_PATHS.logo,
    logoDark: DEFAULT_BRAND_ASSET_PATHS.logoDark,
    favicon: DEFAULT_BRAND_ASSET_PATHS.favicon
  },
  search: {
    enabled: true,
    provider: 'compact'
  },
  checks: { rules: {} },
  extensions: [],
  navigation: {},
  versions: [],
  redirects: {},
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh'],
    localeNames: {},
    messages: {}
  },
  ai: {
    pageIndex: true,
    fullContent: true,
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
