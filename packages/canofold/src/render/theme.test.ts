import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaults'
import { buildThemeVariables } from './theme'

describe('buildThemeVariables', () => {
  it('keeps sticky navigation scroll positions independent from content reflow', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.cf-sidebar,\s*\n\.cf-outline\s*\{[^}]*overflow-anchor: none;/s)
  })

  it('keeps global navigation reachable on mobile and gives outline levels readable indentation', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const homeHeaderRule = css.match(/\.cf-header-home\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(css).toMatch(/\.cf-header-link\s*\{[^}]*font-size: 0\.9375rem;/s)
    expect(css).toMatch(
      /\.cf-header-home\s*\{[^}]*border-bottom-color: transparent;[^}]*background: transparent;/s
    )
    expect(css).toMatch(/\.cf-header-home\.cf-header-scrolled\s*\{[^}]*backdrop-filter: blur\(22px\)/s)
    expect(homeHeaderRule).not.toContain('display: none')
    expect(css).toMatch(/\.cf-home\s*\{[^}]*padding: var\(--cf-header-height\) 0 0;/s)
    expect(css).toMatch(
      /@media \(max-width: 52\.5rem\)[\s\S]*\.cf-sidebar-primary-nav\s*\{[^}]*display: grid;/s
    )
    expect(css).toMatch(/\.cf-outline-link-3\s*\{[^}]*padding-inline-start: 1\.125rem;/s)
    expect(css).toMatch(/\.cf-outline-link-6\s*\{[^}]*padding-inline-start: 3rem;/s)
  })

  it('keeps home actions and feature cards stationary on hover', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const featureSectionRule = css.match(/\.cf-feature-section\s*\{([^}]*)\}/)?.[1] ?? ''
    const featureRule = css.match(/\.cf-feature\s*\{([^}]*)\}/)?.[1] ?? ''
    const buttonRule = css.match(/\.cf-btn\s*\{([^}]*)\}/)?.[1] ?? ''
    const secondaryRule = css.match(/\.cf-btn-secondary\s*\{([^}]*)\}/)?.[1] ?? ''
    const primaryHoverRule = css.match(/\.cf-btn-primary:hover\s*\{([^}]*)\}/)?.[1] ?? ''
    const darkPrimaryRule = css.match(/\.dark \.cf-btn-primary\s*\{([^}]*)\}/)?.[1] ?? ''
    const secondaryHoverRule = css.match(/\.cf-btn-secondary:hover\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(featureSectionRule).not.toContain('background:')
    expect(featureSectionRule).not.toContain('box-shadow:')
    expect(featureRule).toContain('border: 0')
    expect(buttonRule).not.toContain('border:')
    expect(darkPrimaryRule).toContain('box-shadow: none')
    expect(secondaryRule).toContain('background: color-mix')
    expect(secondaryHoverRule).toContain('background: color-mix')
    expect(primaryHoverRule).not.toContain('transform')
    expect(secondaryHoverRule).not.toContain('transform')
    expect(css).not.toContain('.cf-feature:hover')
  })

  it('keeps the home visual bounded and gives dark mode its own surface treatment', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const heroRule = css.match(/\.cf-hero\s*\{([^}]*)\}/)?.[1] ?? ''
    const heroTitleRule = css.match(/\.cf-hero-title\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(css).toMatch(
      /\.cf-hero-visual\s*\{[^}]*position: relative;[^}]*grid-column: 2;[^}]*width: min\(100%, 33rem\);/s
    )
    expect(css).toMatch(
      /\.cf-hero-title\s*\{[^}]*padding-inline-end: 0\.16em;[^}]*background: linear-gradient[^}]*font-family:\s*Inter,\s*'DM Sans',\s*system-ui,\s*sans-serif;[^}]*font-weight: 700;[^}]*overflow-wrap: anywhere;/s
    )
    expect(heroRule).not.toContain('width: 100%')
    expect(heroRule).not.toContain('min-height')
    expect(heroTitleRule).not.toContain('width:')
    expect(css).not.toContain("font-family: 'Arial Black'")
    expect(css).toMatch(/\.dark \.cf-home\s*\{[^}]*linear-gradient/s)
    expect(css).toMatch(/\.dark \.cf-feature\s*\{[^}]*background: linear-gradient/s)
    expect(css).toMatch(/\.dark \.cf-hero-title\s*\{[^}]*background-image: linear-gradient/s)
    expect(css).toMatch(
      /\.cf-feature-icon\s*\{[^}]*width: 3rem;[^}]*height: 3rem;[^}]*background: color-mix/s
    )
    expect(css).toMatch(/\.cf-feature\s*\{[^}]*border-radius: 0\.75rem;/s)
    expect(css).toMatch(/\.cf-feature-icon svg\s*\{[^}]*width: 2\.5rem;[^}]*height: 2\.5rem;/s)
    expect(css).toMatch(/\.cf-feature-icon img\s*\{[^}]*width: 2\.5rem;[^}]*height: 2\.5rem;/s)
  })

  it('maps accent and layout config onto Canofold design tokens', () => {
    const css = buildThemeVariables({
      ...defaultConfig,
      theme: {
        ...defaultConfig.theme,
        accentColor: '#0f766e',
        radius: 8,
        baseColor: 'slate',
        sidebarWidth: 280,
        outlineWidth: '18rem',
        darkMode: true
      }
    })

    expect(css).toContain('--cf-accent-500: #0f766e')
    expect(css).toContain('--cf-accent-700: color-mix(in oklab, #0f766e 76%, var(--cf-ink))')
    expect(css).not.toContain('--primary:')
    expect(css).toContain('--cf-radius-sm: 8px')
    expect(css).toContain('--cf-radius-md: 8px')
    expect(css).toContain('--cf-radius-lg: 8px')
    expect(css).toContain('--cf-radius-full: 8px')
    expect(css).toContain('--cf-sidebar-width: 280px')
    expect(css).toContain('--cf-outline-width: 18rem')
    expect(css).toContain('--cf-canvas: oklch(0.99 0.004 250)')
    expect(css).toContain('--cf-ink-body:')
    expect(css).toContain('--cf-border: transparent')
    expect(css).toContain('--cf-success: #34c759')
    expect(css).toContain('--cf-info: #0088ff')
    expect(css).toMatch(/\.dark \{[\s\S]*--cf-info: #0091ff/)
    expect(css).toContain('--cf-success-deep: #34c759')
    expect(css).toContain('--cf-warning: #ff8d28')
    expect(css).toContain('--cf-danger: #ff383c')
    expect(css).toContain('.dark {')
  })

  it('resolves named accents to the default semantic colors', () => {
    const css = buildThemeVariables({
      ...defaultConfig,
      theme: { ...defaultConfig.theme, accentColor: 'blue', darkMode: true }
    })

    expect(css).toContain('--cf-accent-500: #0088ff')
    expect(css).toMatch(/\.dark \{[\s\S]*--cf-accent-500: #0091ff/)
  })

  it('omits dark overrides when dark mode is disabled', () => {
    const css = buildThemeVariables({
      ...defaultConfig,
      theme: { ...defaultConfig.theme, darkMode: false }
    })

    expect(css).not.toContain('.dark')
  })

  it('allows project token overrides to win', () => {
    const css = buildThemeVariables({
      ...defaultConfig,
      theme: {
        ...defaultConfig.theme,
        darkMode: true,
        tokens: {
          colors: {
            light: {
              canvas: '#fffaf0',
              primary: '#123456',
              accent: '#abcdef',
              border: '#decade'
            },
            dark: {
              canvas: '#010203',
              primary: '#fedcba'
            }
          },
          typography: { sansFont: 'Inter, sans-serif' },
          layout: { readingWidth: '70ch' },
          motion: { durationFast: '100ms' }
        }
      }
    })

    expect(css).toContain('--cf-canvas: #fffaf0')
    expect(css).toContain('--cf-accent-500: #123456')
    expect(css).toContain('--cf-accent-secondary: #abcdef')
    expect(css).toContain('--cf-border: #decade')
    expect(css).toContain('--cf-canvas: #010203')
    expect(css).toContain('--cf-accent-500: #fedcba')
    expect(css).toContain('--cf-font-sans: Inter, sans-serif')
    expect(css).toContain('--cf-reading-width: 70ch')
    expect(css).toContain('--cf-duration-fast: 100ms')
  })

  it('uses the documented light neutral palette by default', () => {
    const css = buildThemeVariables(defaultConfig)

    expect(css).toContain('--cf-canvas: #f6f6f8')
    expect(css).toContain('--cf-ink: #1d1d1f')
    expect(css).toContain('--cf-ink-body: #363638')
    expect(css).toContain('--cf-accent-500: #0088ff')
    expect(css).toContain('--cf-accent-soft: color-mix(in srgb, var(--cf-accent-500) 10%, white)')
    expect(css).toContain('--cf-success: #34c759')
    expect(css).toContain('--cf-warning: #ff8d28')
    expect(css).toContain('--cf-danger: #ff383c')
    expect(css).toContain('--cf-radius-sm: 8px')
    expect(css).toContain('--cf-radius-md: 8px')
    expect(css).toContain('--cf-radius-lg: 8px')
    expect(css).toContain('--cf-shadow-raised: 0 20px 52px rgb(29 29 31 / 0.14)')
    expect(css).toContain('--cf-shadow-raised-sm: 0 8px 22px rgb(29 29 31 / 0.09)')
  })
})
