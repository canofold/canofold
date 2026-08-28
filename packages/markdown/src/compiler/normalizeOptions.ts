import type { LanguageInput, ThemeRegistration } from '@shikijs/types'
import docfuseDarkTheme from '../themes/docfuse-dark.json'
import docfuseLightTheme from '../themes/docfuse-light.json'
import { DEFAULT_MARKDOWN_LABELS } from './defaultLabels'
import { normalizeMarkdownPlugins } from './plugins'
import type {
  MarkdownFeatureOptions,
  MarkdownHtmlPolicy,
  MarkdownLabels,
  MarkdownPlugin,
  MarkdownUnknownLanguagePolicy,
  RenderMarkdownOptions
} from './types'

const DEFAULT_CODE_THEMES = {
  light: docfuseLightTheme as ThemeRegistration,
  dark: docfuseDarkTheme as ThemeRegistration
}

function normalizeCodeLanguages(languages: NonNullable<RenderMarkdownOptions['code']>['languages']) {
  if (!languages) return {}
  const entries = Object.entries(languages)
  const alreadyNormalized = entries.every(
    ([language]) => language.length > 0 && language === language.trim().toLowerCase()
  )
  if (alreadyNormalized) return languages

  return Object.fromEntries(
    entries
      .map(([language, input]) => [language.trim().toLowerCase(), input] as const)
      .filter(([language]) => language.length > 0)
  )
}

export interface NormalizedMarkdownOptions {
  htmlPolicy: MarkdownHtmlPolicy
  codeThemes: {
    light: string | ThemeRegistration
    dark: string | ThemeRegistration
  }
  fallbackLanguage: string
  codeLanguages: Readonly<Record<string, LanguageInput>>
  unknownLanguage: MarkdownUnknownLanguagePolicy
  features: Required<MarkdownFeatureOptions>
  labels: MarkdownLabels
  plugins: readonly MarkdownPlugin[]
}

export function normalizeOptions(options: RenderMarkdownOptions = {}): NormalizedMarkdownOptions {
  return {
    htmlPolicy: options.html ?? 'strip',
    codeThemes: {
      light: options.code?.themes?.light ?? DEFAULT_CODE_THEMES.light,
      dark: options.code?.themes?.dark ?? DEFAULT_CODE_THEMES.dark
    },
    fallbackLanguage: options.code?.fallbackLanguage?.trim().toLowerCase() || 'text',
    codeLanguages: normalizeCodeLanguages(options.code?.languages),
    unknownLanguage: options.code?.unknownLanguage ?? 'warn',
    features: {
      callouts: options.features?.callouts !== false,
      tabs: options.features?.tabs !== false,
      codeGroups: options.features?.codeGroups !== false,
      steps: options.features?.steps !== false,
      terminals: options.features?.terminals !== false,
      documentBlocks: options.features?.documentBlocks !== false,
      tables: options.features?.tables ?? options.features?.documentBlocks ?? true,
      codeBlocks: options.features?.codeBlocks !== false
    },
    labels: {
      ...DEFAULT_MARKDOWN_LABELS,
      ...options.labels
    },
    plugins: normalizeMarkdownPlugins(options.plugins)
  }
}
