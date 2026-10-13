import type { ThemeAppearance, ThemeDefinition, ThemeNames } from './types'

const identifierPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const themeFields = new Set(['id', 'name', 'styles', 'appearances'])
const appearanceFields = new Set(['id', 'name', 'colorScheme'])

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function rejectUnknownFields(value: Record<string, unknown>, fields: ReadonlySet<string>, field: string) {
  const unknownFields = Object.keys(value).filter((key) => !fields.has(key))
  if (unknownFields.length > 0) {
    throw new TypeError(
      `${field} contains unknown field${unknownFields.length === 1 ? '' : 's'}: ${unknownFields.join(', ')}`
    )
  }
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !identifierPattern.test(value)) {
    throw new TypeError(`${field} must be a lowercase kebab-case identifier`)
  }
  return value
}

function localeIdentifier(value: string, field: string): string {
  try {
    const [canonicalLocale] = Intl.getCanonicalLocales(value)
    if (canonicalLocale) return canonicalLocale
  } catch {
    // The error below keeps the public contract independent from engine-specific RangeError messages.
  }
  throw new TypeError(`${field} contains invalid locale "${value}"`)
}

function localizedNames(value: unknown, field: string): ThemeNames {
  const input = record(value, field)
  const entries = Object.entries(input)
  if (entries.length === 0) {
    throw new TypeError(`${field} must contain at least one localized name`)
  }

  const names: Record<string, string> = {}
  for (const [locale, name] of entries) {
    const canonicalLocale = localeIdentifier(locale, field)
    if (typeof name !== 'string' || !name.trim()) {
      throw new TypeError(`${field} must contain non-empty localized names`)
    }
    if (Object.hasOwn(names, canonicalLocale)) {
      throw new TypeError(`${field} contains duplicate locale "${canonicalLocale}"`)
    }
    names[canonicalLocale] = name.trim()
  }

  return Object.freeze(names)
}

function appearances(value: unknown): readonly ThemeAppearance[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('theme.appearances must contain at least one appearance')
  }

  const ids = new Set<string>()
  return Object.freeze(
    value.map((value, index) => {
      const field = `theme.appearances[${index}]`
      const input = record(value, field)
      rejectUnknownFields(input, appearanceFields, field)
      const id = identifier(input.id, `${field}.id`)
      if (ids.has(id)) {
        throw new TypeError(`theme.appearances must not contain duplicate id "${id}"`)
      }
      ids.add(id)
      if (input.colorScheme !== 'light' && input.colorScheme !== 'dark') {
        throw new TypeError(`${field}.colorScheme must be light or dark`)
      }
      return Object.freeze({
        id,
        name: localizedNames(input.name, `${field}.name`),
        colorScheme: input.colorScheme
      })
    })
  )
}

/** Validate, normalize, and freeze a reusable Canofold theme definition. */
export function defineTheme(theme: ThemeDefinition): ThemeDefinition {
  const input = record(theme, 'theme')
  rejectUnknownFields(input, themeFields, 'theme')
  const id = identifier(input.id, 'theme.id')

  if (!Array.isArray(input.styles) || input.styles.length === 0) {
    throw new TypeError('theme.styles must contain at least one CSS path or package export')
  }
  const styles = input.styles.map((style) => {
    if (typeof style !== 'string' || !style.trim()) {
      throw new TypeError('theme.styles must contain non-empty CSS paths or package exports')
    }
    return style.trim()
  })
  if (new Set(styles).size !== styles.length) {
    throw new TypeError('theme.styles must not contain duplicate entries')
  }

  return Object.freeze({
    id,
    name: localizedNames(input.name, 'theme.name'),
    styles: Object.freeze(styles),
    appearances: appearances(input.appearances)
  })
}
