export type ThemeNames = Readonly<Record<string, string>>

export interface ThemeAppearance {
  /** Stable identifier persisted in the reader's browser. */
  readonly id: string
  /** Localized display names keyed by BCP 47 locale or base language. */
  readonly name: ThemeNames
  /** Browser color scheme and the semantic mode exposed to theme CSS. */
  readonly colorScheme: 'light' | 'dark'
}

export interface ThemeDefinition {
  /** Stable theme identifier used by data-cf-theme. */
  readonly id: string
  /** Localized display names keyed by BCP 47 locale or base language. */
  readonly name: ThemeNames
  /** CSS package exports or project-relative CSS files, in cascade order. */
  readonly styles: readonly string[]
  /** One or more selectable appearances owned by this theme. */
  readonly appearances: readonly ThemeAppearance[]
}
