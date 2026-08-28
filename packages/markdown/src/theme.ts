export type MarkdownThemeMode = 'light' | 'dark'

export interface MarkdownThemeColors {
  canvas: string
  foreground: string
  text: string
  muted: string
  mutedSubtle: string
  surface: string
  surfaceSecondary: string
  surfaceSoft: string
  surfaceElevated: string
  border: string
  borderStrong: string
  hairline: string
  primary: string
  primarySoft: string
  primaryForeground: string
  primaryDeep: string
  accent: string
  info: string
  infoDeep: string
  success: string
  successDeep: string
  warning: string
  warningDeep: string
  danger: string
  dangerDeep: string
  codeBackground: string
  codeForeground: string
  overlay: string
  shadow: string
  shadowSmall: string
}

export interface MarkdownThemeTypography {
  displayFont: string
  sansFont: string
  monoFont: string
  bodySize: string
  bodyLineHeight: string
  headingLineHeight: string
  heading1Size: string
  heading2Size: string
  heading3Size: string
  heading4Size: string
  heading5Size: string
  heading6Size: string
}

export interface MarkdownThemeLayout {
  readingWidth: string
  contentWidth: string
  gutter: string
}

export interface MarkdownThemeGeometry {
  radiusSmall: string
  radiusMedium: string
  radiusLarge: string
  radiusFull: string
}

export interface MarkdownThemeMotion {
  durationFast: string
  durationNormal: string
  easing: string
}

export interface ResolvedMarkdownTheme {
  colors: Record<MarkdownThemeMode, MarkdownThemeColors>
  typography: MarkdownThemeTypography
  layout: MarkdownThemeLayout
  geometry: MarkdownThemeGeometry
  motion: MarkdownThemeMotion
}

export interface MarkdownThemeInput {
  colors?: Partial<Record<MarkdownThemeMode, Partial<MarkdownThemeColors>>>
  typography?: Partial<MarkdownThemeTypography>
  layout?: Partial<MarkdownThemeLayout>
  geometry?: Partial<MarkdownThemeGeometry>
  motion?: Partial<MarkdownThemeMotion>
}

/** Default semantic color anchors shared by Markdown and the Docfuse shell. */
export const DEFAULT_SEMANTIC_COLORS = {
  light: {
    blue: '#0088ff',
    indigo: '#6155f5',
    cyan: '#00c0e8',
    green: '#34c759',
    orange: '#ff8d28',
    red: '#ff383c',
    yellow: '#ffcc00'
  },
  dark: {
    blue: '#0091ff',
    indigo: '#6d7cff',
    cyan: '#3cd3fe',
    green: '#30d158',
    orange: '#ff9230',
    red: '#ff4245',
    yellow: '#ffd600'
  }
} as const

const fontDisplay =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
const fontSans =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"

export const DEFAULT_MARKDOWN_THEME: ResolvedMarkdownTheme = {
  colors: {
    light: {
      canvas: '#f6f6f8',
      foreground: '#1d1d1f',
      text: '#363638',
      muted: '#66666b',
      mutedSubtle: '#737379',
      surface: '#ffffff',
      surfaceSecondary: '#f3f3f5',
      surfaceSoft: '#f7f7f9',
      surfaceElevated: '#ffffff',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'rgb(29 29 31 / 0.1)',
      primary: DEFAULT_SEMANTIC_COLORS.light.blue,
      primarySoft: 'color-mix(in srgb, var(--df-accent-500) 10%, white)',
      primaryForeground: DEFAULT_SEMANTIC_COLORS.light.blue,
      primaryDeep: 'color-mix(in srgb, var(--df-accent-500) 78%, black)',
      accent: DEFAULT_SEMANTIC_COLORS.light.indigo,
      info: DEFAULT_SEMANTIC_COLORS.light.blue,
      infoDeep: DEFAULT_SEMANTIC_COLORS.light.blue,
      success: DEFAULT_SEMANTIC_COLORS.light.green,
      successDeep: DEFAULT_SEMANTIC_COLORS.light.green,
      warning: DEFAULT_SEMANTIC_COLORS.light.orange,
      warningDeep: DEFAULT_SEMANTIC_COLORS.light.orange,
      danger: DEFAULT_SEMANTIC_COLORS.light.red,
      dangerDeep: DEFAULT_SEMANTIC_COLORS.light.red,
      codeBackground: '#f6f6f8',
      codeForeground: '#1d1d1f',
      overlay: 'rgb(0 0 0 / 0.42)',
      shadow: '0 20px 52px rgb(29 29 31 / 0.14)',
      shadowSmall: '0 8px 22px rgb(29 29 31 / 0.09)'
    },
    dark: {
      canvas: '#1c1c1e',
      foreground: '#f5f5f7',
      text: '#e3e3e8',
      muted: '#b9b9c0',
      mutedSubtle: '#98989f',
      surface: '#232326',
      surfaceSecondary: '#343438',
      surfaceSoft: '#2b2b2f',
      surfaceElevated: '#3b3b40',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'rgb(255 255 255 / 0.12)',
      primary: DEFAULT_SEMANTIC_COLORS.dark.blue,
      primarySoft: 'color-mix(in srgb, var(--df-accent-500) 18%, var(--df-surface))',
      primaryForeground: DEFAULT_SEMANTIC_COLORS.dark.blue,
      primaryDeep: 'color-mix(in srgb, var(--df-accent-500) 76%, white)',
      accent: DEFAULT_SEMANTIC_COLORS.dark.indigo,
      info: DEFAULT_SEMANTIC_COLORS.dark.blue,
      infoDeep: DEFAULT_SEMANTIC_COLORS.dark.blue,
      success: DEFAULT_SEMANTIC_COLORS.dark.green,
      successDeep: DEFAULT_SEMANTIC_COLORS.dark.green,
      warning: DEFAULT_SEMANTIC_COLORS.dark.orange,
      warningDeep: DEFAULT_SEMANTIC_COLORS.dark.orange,
      danger: DEFAULT_SEMANTIC_COLORS.dark.red,
      dangerDeep: DEFAULT_SEMANTIC_COLORS.dark.red,
      codeBackground: '#202023',
      codeForeground: '#f5f5f7',
      overlay: 'rgb(0 0 0 / 0.62)',
      shadow: '0 22px 58px rgb(0 0 0 / 0.34)',
      shadowSmall: '0 10px 28px rgb(0 0 0 / 0.24)'
    }
  },
  typography: {
    displayFont: fontDisplay,
    sansFont: fontSans,
    monoFont: "'SFMono-Regular', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, monospace",
    bodySize: '1rem',
    bodyLineHeight: '1.6',
    headingLineHeight: '1.2',
    heading1Size: '2rem',
    heading2Size: '1.625rem',
    heading3Size: '1.375rem',
    heading4Size: '1.25rem',
    heading5Size: '1.125rem',
    heading6Size: '1.0625rem'
  },
  layout: {
    readingWidth: '100%',
    contentWidth: '100%',
    gutter: '2.25rem'
  },
  geometry: {
    radiusSmall: '4px',
    radiusMedium: '6px',
    radiusLarge: '8px',
    radiusFull: '8px'
  },
  motion: {
    durationFast: '120ms',
    durationNormal: '220ms',
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
  }
}

export const MARKDOWN_THEME_VARIABLES = {
  colors: {
    canvas: '--df-canvas',
    foreground: '--df-ink',
    text: '--df-ink-body',
    muted: '--df-ink-secondary',
    mutedSubtle: '--df-ink-tertiary',
    surface: '--df-surface',
    surfaceSecondary: '--df-surface-secondary',
    surfaceSoft: '--df-surface-soft',
    surfaceElevated: '--df-surface-elevated',
    border: '--df-border',
    borderStrong: '--df-border-strong',
    hairline: '--df-hairline',
    primary: '--df-accent-500',
    primarySoft: '--df-accent-soft',
    primaryForeground: '--df-accent-strong',
    primaryDeep: '--df-accent-deep',
    accent: '--df-accent-secondary',
    info: '--df-info',
    infoDeep: '--df-info-deep',
    success: '--df-success',
    successDeep: '--df-success-deep',
    warning: '--df-warning',
    warningDeep: '--df-warning-deep',
    danger: '--df-danger',
    dangerDeep: '--df-danger-deep',
    codeBackground: '--df-surface-code',
    codeForeground: '--df-code-ink',
    overlay: '--df-overlay',
    shadow: '--df-shadow-raised',
    shadowSmall: '--df-shadow-raised-sm'
  },
  typography: {
    displayFont: '--df-font-display',
    sansFont: '--df-font-sans',
    monoFont: '--df-font-mono',
    bodySize: '--df-body-font-size',
    bodyLineHeight: '--df-body-line-height',
    headingLineHeight: '--df-heading-line-height',
    heading1Size: '--df-heading-1-size',
    heading2Size: '--df-heading-2-size',
    heading3Size: '--df-heading-3-size',
    heading4Size: '--df-heading-4-size',
    heading5Size: '--df-heading-5-size',
    heading6Size: '--df-heading-6-size'
  },
  layout: {
    readingWidth: '--df-reading-width',
    contentWidth: '--df-content-width',
    gutter: '--df-site-gutter'
  },
  geometry: {
    radiusSmall: '--df-radius-sm',
    radiusMedium: '--df-radius-md',
    radiusLarge: '--df-radius-lg',
    radiusFull: '--df-radius-full'
  },
  motion: {
    durationFast: '--df-duration-fast',
    durationNormal: '--df-duration-normal',
    easing: '--df-easing-default'
  }
} as const

type ThemeGroup = Exclude<keyof MarkdownThemeInput, 'colors'>

function assertValues(group: string, value: unknown, allowed: readonly string[]) {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Markdown theme ${group} must be an object`)
  }
  for (const [key, token] of Object.entries(value)) {
    if (!allowed.includes(key)) throw new TypeError(`Unknown Markdown theme token: ${group}.${key}`)
    if (typeof token !== 'string' || token.trim() === '') {
      throw new TypeError(`Markdown theme token ${group}.${key} must be a non-empty CSS value`)
    }
  }
}

/** Validate and complete a partial public theme contract. */
export function resolveMarkdownTheme(input: MarkdownThemeInput = {}): ResolvedMarkdownTheme {
  const groups = ['typography', 'layout', 'geometry', 'motion'] as const satisfies readonly ThemeGroup[]
  assertValues('colors.light', input.colors?.light, Object.keys(MARKDOWN_THEME_VARIABLES.colors))
  assertValues('colors.dark', input.colors?.dark, Object.keys(MARKDOWN_THEME_VARIABLES.colors))
  for (const group of groups) {
    assertValues(group, input[group], Object.keys(MARKDOWN_THEME_VARIABLES[group]))
  }
  return {
    colors: {
      light: { ...DEFAULT_MARKDOWN_THEME.colors.light, ...input.colors?.light },
      dark: { ...DEFAULT_MARKDOWN_THEME.colors.dark, ...input.colors?.dark }
    },
    typography: { ...DEFAULT_MARKDOWN_THEME.typography, ...input.typography },
    layout: { ...DEFAULT_MARKDOWN_THEME.layout, ...input.layout },
    geometry: { ...DEFAULT_MARKDOWN_THEME.geometry, ...input.geometry },
    motion: { ...DEFAULT_MARKDOWN_THEME.motion, ...input.motion }
  }
}

function groupDeclarations<T extends object>(values: T, variables: { readonly [Key in keyof T]: string }) {
  return (Object.keys(values) as Array<keyof T>)
    .map((key) => `  ${variables[key]}: ${String(values[key])};`)
    .join('\n')
}

/** Emit only the documented public variables for one resolved mode. */
export function markdownThemeDeclarations(theme: ResolvedMarkdownTheme, mode: MarkdownThemeMode) {
  return [
    groupDeclarations(theme.colors[mode], MARKDOWN_THEME_VARIABLES.colors),
    groupDeclarations(theme.typography, MARKDOWN_THEME_VARIABLES.typography),
    groupDeclarations(theme.layout, MARKDOWN_THEME_VARIABLES.layout),
    groupDeclarations(theme.geometry, MARKDOWN_THEME_VARIABLES.geometry),
    groupDeclarations(theme.motion, MARKDOWN_THEME_VARIABLES.motion)
  ].join('\n')
}
