import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKDOWN_THEME,
  MARKDOWN_THEME_VARIABLES,
  markdownThemeDeclarations,
  resolveMarkdownTheme
} from './theme'

const tokensUrl = new URL('./tokens.css', import.meta.url)

function declarationsFor(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? ''
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1]!,
      match[2]!.replace(/\s+/g, ' ').trim()
    ])
  )
}

describe('Markdown theme contract', () => {
  it('completes partial semantic tokens without exposing component internals', () => {
    const theme = resolveMarkdownTheme({
      colors: { light: { primary: '#2563eb', shadow: '0 1px 2px #0003' } },
      typography: {
        sansFont: 'Inter, sans-serif',
        bodySize: '1.125rem',
        bodyLineHeight: '1.8',
        headingLineHeight: '1.2',
        heading5Size: '1.15rem'
      },
      layout: { readingWidth: '70ch' }
    })
    const declarations = markdownThemeDeclarations(theme, 'light')

    expect(theme.colors.light.primary).toBe('#2563eb')
    expect(theme.colors.dark.primary).toBeTruthy()
    expect(theme.typography.sansFont).toBe('Inter, sans-serif')
    expect(declarations).toContain('--cf-reading-width: 70ch;')
    expect(declarations).toContain('--cf-body-font-size: 1.125rem;')
    expect(declarations).toContain('--cf-body-line-height: 1.8;')
    expect(declarations).toContain('--cf-heading-line-height: 1.2;')
    expect(declarations).toContain('--cf-heading-5-size: 1.15rem;')
    expect(declarations).toContain('--cf-shadow-raised: 0 1px 2px #0003;')
    expect(declarations).toContain('--cf-radius-lg: 8px;')
    expect(declarations).not.toContain('--cf-text-base:')
    expect(declarations).not.toContain('--cf-radius-xl:')
    expect(MARKDOWN_THEME_VARIABLES).not.toHaveProperty('components')
  })

  it('gives semantic colors distinct light and dark values plus a deep foreground tier', () => {
    const theme = resolveMarkdownTheme()

    expect(theme.colors.light.info).toBe('#0088ff')
    expect(theme.colors.dark.info).toBe('#0091ff')
    expect(theme.colors.light.success).toBe('#34c759')
    expect(theme.colors.dark.success).toBe('#30d158')
    expect(theme.colors.light.warning).toBe('#ff8d28')
    expect(theme.colors.dark.warning).toBe('#ff9230')
    expect(theme.colors.light.danger).toBe('#ff383c')
    expect(theme.colors.dark.danger).toBe('#ff4245')
    expect(theme.colors.light.infoDeep).toBe('#0088ff')
    expect(theme.colors.dark.infoDeep).toBe('#0091ff')
    expect(theme.colors.light.successDeep).toBe('#34c759')
    expect(theme.colors.dark.dangerDeep).toBe('#ff4245')
  })

  it('keeps every public TypeScript default aligned with the published CSS tokens', async () => {
    const css = await readFile(tokensUrl, 'utf8')
    const light = declarationsFor(css, ':root')
    const dark = declarationsFor(css, '.dark')

    for (const [key, variable] of Object.entries(MARKDOWN_THEME_VARIABLES.colors)) {
      expect(light.get(variable), `light ${variable}`).toBe(
        DEFAULT_MARKDOWN_THEME.colors.light[key as keyof typeof DEFAULT_MARKDOWN_THEME.colors.light]
      )
      expect(dark.get(variable) ?? light.get(variable), `dark ${variable}`).toBe(
        DEFAULT_MARKDOWN_THEME.colors.dark[key as keyof typeof DEFAULT_MARKDOWN_THEME.colors.dark]
      )
    }
    for (const group of ['typography', 'layout', 'geometry', 'motion'] as const) {
      for (const [key, variable] of Object.entries(MARKDOWN_THEME_VARIABLES[group])) {
        expect(light.get(variable), `${group} ${variable}`).toBe(
          DEFAULT_MARKDOWN_THEME[group][key as keyof (typeof DEFAULT_MARKDOWN_THEME)[typeof group]]
        )
      }
    }
  })

  it('rejects unknown and empty public token values', () => {
    expect(() => resolveMarkdownTheme({ typography: { sansFont: '' } })).toThrow(
      'typography.sansFont must be a non-empty CSS value'
    )
    expect(() => resolveMarkdownTheme({ layout: { componentGap: '1rem' } } as never)).toThrow(
      'Unknown Markdown theme token: layout.componentGap'
    )
  })
})
