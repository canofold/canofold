import type { CanofoldConfig } from '../config/types'
import type { ThemeDefinition, ThemeNames } from '@canofold/themes'
import { languageCode, localizedValue } from '../config/locale'

function cssLength(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value
}

/** Emit site-layout variables. Visual tokens are owned by each configured theme. */
export function buildLayoutVariables(config: CanofoldConfig) {
  return `:root {
  --cf-sidebar-width: ${cssLength(config.layout.sidebarWidth)};
  --cf-outline-width: ${cssLength(config.layout.outlineWidth)};
}`
}

export interface ThemeSelection {
  value: string
  colorScheme: 'light' | 'dark'
  label: string
}

export function themeNameFor(names: ThemeNames, locale: string): string {
  return (
    localizedValue(names, locale) ??
    localizedValue(names, languageCode(locale)) ??
    localizedValue(names, 'en') ??
    Object.values(names)[0] ??
    ''
  )
}

export function themeSelections(themes: readonly ThemeDefinition[], locale: string): ThemeSelection[] {
  return themes.flatMap((theme) => {
    const themeName = themeNameFor(theme.name, locale) || theme.id
    return theme.appearances.map((appearance) => ({
      value: `${theme.id}:${appearance.id}`,
      colorScheme: appearance.colorScheme,
      label:
        theme.appearances.length === 1
          ? themeName
          : `${themeName} · ${themeNameFor(appearance.name, locale) || appearance.id}`
    }))
  })
}
