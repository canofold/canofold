import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaults'
import { canofold, defineTheme, neumorphism } from '@canofold/themes'
import { buildLayoutVariables, themeNameFor, themeSelections } from './theme'

describe('visual themes', () => {
  it('keeps optional themes out of shared layout and demo structure', async () => {
    const themeFiles = [
      'neo-brutalist',
      'neumorphism',
      'glassmorphism',
      'sketch-style',
      'hand-drawn-doodle',
      'minimalist-flat',
      'bauhaus',
      'expressive',
      'memphis',
      'cyber-chinese',
      'pixel-anime',
      'dopamine-design',
      'shoujo-manga',
      'outrun'
    ]
    const forbiddenLayoutProperties =
      /^\s*(?:display|position|inset(?:-\w+)?|width|height|min-width|max-width|min-height|max-height|margin(?:-\w+)?|padding(?:-\w+)?|overflow(?:-\w+)?|grid(?:-\w+)?|flex(?:-\w+)?|place-(?:items|content|self)|align-(?:items|content|self)|justify-(?:items|content|self)|line-height|text-align|white-space|object-(?:fit|position)|pointer-events|touch-action|user-select|cursor|visibility|content|z-index|opacity)\s*:/m

    for (const theme of themeFiles) {
      const css = await readFile(new URL(`../../../themes/src/${theme}/theme.css`, import.meta.url), 'utf8')
      expect(css, `${theme} must not override shared layout properties`).not.toMatch(
        forbiddenLayoutProperties
      )
      expect(css, `${theme} must not own the shared demo title`).not.toContain('.cf-demo-title')
      expect(css, `${theme} must not override the shared theme-picker selection state`).not.toMatch(
        /\.cf-theme-option|\[data-canofold-theme-option|\[aria-pressed/
      )
      expect(css, `${theme} must configure navigation states through visual hooks`).not.toMatch(
        /\.cf-menu-item|\.cf-language-menu-item|\.cf-header-link-active|\.cf-sidebar-link-active/
      )
      expect(css, `${theme} must use the homepage visual hooks`).not.toContain('.cf-hero-visual')
    }
  })

  it('uses one geometry and state contract for menus and navigation links', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const itemRule = css.match(/\.cf-menu-item\s*\{([^}]*)\}/)?.[1] ?? ''
    const hoverRule = css.match(/\.cf-menu-item:hover\s*\{([^}]*)\}/)?.[1] ?? ''
    const selectedRule =
      css.match(/\.cf-menu-item-active,\s*\n\.cf-theme-option\[aria-pressed='true'\]\s*\{([^}]*)\}/)?.[1] ??
      ''
    const selectedHoverRule =
      css.match(
        /\.cf-menu-item-active:hover,\s*\n\.cf-theme-option\[aria-pressed='true'\]:hover\s*\{([^}]*)\}/
      )?.[1] ?? ''

    expect(itemRule).toContain('min-height: 2.375rem')
    expect(itemRule).toContain('padding: 0.5rem 0.75rem')
    expect(itemRule).toContain('font-size: 0.875rem')
    expect(hoverRule).toContain('color: var(--cf-nav-item-hover-ink)')
    expect(hoverRule).toContain('background: var(--cf-nav-item-hover-surface)')
    expect(hoverRule).toContain('box-shadow: var(--cf-nav-item-hover-shadow)')
    expect(selectedRule).toContain('color: var(--cf-nav-item-active-ink)')
    expect(selectedRule).toContain('background: var(--cf-nav-item-active-surface)')
    expect(selectedRule).toContain('box-shadow: var(--cf-nav-item-active-shadow)')
    expect(selectedHoverRule).toContain('color: var(--cf-nav-item-active-ink)')
    expect(selectedHoverRule).toContain('background: var(--cf-nav-item-active-surface)')
    expect(selectedHoverRule).toContain('box-shadow: var(--cf-nav-item-active-shadow)')
    expect(css).toMatch(
      /\.cf-header-link:hover,\s*\n\.cf-sidebar-link:hover,\s*\n\.cf-sidebar-subgroup-title:hover\s*\{[^}]*color: var\(--cf-nav-item-hover-ink\);[^}]*background: var\(--cf-nav-item-hover-surface\);[^}]*box-shadow: var\(--cf-nav-item-hover-shadow\);/s
    )
    expect(css).toMatch(
      /\.cf-header-link-active,\s*\n\.cf-sidebar-link-active\s*\{[^}]*color: var\(--cf-nav-item-active-ink\);[^}]*background: var\(--cf-nav-item-active-surface\);[^}]*box-shadow: var\(--cf-nav-item-active-shadow\);/s
    )
    expect(css).toMatch(
      /\.cf-header-link-active:hover,\s*\n\.cf-sidebar-link-active:hover\s*\{[^}]*color: var\(--cf-nav-item-active-ink\);[^}]*background: var\(--cf-nav-item-active-surface\);[^}]*box-shadow: var\(--cf-nav-item-active-shadow\);/s
    )
    expect(css).toMatch(
      /\.cf-sidebar-primary-link:hover\s*\{[^}]*color: var\(--cf-nav-item-hover-ink\);[^}]*background: var\(--cf-nav-item-hover-surface\);[^}]*box-shadow: var\(--cf-nav-item-hover-shadow\);/s
    )
    expect(css).toMatch(
      /\.cf-sidebar-primary-link-active\s*\{[^}]*color: var\(--cf-nav-item-active-ink\);[^}]*background: var\(--cf-nav-item-active-surface\);[^}]*box-shadow: var\(--cf-nav-item-active-shadow\);/s
    )
    expect(css).toMatch(
      /\.cf-sidebar-primary-link-active:hover\s*\{[^}]*color: var\(--cf-nav-item-active-ink\);[^}]*background: var\(--cf-nav-item-active-surface\);[^}]*box-shadow: var\(--cf-nav-item-active-shadow\);/s
    )
    expect(css).not.toContain(':where(.cf-header-link')
    expect(css).not.toContain('.cf-language-menu-item')
  })

  it('keeps long theme menus scrollable without exposing a visual scrollbar', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const themeMenuRule = css.match(/\.cf-theme-menu \.cf-menu-list\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(themeMenuRule).toContain('max-height: calc(100dvh - var(--cf-header-height) - 1.5rem)')
    expect(themeMenuRule).toContain('overflow-y: auto')
    expect(themeMenuRule).toContain('scrollbar-width: none')
    expect(css).toMatch(/\.cf-theme-menu \.cf-menu-list::-webkit-scrollbar\s*\{[^}]*display: none;/s)
  })

  it('gives the glassmorphism floating menu enough opacity to cover page navigation', async () => {
    const css = await readFile(
      new URL('../../../themes/src/glassmorphism/theme.css', import.meta.url),
      'utf8'
    )
    const menuRule =
      css.match(/html\[data-cf-theme='glassmorphism'\] \.cf-menu-list\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(menuRule).toContain('background: rgb(11 19 34 / 96%)')
    expect(menuRule).toContain('backdrop-filter: blur(40px) saturate(180%)')
  })

  it('does not let hand-drawn rotations replace Core overlay positioning transforms', async () => {
    const css = await readFile(
      new URL('../../../themes/src/hand-drawn-doodle/theme.css', import.meta.url),
      'utf8'
    )
    const rotatedSelectors = [...css.matchAll(/([^{}]+)\{([^{}]*transform:\s*rotate\([^}]+)\}/g)].map(
      ([, selector]) => selector
    )

    expect(rotatedSelectors.length).toBeGreaterThan(0)
    for (const selector of rotatedSelectors) {
      expect(selector).not.toMatch(
        /\.(?:cf-search-panel|cf-source-panel|cf-table-preview-card|cf-diagram-dialog)(?:[\s,:)]|$)/
      )
    }
  })

  it('keeps reading progress geometry in Core and its empty track transparent', async () => {
    const [css, shared, neumorphismTheme] = await Promise.all([
      readFile(new URL('./styles.input.css', import.meta.url), 'utf8'),
      readFile(new URL('../../../themes/src/shared.css', import.meta.url), 'utf8'),
      readFile(new URL('../../../themes/src/neumorphism/theme.css', import.meta.url), 'utf8')
    ])
    const trackRule = css.match(/\.cf-route-progress\s*\{([^}]*)\}/)?.[1] ?? ''
    const fillRule = css.match(/\.cf-route-progress > span\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(trackRule).toContain('background: var(--cf-reading-progress-track)')
    expect(fillRule).toContain('background: var(--cf-reading-progress-fill)')
    expect(shared).toContain('--cf-reading-progress-track: transparent')
    expect(shared).toContain('--cf-reading-progress-fill: var(--cf-accent-500)')
    expect(neumorphismTheme).not.toContain('--cf-reading-progress-track:')
  })

  it('keeps the neumorphism theme faithful to its single-light-source design system', async () => {
    const css = await readFile(new URL('../../../themes/src/neumorphism/theme.css', import.meta.url), 'utf8')

    expect(css).toContain('--cf-canvas: #e0e5ec')
    expect(css).toContain('--cf-surface: #e0e5ec')
    expect(css).toContain('--cf-surface-secondary: #d1d9e6')
    expect(css).toContain('--cf-accent-500: #6d5dfc')
    expect(css).toContain('--cf-shadow-raised: 8px 8px 16px #b8bcc2, -8px -8px 16px #ffffff')
    expect(css).toContain('--cf-shadow-raised-sm: 4px 4px 8px #b8bcc2, -4px -4px 8px #ffffff')
    expect(css).toContain('--cf-shadow-inset: inset 8px 8px 16px #b8bcc2, inset -8px -8px 16px #ffffff')
    expect(css).toMatch(
      /--cf-neumorphic-shadow-pressed:\s*inset 4px 4px 8px #b8bcc2, inset -4px -4px 8px #ffffff/
    )
    expect(css).toMatch(
      /--cf-neumorphic-shadow-input:\s*inset 6px 6px 12px #b8bcc2, inset -6px -6px 12px #ffffff/
    )
    expect(css).toMatch(
      /--cf-neumorphic-shadow-input-focus:\s*inset 2px 2px 4px #b8bcc2, inset -2px -2px 4px #ffffff/
    )
    expect(css).toContain('--cf-radius-sm: 12px')
    expect(css).toContain('--cf-duration-fast: 300ms')
    expect(css).toContain('--cf-easing-default: ease-in-out')
    expect(css).toContain('--cf-neumorphic-shadow-modal: 0 14px 36px rgb(51 51 51 / 0.18)')
    expect(css).toMatch(/\.cf-header\s*\{[^}]*border-bottom: 0;/s)
    expect(css).toMatch(/\.cf-search-trigger\s*\{[^}]*box-shadow: var\(--cf-neumorphic-shadow-input\);/s)
    expect(css).toMatch(/\.cf-menu-list\s*\{[^}]*box-shadow: var\(--cf-shadow-raised\);/s)
    expect(css).toMatch(
      /:where\(\.cf-doc-pagination-link, \.cf-content \.cf-link-card\)\s*\{[^}]*box-shadow: var\(--cf-shadow-raised\);/s
    )
    expect(css).toMatch(/\.cf-content \.cf-file-tree\s*\{[^}]*box-shadow: var\(--cf-shadow-raised\);/s)
    expect(css).toMatch(
      /:where\(\.cf-doc-pagination-link, \.cf-content \.cf-link-card\):active\s*\{[^}]*box-shadow: var\(--cf-neumorphic-shadow-pressed\);/s
    )
    expect(css).toMatch(/\.cf-btn:hover\s*\{[^}]*box-shadow: var\(--cf-shadow-raised-sm\);/s)
    expect(css).toMatch(/\.cf-btn:active\s*\{[^}]*box-shadow: var\(--cf-neumorphic-shadow-pressed\);/s)
    expect(css).toMatch(
      /\.cf-search-field:focus-within\s*\{[^}]*box-shadow: var\(--cf-neumorphic-shadow-input-focus\);/s
    )
    expect(css).toMatch(/\.cf-content kbd\s*\{[^}]*box-shadow: var\(--cf-neumorphic-shadow-pressed\);/s)
    expect(css).toContain('--cf-demo-border: #c4c9d0')
    expect(css).not.toMatch(
      /:where\(\.cf-content \.cf-demo-details, \.cf-content \.cf-demo-toolbar\)\s*\{[^}]*border-color:\s*transparent;/s
    )
    expect(css).toMatch(
      /:where\(\.cf-search-panel, \.cf-source-panel, \.cf-table-preview-card, \.cf-diagram-dialog\)\s*\{[^}]*box-shadow: var\(--cf-neumorphic-shadow-modal\);/s
    )
    expect(css).toMatch(
      /:where\(\.cf-search-backdrop, \.cf-source-backdrop, \.cf-table-preview-backdrop\)\s*\{[^}]*background: var\(--cf-overlay\);/s
    )
    expect(css).toMatch(/\.cf-diagram-dialog::backdrop\s*\{[^}]*background: var\(--cf-overlay\);/s)
    expect(css).toMatch(
      /\.cf-source-panel textarea\s*\{[^}]*box-shadow: var\(--cf-neumorphic-shadow-input\);/s
    )
    expect(css).toMatch(
      /:where\([^)]*\.cf-diagram-dialog-close[^)]*\)\s*\{[^}]*box-shadow: var\(--cf-shadow-raised-sm\);/s
    )
    const pressedControlRule =
      css.match(/:where\(\s*\.cf-content \.cf-demo-action:active,[\s\S]*?\)\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(css).toContain(".cf-content .cf-demo-source-toggle[aria-expanded='true']")
    expect(pressedControlRule).toContain('box-shadow: var(--cf-neumorphic-shadow-pressed)')
    expect(css).not.toContain('rgb(224 229 236 / 0.86)')
    expect(css).not.toMatch(/(?:linear-|radial-)?gradient\(/)
    expect(css).not.toMatch(/filter:\s*drop-shadow/)
    expect(css).not.toMatch(/transform:\s*translate/)
  })

  it('keeps the neo-brutalist theme faithful to its hard-edged design system', async () => {
    const css = await readFile(
      new URL('../../../themes/src/neo-brutalist/theme.css', import.meta.url),
      'utf8'
    )

    expect(css).toContain('--cf-accent-500: #ff006e')
    expect(css).toContain('--cf-accent-secondary: #00d9ff')
    expect(css).toContain('--cf-yellow: #ffff00')
    expect(css).toContain('--cf-shadow-raised: 8px 8px 0 #000000')
    expect(css).toContain('--cf-block-shell-shadow: 8px 8px 0 #000000')
    expect(css).toContain('--cf-neo-structure-border: 4px solid #000000')
    expect(css).toContain('--cf-neo-header-rule: inset 0 -4px 0 #000000')
    expect(css).toContain('--cf-radius-lg: 0')
    expect(css).toContain('--cf-duration-fast: 150ms')
    expect(css).toContain('--cf-easing-default: ease-out')
    expect(css).toMatch(/\.cf-header\s*\{[^}]*box-shadow: var\(--cf-neo-header-rule\);/s)
    expect(css).toMatch(/\.cf-sidebar\s*\{[^}]*box-shadow: var\(--cf-neo-sidebar-rule\);/s)
    expect(css).toMatch(/\.cf-outline\s*\{[^}]*box-shadow: var\(--cf-neo-outline-rule\);/s)
    expect(css).toMatch(/\.cf-btn:hover\s*\{[^}]*background: var\(--cf-yellow\);/s)
    expect(css).toMatch(/\.cf-btn:active\s*\{[^}]*transform: translate\(4px, 4px\);/s)
    expect(css).toMatch(
      /\.cf-search-panel,[\s\S]*\.cf-diagram-dialog[\s\S]*border: var\(--cf-neo-structure-border\);/
    )
    expect(css).toMatch(/@media \(max-width: 47\.5rem\)[\s\S]*--cf-neo-structure-border: 2px solid #000000;/)
    expect(css).not.toMatch(/(?:linear-|radial-)?gradient\(/)
    expect(css).not.toMatch(/backdrop-filter:\s*blur/)
    expect(css).not.toMatch(/box-shadow:[^;]*(?:rgba?|color-mix)\(/)
  })

  it('uses a clean transparent surface for component demo previews', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const previewRule = css.match(/\.cf-content \.cf-demo-preview\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(previewRule).toContain('background: transparent')
    expect(previewRule).not.toContain('linear-gradient')
    expect(previewRule).not.toContain('background-size')
    expect(previewRule).not.toContain('background-position')
  })

  it('keeps demo titles centered on dividers with theme-specific border widths', async () => {
    const [css, neoBrutalistTheme] = await Promise.all([
      readFile(new URL('./styles.input.css', import.meta.url), 'utf8'),
      readFile(new URL('../../../themes/src/neo-brutalist/theme.css', import.meta.url), 'utf8')
    ])

    expect(css).toMatch(/\.cf-demo-title\s*\{[^}]*top: calc\(-1 \* var\(--cf-demo-divider-width, 1px\)\);/s)
    expect(neoBrutalistTheme).toContain('--cf-demo-divider-width: 4px')
    expect(neoBrutalistTheme).toMatch(/@media \(max-width: 47\.5rem\)[\s\S]*--cf-demo-divider-width: 2px;/)
  })

  it('keeps sticky navigation scroll positions independent from content reflow', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.cf-sidebar,\s*\n\.cf-outline\s*\{[^}]*overflow-anchor: none;/s)
  })

  it('keeps global navigation reachable on mobile and gives outline levels readable indentation', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.cf-header-link\s*\{[^}]*font-size: 0\.9375rem;/s)
    expect(css).toMatch(/\.cf-header\s*\{[^}]*height: var\(--cf-header-height\);/s)
    expect(css).toMatch(/\.cf-header\s*\{[^}]*border-bottom: 0;[^}]*box-shadow: var\(--cf-header-shadow\);/s)
    expect(css).toMatch(/\.cf-header-inner\s*\{[^}]*height: 100%;[^}]*min-height: 0;/s)
    expect(css).toMatch(/\.cf-header\s*\{[^}]*background: var\(--cf-surface\);/s)
    expect(css).not.toContain('--cf-header-surface-mix')
    expect(css).not.toContain('.cf-header-home')
    expect(css).toMatch(/\.cf-home\s*\{[^}]*padding: var\(--cf-header-height\) 0 0;/s)
    expect(css).toMatch(/\.cf-home > \.cf-content\s*\{[^}]*background: transparent;/s)
    expect(css).toMatch(
      /@media \(max-width: 52\.5rem\)[\s\S]*\.cf-sidebar-primary-nav\s*\{[^}]*display: grid;/s
    )
    expect(css).toMatch(/\.cf-outline-link-3\s*\{[^}]*padding-inline-start: 1\.125rem;/s)
    expect(css).toMatch(/\.cf-outline-link-6\s*\{[^}]*padding-inline-start: 3rem;/s)
  })

  it('keeps home actions and feature cards stationary on hover', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const theme = await readFile(new URL('../../../themes/src/canofold/site.css', import.meta.url), 'utf8')
    const featureSectionRule = css.match(/\.cf-feature-section\s*\{([^}]*)\}/)?.[1] ?? ''
    const featureRule = css.match(/\.cf-feature\s*\{([^}]*)\}/)?.[1] ?? ''
    const buttonRule = css.match(/\.cf-btn\s*\{([^}]*)\}/)?.[1] ?? ''
    const secondaryRule = css.match(/\.cf-btn-secondary\s*\{([^}]*)\}/)?.[1] ?? ''
    const primaryHoverRule = css.match(/\.cf-btn-primary:hover\s*\{([^}]*)\}/)?.[1] ?? ''
    const secondaryHoverRule = css.match(/\.cf-btn-secondary:hover\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(featureSectionRule).not.toContain('background:')
    expect(featureSectionRule).not.toContain('box-shadow:')
    expect(featureRule).toContain('border: 0')
    expect(buttonRule).not.toContain('border:')
    expect(theme).toMatch(/\.dark \.cf-btn-primary\s*\{[^}]*box-shadow: none;/s)
    expect(secondaryRule).toContain('background: var(--cf-accent-soft)')
    expect(secondaryHoverRule).toContain('background: var(--cf-accent-100)')
    expect(primaryHoverRule).not.toContain('transform')
    expect(secondaryHoverRule).not.toContain('transform')
    expect(css).not.toContain('.cf-feature:hover')
  })

  it('gives component demos details, icon actions, tooltips, and a distinct expanded state', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const titleRule = css.match(/\.cf-demo-title\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(css).toMatch(/\.cf-content \.cf-demo-details\s*\{[^}]*background: var\(--cf-surface\);/s)
    expect(titleRule).toContain('padding: 0.15rem 0;')
    expect(titleRule).toContain('transform: translateY(-50%);')
    expect(css).toMatch(/\.cf-content \.cf-demo-toolbar\s*\{[^}]*justify-content: center;/s)
    expect(css).toMatch(
      /\.cf-demo-tooltip\s*\{[^}]*color: var\(--cf-tooltip-ink\);[^}]*background: var\(--cf-tooltip-surface\);[^}]*box-shadow: var\(--cf-tooltip-shadow\);/s
    )
    expect(css).toMatch(/\.cf-demo-action-icon\s*\{[^}]*mask: var\(--cf-demo-action-icon\)/s)
    expect(css).toMatch(/\.cf-demo-open-icon\s*\{[^}]*--cf-demo-action-icon: url/s)
    expect(css).toMatch(/\.cf-demo-source-toggle\[aria-expanded='true'\]\s*\{/s)
    expect(css).toMatch(/\.cf-demo-source-toggle\[aria-expanded='true'\] \.cf-demo-source-icon\s*\{/s)
    expect(css).toMatch(/\.cf-demo-action:focus-visible\s*\{[^}]*outline:/s)
  })

  it('keeps the home visual bounded and gives dark mode its own surface treatment', async () => {
    const css = await readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
    const theme = await readFile(new URL('../../../themes/src/canofold/site.css', import.meta.url), 'utf8')
    const heroRule = css.match(/\.cf-hero\s*\{([^}]*)\}/)?.[1] ?? ''
    const heroTitleRule = css.match(/\.cf-hero-title\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(css).toMatch(
      /\.cf-hero-visual\s*\{[^}]*position: relative;[^}]*grid-column: 2;[^}]*width: min\(100%, 33rem\);/s
    )
    expect(css).toMatch(
      /\.cf-hero-title\s*\{[^}]*padding-inline-end: 0\.16em;[^}]*font-family: var\(--cf-font-display\);[^}]*font-weight: 700;[^}]*overflow-wrap: anywhere;/s
    )
    expect(heroRule).not.toContain('width: 100%')
    expect(heroRule).not.toContain('min-height')
    expect(heroTitleRule).not.toContain('width:')
    expect(css).not.toContain("font-family: 'Arial Black'")
    expect(theme).toMatch(/\.dark \.cf-home\s*\{[^}]*linear-gradient/s)
    expect(theme).toMatch(/\.dark \.cf-feature\s*\{[^}]*background: linear-gradient/s)
    expect(theme).toMatch(/\.dark \.cf-hero-title\s*\{[^}]*background-image: linear-gradient/s)
    expect(css).toMatch(/\.cf-hero-visual\s*\{[^}]*opacity: var\(--cf-hero-visual-opacity\);/s)
    expect(css).toMatch(
      /\.cf-hero-visual img\s*\{[^}]*filter: var\(--cf-hero-visual-filter\);[^}]*animation: var\(--cf-hero-visual-animation\);/s
    )
    expect(css).not.toContain('@keyframes cf-home-visual-float')
    expect(theme).toContain('--cf-hero-visual-animation: cf-home-visual-float 8s ease-in-out infinite')
    expect(theme).toContain('--cf-hero-visual-opacity: 0.74')
    expect(theme).toContain('@keyframes cf-home-visual-float')
    expect(css).toMatch(
      /\.cf-feature-icon\s*\{[^}]*width: 3rem;[^}]*height: 3rem;[^}]*background: var\(--cf-accent-soft\)/s
    )
    expect(css).toMatch(/\.cf-feature\s*\{[^}]*border-radius: var\(--cf-radius-lg\);/s)
    expect(css).toMatch(/\.cf-feature-icon svg\s*\{[^}]*width: 2\.5rem;[^}]*height: 2\.5rem;/s)
    expect(css).toMatch(/\.cf-feature-icon img\s*\{[^}]*width: 2\.5rem;[^}]*height: 2\.5rem;/s)
  })

  it('keeps visual tokens in themes and emits only site-layout configuration', () => {
    const css = buildLayoutVariables({
      ...defaultConfig,
      layout: {
        ...defaultConfig.layout,
        sidebarWidth: 280,
        outlineWidth: '18rem'
      }
    })

    expect(css).toContain('--cf-sidebar-width: 280px')
    expect(css).toContain('--cf-outline-width: 18rem')
    expect(css).not.toContain('--cf-canvas')
    expect(css).not.toContain('--cf-accent')
  })

  it('builds localized options from first- and third-party theme definitions', () => {
    const custom = defineTheme({
      id: 'aurora',
      name: { zh: '极光', en: 'Aurora' },
      styles: ['@example/canofold-theme/aurora.css'],
      appearances: [{ id: 'default', name: { en: 'Default' }, colorScheme: 'light' }]
    })

    expect(themeSelections([canofold, neumorphism, custom], 'zh-CN')).toMatchObject([
      { value: 'canofold:light', label: 'Canofold · 浅色', colorScheme: 'light' },
      { value: 'canofold:dark', label: 'Canofold · 深色', colorScheme: 'dark' },
      { value: 'neumorphism:default', label: '新拟物派' },
      { value: 'aurora:default', label: '极光' }
    ])
    expect(themeNameFor({ en: 'Aurora' }, 'fr')).toBe('Aurora')
  })
})
