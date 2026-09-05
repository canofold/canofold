import type { CanofoldConfig } from './types'

export const defaultConfig: CanofoldConfig = {
  title: 'Canofold',
  description: 'Technical documentation',
  basePath: '/',
  docsDir: 'docs',
  outputDir: '.canofold/dist',
  styles: [],
  layout: {
    header: true
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
