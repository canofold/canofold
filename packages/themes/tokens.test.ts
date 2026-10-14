import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const canofoldTokensUrl = new URL('./src/canofold/tokens.css', import.meta.url)
const sharedTokensUrl = new URL('./src/shared.css', import.meta.url)
const expressiveThemeUrl = new URL('./src/expressive/theme.css', import.meta.url)

const expressiveThemes = [
  ['memphis', '#e94f5d'],
  ['cyber-chinese', '#d4553a'],
  ['pixel-anime', '#4a90d9'],
  ['dopamine-design', '#d9005e'],
  ['shoujo-manga', '#c44772'],
  ['outrun', '#ff006e']
] as const

const standaloneThemes = [
  ['glassmorphism', '#e4b863'],
  ['sketch-style', '#c0392b'],
  ['hand-drawn-doodle', '#ff6b6b'],
  ['minimalist-flat', '#ff3366'],
  ['bauhaus', '#dd0000']
] as const

function colorToken(css: string, name: string) {
  const value = css.match(new RegExp(`--cf-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
  expect(value, `missing --cf-${name}`).toBeDefined()
  return value!
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('@canofold/themes CSS contract', () => {
  it('keeps neumorphism button hover text readable on its neutral surface', async () => {
    const css = await readFile(new URL('./src/neumorphism/theme.css', import.meta.url), 'utf8')
    const hover = css.match(/\.cf-btn:hover\s*\{([^}]*)\}/)?.[1] ?? ''
    const foreground = hover.match(/color:\s*var\(--cf-([^)]*)\)/)?.[1]
    expect(foreground).toBeDefined()
    expect(contrastRatio(colorToken(css, foreground!), colorToken(css, 'surface'))).toBeGreaterThanOrEqual(
      4.5
    )
  })

  it.each(['glassmorphism', 'sketch-style', 'bauhaus'])(
    'keeps %s neutral control paint from overriding primary buttons',
    async (theme) => {
      const css = await readFile(new URL(`./src/${theme}/theme.css`, import.meta.url), 'utf8')
      expect(css).not.toMatch(/\.cf-btn\s*\n\s*\)/)
      expect(css).toContain('.cf-btn:not(.cf-btn-primary)')
    }
  )

  it('owns the shared geometry and the Canofold semantic palette', async () => {
    const [canofoldTokens, sharedTokens] = await Promise.all([
      readFile(canofoldTokensUrl, 'utf8'),
      readFile(sharedTokensUrl, 'utf8')
    ])
    const tokens = `${sharedTokens}\n${canofoldTokens}`

    expect(tokens).toContain('--cf-accent-500: #0088ff')
    expect(tokens).toContain('--cf-info: #0088ff')
    expect(tokens).toContain('--cf-info-deep: #0088ff')
    expect(tokens).toContain('--cf-success: #34c759')
    expect(tokens).toContain('--cf-success-deep: #34c759')
    expect(tokens).toContain('--cf-warning: #ff8d28')
    expect(tokens).toContain('--cf-danger: #ff383c')
    expect(tokens).toContain('--cf-danger-deep: #ff383c')
    expect(tokens).toContain('--cf-yellow: #ffcc00')
    expect(tokens).toContain('--cf-body-font-size: 1rem')
    expect(tokens).toContain('--cf-body-line-height: 1.6')
    expect(tokens).toContain('--cf-heading-1-size: 2rem')
    expect(tokens).toContain('--cf-heading-2-size: 1.625rem')
    expect(tokens).toContain('--cf-heading-3-size: 1.375rem')
    expect(tokens).toContain('--cf-heading-4-size: 1.25rem')
    expect(tokens).toContain('--cf-heading-5-size: 1.125rem')
    expect(tokens).toContain('--cf-heading-6-size: 1.0625rem')
    expect(tokens).toContain('--cf-site-gutter: 2.25rem')
    expect(tokens).toContain('--cf-header-height: 4.25rem')
    expect(tokens).toContain('--cf-header-shadow: inset 0 -1px 0 var(--cf-hairline)')
    expect(tokens).toContain('--cf-nav-item-hover-ink: var(--cf-accent-deep)')
    expect(tokens).toContain('--cf-nav-item-hover-surface: var(--cf-accent-soft)')
    expect(tokens).toContain('--cf-nav-item-hover-shadow: none')
    expect(tokens).toContain('--cf-nav-item-active-ink: var(--cf-accent-deep)')
    expect(tokens).toContain('--cf-nav-item-active-surface: transparent')
    expect(tokens).toContain('--cf-nav-item-active-shadow: none')
    expect(tokens).toContain('--cf-sidebar-width: 17.5rem')
    expect(tokens).toContain('--cf-outline-width: 18.75rem')
    expect(tokens).toContain('--cf-radius-lg: 8px')
    expect(tokens).toContain('--cf-diagram-surface: var(--cf-surface-soft)')
    expect(tokens).toContain('--cf-diagram-accent: var(--cf-accent-500)')
    expect(tokens).toContain('--cf-on-accent: #ffffff')
    expect(tokens).toContain('--cf-overlay-control-ink: #ffffff')
    expect(tokens).toContain('--cf-tooltip-surface: #202124')
    expect(tokens).toContain('--cf-kbd-shadow: var(--cf-shadow-inset)')
    expect(tokens).toContain('--cf-media-canvas: #ffffff')
    expect(tokens).toContain('--cf-hero-visual-filter: none')
    expect(tokens).toContain('--cf-hero-visual-animation: none')
    expect(tokens).toContain('--cf-hero-visual-opacity: 1')
    expect(tokens).not.toContain('--cf-callout-info')
    expect(tokens).not.toContain('--cf-canofold-config-icon:')
    expect(tokens).not.toContain('9999px')
  })

  it('shares expressive component treatment without taking over structure', async () => {
    const css = await readFile(expressiveThemeUrl, 'utf8')

    for (const [theme] of expressiveThemes) {
      expect(css).toContain(`[data-cf-theme='${theme}']`)
    }
    expect(css).toContain('--cf-theme-control-hover-surface')
    expect(css).toContain('--cf-theme-panel-shadow')
    expect(css).toContain('--cf-theme-input-focus-shadow')
  })

  it.each(expressiveThemes)('publishes the %s semantic palette', async (theme, accent) => {
    const css = await readFile(new URL(`./src/${theme}/theme.css`, import.meta.url), 'utf8')

    expect(css).toContain(`html[data-cf-theme='${theme}']`)
    expect(css).toContain(`--cf-accent-500: ${accent}`)
    expect(css).toContain('--cf-nav-item-hover-surface:')
    expect(css).toContain('--cf-nav-item-active-surface:')
    expect(css).toContain('--cf-theme-control-hover-surface:')
    expect(css).toContain('--cf-theme-control-active-surface:')
  })

  it.each(expressiveThemes)('keeps %s semantic text colors readable', async (theme) => {
    const css = await readFile(new URL(`./src/${theme}/theme.css`, import.meta.url), 'utf8')
    const surface = colorToken(css, 'surface')

    for (const foreground of ['ink', 'ink-body', 'ink-secondary', 'ink-tertiary']) {
      expect(contrastRatio(colorToken(css, foreground), surface), foreground).toBeGreaterThanOrEqual(4.5)
    }
    expect(
      contrastRatio(colorToken(css, 'on-accent'), colorToken(css, 'accent-500')),
      'on-accent'
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(standaloneThemes)('publishes the standalone %s semantic palette', async (theme, accent) => {
    const css = await readFile(new URL(`./src/${theme}/theme.css`, import.meta.url), 'utf8')

    expect(css).toContain(`html[data-cf-theme='${theme}']`)
    expect(css).toContain(`--cf-accent-500: ${accent}`)
    expect(css).toContain('--cf-nav-item-hover-surface:')
    expect(css).toContain('--cf-nav-item-active-surface:')
  })

  it.each(standaloneThemes)('keeps standalone %s semantic text colors readable', async (theme) => {
    const css = await readFile(new URL(`./src/${theme}/theme.css`, import.meta.url), 'utf8')
    const surface = colorToken(css, 'surface')

    for (const foreground of ['ink', 'ink-body', 'ink-secondary', 'ink-tertiary']) {
      expect(contrastRatio(colorToken(css, foreground), surface), foreground).toBeGreaterThanOrEqual(4.5)
    }
    expect(
      contrastRatio(colorToken(css, 'on-accent'), colorToken(css, 'accent-500')),
      'on-accent'
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('preserves the defining visual language of the five added themes', async () => {
    const [glass, sketch, doodle, minimal, bauhaus] = await Promise.all(
      ['glassmorphism', 'sketch-style', 'hand-drawn-doodle', 'minimalist-flat', 'bauhaus'].map((theme) =>
        readFile(new URL(`./src/${theme}/theme.css`, import.meta.url), 'utf8')
      )
    )

    expect(glass).toContain('--cf-canvas: #0b1322')
    expect(glass).toContain('radial-gradient(')
    expect(glass).toContain('blur(40px) saturate(180%)')
    expect(glass).toContain('rgb(255 255 255 / 8%)')
    expect(glass).not.toMatch(/#667eea|#764ba2|#f093fb/i)

    expect(sketch).toContain('--cf-canvas: #f5f0e8')
    expect(sketch).toContain('--cf-font-display: Georgia')
    expect(sketch).toContain('border: 2px dashed var(--cf-border)')
    expect(sketch).toContain('text-decoration-style: wavy')
    expect(sketch).not.toContain('gradient(')

    expect(doodle).toContain('--cf-canvas: #fffef5')
    expect(doodle).toContain('--cf-accent-500: #ff6b6b')
    expect(doodle).toContain('--cf-accent-secondary: #13877f')
    expect(doodle).toContain('repeating-linear-gradient(')
    expect(doodle).toContain('border: 2px dashed var(--cf-border)')

    expect(minimal).toContain('--cf-canvas: #ffffff')
    expect(minimal).toContain('--cf-shadow-raised: none')
    expect(minimal).toContain('--cf-radius-lg: 0')
    expect(minimal).toContain('background: #000000')
    expect(minimal).not.toContain('gradient(')

    expect(bauhaus).toContain('--cf-accent-500: #dd0000')
    expect(bauhaus).toContain('--cf-accent-secondary: #0000ff')
    expect(bauhaus).toContain('--cf-yellow: #ffcc00')
    expect(bauhaus).toContain('border: 3px solid var(--cf-border)')
    expect(bauhaus).toContain('text-transform: uppercase')
    expect(bauhaus).not.toContain('gradient(')
  })
})
