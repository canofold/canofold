import {
  DEFAULT_SEMANTIC_COLORS,
  DEFAULT_MARKDOWN_THEME,
  markdownThemeDeclarations,
  resolveMarkdownTheme,
  type MarkdownThemeColors,
  type MarkdownThemeMode,
  type ResolvedMarkdownTheme
} from '@canofold/markdown/theme'
import type { CanofoldConfig, ThemeBaseColor } from '../config/types'

type ThemeMode = MarkdownThemeMode

interface PaletteTokenValues {
  background?: string
  foreground?: string
  text?: string
  muted?: string
  muted2?: string
  card?: string
  card2?: string
  soft?: string
  popover?: string
  border?: string
  borderStrong?: string
  hairline?: string
  primary?: string
  primarySoft?: string
  primaryForeground?: string
  primaryDeep?: string
  accent?: string
  info?: string
  infoDeep?: string
  success?: string
  successDeep?: string
  warning?: string
  warningDeep?: string
  danger?: string
  dangerDeep?: string
  codeBackground?: string
  codeForeground?: string
  overlay?: string
  shadow?: string
  shadowSmall?: string
}

const accentColors: Record<string, { light: string; dark: string }> = {
  canofold: { light: DEFAULT_SEMANTIC_COLORS.light.blue, dark: DEFAULT_SEMANTIC_COLORS.dark.blue },
  cyan: { light: DEFAULT_SEMANTIC_COLORS.light.cyan, dark: DEFAULT_SEMANTIC_COLORS.dark.cyan },
  emerald: { light: DEFAULT_SEMANTIC_COLORS.light.green, dark: DEFAULT_SEMANTIC_COLORS.dark.green },
  blue: { light: DEFAULT_SEMANTIC_COLORS.light.blue, dark: DEFAULT_SEMANTIC_COLORS.dark.blue },
  green: { light: DEFAULT_SEMANTIC_COLORS.light.green, dark: DEFAULT_SEMANTIC_COLORS.dark.green },
  red: { light: DEFAULT_SEMANTIC_COLORS.light.red, dark: DEFAULT_SEMANTIC_COLORS.dark.red },
  orange: { light: DEFAULT_SEMANTIC_COLORS.light.orange, dark: DEFAULT_SEMANTIC_COLORS.dark.orange },
  violet: { light: DEFAULT_SEMANTIC_COLORS.light.indigo, dark: DEFAULT_SEMANTIC_COLORS.dark.indigo },
  neutral: { light: 'oklch(0.3 0 0)', dark: 'oklch(0.85 0 0)' }
}

function paletteFromMarkdown(mode: ThemeMode): PaletteTokenValues {
  const colors = DEFAULT_MARKDOWN_THEME.colors[mode]
  return {
    background: colors.canvas,
    foreground: colors.foreground,
    text: colors.text,
    muted: colors.muted,
    muted2: colors.mutedSubtle,
    card: colors.surface,
    card2: colors.surfaceSecondary,
    soft: colors.surfaceSoft,
    popover: colors.surfaceElevated,
    border: colors.border,
    borderStrong: colors.borderStrong,
    hairline: colors.hairline,
    primarySoft: colors.primarySoft,
    primaryForeground: colors.primaryForeground,
    primaryDeep: colors.primaryDeep,
    accent: colors.accent,
    info: colors.info,
    infoDeep: colors.infoDeep,
    success: colors.success,
    successDeep: colors.successDeep,
    warning: colors.warning,
    warningDeep: colors.warningDeep,
    danger: colors.danger,
    dangerDeep: colors.dangerDeep,
    codeBackground: colors.codeBackground,
    codeForeground: colors.codeForeground,
    overlay: colors.overlay,
    shadow: colors.shadow,
    shadowSmall: colors.shadowSmall
  }
}

const basePalettes = {
  paper: {
    light: paletteFromMarkdown('light'),
    dark: paletteFromMarkdown('dark')
  },
  neutral: {
    light: {
      background: 'oklch(0.994 0.003 95)',
      foreground: 'oklch(0.205 0.008 80)',
      text: 'color-mix(in oklab, var(--cf-ink) 88%, var(--cf-ink-secondary))',
      muted: 'oklch(0.505 0.01 80)',
      muted2: 'oklch(0.62 0.01 80)',
      card: 'oklch(0.985 0.004 95)',
      card2: 'oklch(0.96 0.004 95)',
      soft: 'oklch(0.955 0.006 95)',
      popover: 'oklch(0.997 0.002 95)',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'oklch(0.93 0.004 90)'
    },
    dark: {
      background: 'oklch(0.17 0.006 85)',
      foreground: 'oklch(0.92 0.005 90)',
      text: 'color-mix(in oklab, var(--cf-ink) 88%, var(--cf-ink-secondary))',
      muted: 'oklch(0.66 0.01 88)',
      muted2: 'oklch(0.54 0.01 88)',
      card: 'oklch(0.205 0.006 85)',
      card2: 'oklch(0.235 0.006 85)',
      soft: 'oklch(0.255 0.007 85)',
      popover: 'oklch(0.21 0.006 85)',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'oklch(1 0 0 / 6%)'
    }
  },
  slate: {
    light: {
      background: 'oklch(0.99 0.004 250)',
      foreground: 'oklch(0.22 0.018 255)',
      text: 'color-mix(in oklab, var(--cf-ink) 88%, var(--cf-ink-secondary))',
      muted: 'oklch(0.49 0.02 255)',
      muted2: 'oklch(0.61 0.018 255)',
      card: 'oklch(0.982 0.005 250)',
      card2: 'oklch(0.955 0.007 250)',
      soft: 'oklch(0.95 0.01 250)',
      popover: 'oklch(0.996 0.003 250)',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'oklch(0.93 0.008 250)'
    },
    dark: {
      background: 'oklch(0.17 0.014 255)',
      foreground: 'oklch(0.92 0.006 250)',
      text: 'color-mix(in oklab, var(--cf-ink) 88%, var(--cf-ink-secondary))',
      muted: 'oklch(0.68 0.018 250)',
      muted2: 'oklch(0.54 0.018 250)',
      card: 'oklch(0.21 0.014 255)',
      card2: 'oklch(0.25 0.014 255)',
      soft: 'oklch(0.27 0.014 255)',
      popover: 'oklch(0.215 0.014 255)',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'oklch(1 0 0 / 6%)'
    }
  },
  zinc: {
    light: {
      background: 'oklch(0.992 0 0)',
      foreground: 'oklch(0.21 0.005 285)',
      text: 'color-mix(in oklab, var(--cf-ink) 88%, var(--cf-ink-secondary))',
      muted: 'oklch(0.5 0.01 285)',
      muted2: 'oklch(0.62 0.008 285)',
      card: 'oklch(0.982 0.002 285)',
      card2: 'oklch(0.955 0.003 285)',
      soft: 'oklch(0.95 0.003 285)',
      popover: 'oklch(0.996 0 0)',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'oklch(0.93 0.003 285)'
    },
    dark: {
      background: 'oklch(0.17 0.004 285)',
      foreground: 'oklch(0.92 0.003 285)',
      text: 'color-mix(in oklab, var(--cf-ink) 88%, var(--cf-ink-secondary))',
      muted: 'oklch(0.67 0.006 285)',
      muted2: 'oklch(0.54 0.006 285)',
      card: 'oklch(0.21 0.004 285)',
      card2: 'oklch(0.245 0.004 285)',
      soft: 'oklch(0.265 0.004 285)',
      popover: 'oklch(0.215 0.004 285)',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'oklch(1 0 0 / 6%)'
    }
  },
  stone: {
    light: {
      background: 'oklch(0.992 0.004 70)',
      foreground: 'oklch(0.22 0.01 70)',
      text: 'color-mix(in oklab, var(--cf-ink) 88%, var(--cf-ink-secondary))',
      muted: 'oklch(0.5 0.012 70)',
      muted2: 'oklch(0.62 0.012 70)',
      card: 'oklch(0.982 0.005 70)',
      card2: 'oklch(0.955 0.006 70)',
      soft: 'oklch(0.95 0.007 70)',
      popover: 'oklch(0.996 0.003 70)',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'oklch(0.93 0.006 70)'
    },
    dark: {
      background: 'oklch(0.17 0.008 70)',
      foreground: 'oklch(0.92 0.005 70)',
      text: 'color-mix(in oklab, var(--cf-ink) 88%, var(--cf-ink-secondary))',
      muted: 'oklch(0.67 0.01 70)',
      muted2: 'oklch(0.54 0.01 70)',
      card: 'oklch(0.21 0.008 70)',
      card2: 'oklch(0.245 0.008 70)',
      soft: 'oklch(0.265 0.008 70)',
      popover: 'oklch(0.215 0.008 70)',
      border: 'transparent',
      borderStrong: 'transparent',
      hairline: 'oklch(1 0 0 / 6%)'
    }
  }
} satisfies Record<ThemeBaseColor, Record<ThemeMode, PaletteTokenValues>>

function cssLength(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value
}

function accentFor(mode: ThemeMode, value: string) {
  return accentColors[value]?.[mode] ?? value
}

function resolveTokens(config: CanofoldConfig, mode: ThemeMode): PaletteTokenValues {
  const primary = accentFor(mode, config.theme.accentColor)
  const palette: PaletteTokenValues = basePalettes[config.theme.baseColor][mode]
  const usesPaletteAccent = config.theme.accentColor === 'canofold'
  const fallback = DEFAULT_MARKDOWN_THEME.colors[mode]
  return {
    ...palette,
    primary,
    primarySoft:
      usesPaletteAccent && palette.primarySoft
        ? palette.primarySoft
        : `color-mix(in oklab, ${primary} 12%, var(--cf-surface))`,
    primaryForeground:
      usesPaletteAccent && palette.primaryForeground
        ? palette.primaryForeground
        : `color-mix(in oklab, ${primary} 76%, var(--cf-ink))`,
    primaryDeep:
      usesPaletteAccent && palette.primaryDeep
        ? palette.primaryDeep
        : `color-mix(in oklab, ${primary} 84%, var(--cf-ink))`,
    accent: palette.accent ?? primary,
    info: palette.info ?? fallback.info,
    infoDeep: palette.infoDeep ?? fallback.infoDeep,
    success: palette.success ?? fallback.success,
    successDeep: palette.successDeep ?? fallback.successDeep,
    warning: palette.warning ?? fallback.warning,
    warningDeep: palette.warningDeep ?? fallback.warningDeep,
    danger: palette.danger ?? fallback.danger,
    dangerDeep: palette.dangerDeep ?? fallback.dangerDeep,
    codeBackground: palette.codeBackground ?? palette.card2 ?? palette.card,
    codeForeground: palette.codeForeground ?? palette.foreground,
    overlay: palette.overlay ?? fallback.overlay,
    shadow: palette.shadow ?? fallback.shadow,
    shadowSmall: palette.shadowSmall ?? fallback.shadowSmall
  }
}

function themeColors(tokens: PaletteTokenValues, mode: ThemeMode): MarkdownThemeColors {
  const fallback = DEFAULT_MARKDOWN_THEME.colors[mode]
  return {
    canvas: tokens.background ?? fallback.canvas,
    foreground: tokens.foreground ?? fallback.foreground,
    text: tokens.text ?? fallback.text,
    muted: tokens.muted ?? fallback.muted,
    mutedSubtle: tokens.muted2 ?? fallback.mutedSubtle,
    surface: tokens.card ?? fallback.surface,
    surfaceSecondary: tokens.card2 ?? fallback.surfaceSecondary,
    surfaceSoft: tokens.soft ?? fallback.surfaceSoft,
    surfaceElevated: tokens.popover ?? fallback.surfaceElevated,
    border: tokens.border ?? fallback.border,
    borderStrong: tokens.borderStrong ?? fallback.borderStrong,
    hairline: tokens.hairline ?? fallback.hairline,
    primary: tokens.primary ?? fallback.primary,
    primarySoft: tokens.primarySoft ?? fallback.primarySoft,
    primaryForeground: tokens.primaryForeground ?? fallback.primaryForeground,
    primaryDeep: tokens.primaryDeep ?? fallback.primaryDeep,
    accent: tokens.accent ?? fallback.accent,
    info: tokens.info ?? fallback.info,
    infoDeep: tokens.infoDeep ?? fallback.infoDeep,
    success: tokens.success ?? fallback.success,
    successDeep: tokens.successDeep ?? fallback.successDeep,
    warning: tokens.warning ?? fallback.warning,
    warningDeep: tokens.warningDeep ?? fallback.warningDeep,
    danger: tokens.danger ?? fallback.danger,
    dangerDeep: tokens.dangerDeep ?? fallback.dangerDeep,
    codeBackground: tokens.codeBackground ?? fallback.codeBackground,
    codeForeground: tokens.codeForeground ?? fallback.codeForeground,
    overlay: tokens.overlay ?? fallback.overlay,
    shadow: tokens.shadow ?? fallback.shadow,
    shadowSmall: tokens.shadowSmall ?? fallback.shadowSmall
  }
}

function resolveCanofoldTheme(config: CanofoldConfig): ResolvedMarkdownTheme {
  const radius = cssLength(config.theme.radius)
  return resolveMarkdownTheme({
    colors: {
      light: {
        ...themeColors(resolveTokens(config, 'light'), 'light'),
        ...config.theme.tokens.colors?.light
      },
      dark: { ...themeColors(resolveTokens(config, 'dark'), 'dark'), ...config.theme.tokens.colors?.dark }
    },
    typography: config.theme.tokens.typography,
    layout: config.theme.tokens.layout,
    geometry: {
      radiusSmall: radius,
      radiusMedium: radius,
      radiusLarge: radius,
      ...config.theme.tokens.geometry
    },
    motion: config.theme.tokens.motion
  })
}

function paletteCss(mode: ThemeMode, theme: ResolvedMarkdownTheme) {
  const primary = theme.colors[mode].primary

  return `${markdownThemeDeclarations(theme, mode)}
  --cf-accent-50: color-mix(in oklab, ${primary} 8%, var(--cf-surface));
  --cf-accent-100: color-mix(in oklab, ${primary} 16%, var(--cf-surface));
  --cf-accent-200: color-mix(in oklab, ${primary} 28%, var(--cf-surface));
  --cf-accent-300: color-mix(in oklab, ${primary} 48%, var(--cf-surface));
  --cf-accent-400: color-mix(in oklab, ${primary} 78%, var(--cf-surface));
  --cf-accent-600: color-mix(in oklab, ${primary} 88%, var(--cf-ink));
  --cf-accent-700: color-mix(in oklab, ${primary} 76%, var(--cf-ink));
  --cf-accent-800: color-mix(in oklab, ${primary} 62%, var(--cf-ink));
  --cf-accent-900: color-mix(in oklab, ${primary} 48%, var(--cf-ink));`
}

/**
 * Emit Canofold design-token overrides for the configured palette and radius.
 * Appended after the compiled stylesheet so project-level configuration wins.
 */
export function buildThemeVariables(config: CanofoldConfig) {
  const theme = resolveCanofoldTheme(config)
  const sidebarWidth = cssLength(config.theme.sidebarWidth)
  const outlineWidth = cssLength(config.theme.outlineWidth)

  const light = `:root {
${paletteCss('light', theme)}
  --cf-sidebar-width: ${sidebarWidth};
  --cf-outline-width: ${outlineWidth};
}`

  if (!config.theme.darkMode) return light

  return `${light}
.dark {
${paletteCss('dark', theme)}
}`
}
