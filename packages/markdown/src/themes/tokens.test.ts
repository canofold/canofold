import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const stylesUrl = new URL('../styles.css', import.meta.url)

describe('Markdown CSS entrypoints', () => {
  it('keeps wrapping by default and scopes horizontal scrolling to opted-in code blocks', async () => {
    const styles = await readFile(stylesUrl, 'utf8')
    const scrollRule =
      styles.match(/\.cf-code\[data-cf-code-overflow='scroll'\] > pre,[\s\S]*?\{([\s\S]*?)\}/)?.[1] ?? ''

    expect(styles).toContain('white-space: pre-wrap')
    expect(scrollRule).toContain('overflow-x: auto')
    expect(scrollRule).toContain('white-space: pre')
    expect(scrollRule).toContain('word-break: normal')
    expect(styles).toContain(".cf-code[data-cf-code-overflow='scroll'] pre code")
    expect(styles).toContain('min-width: 100%')
  })

  it('keeps long code line numbers, image previews, and touch actions usable', async () => {
    const styles = await readFile(stylesUrl, 'utf8')
    const imageCardRule = styles.match(/\.cf-image-lightbox-card\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const imageRule = styles.match(/\.cf-image-lightbox-card img\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const openTriggerRule =
      styles.match(/\.cf-media-zoom\[data-cf-preview-open='true'\] > img\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const imageCloseRule =
      styles.match(/\.cf-image-lightbox-close\.cf-icon-button\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const noHoverRule = styles.match(/@media \(hover: none\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

    expect(styles).toContain('--cf-code-line-gutter: 4.5ch')
    expect(styles).toContain('padding-inline: calc(var(--cf-code-line-gutter) + 0.5rem) 0')
    expect(styles).toContain('width: var(--cf-code-line-gutter)')
    expect(styles).not.toContain('2.75ch')

    expect(imageCardRule).toContain('width: fit-content')
    expect(imageCardRule).toContain('min-width: 0')
    expect(imageCardRule).toContain('max-width: min(calc(100vw - 48px), 1440px)')
    expect(imageRule).toContain('max-width: min(calc(100vw - 48px), 1440px)')
    expect(imageRule).toContain('background: var(--cf-media-canvas)')
    expect(imageRule).toContain('box-shadow: var(--cf-media-shadow)')
    expect(openTriggerRule).toContain('visibility: hidden')
    expect(imageCloseRule).toContain('position: absolute')
    expect(imageCloseRule).toContain('min-width: 44px')
    expect(imageCloseRule).toContain('min-height: 44px')
    expect(styles).toContain('.cf-image-lightbox-close:focus-visible')
    expect(styles).toContain('.cf-table-preview .cf-icon-button:focus-visible')

    expect(noHoverRule).toContain('.cf-anchor-island')
    expect(noHoverRule).toContain('opacity: 1')

    const mobileRules = styles.split('@media (max-width: 47.5rem) {')[1] ?? ''
    expect(mobileRules).toMatch(
      /\.cf-anchor-island\s*\{[^}]*position: static;[^}]*margin-inline-start: 0\.35rem;[^}]*vertical-align: text-bottom;/s
    )
  })

  it('preserves site branding in code bars and keeps embedded media visually bounded', async () => {
    const styles = await readFile(stylesUrl, 'utf8')
    const contentRule = styles.match(/\.cf-content\s*\{([^}]*)\}/)?.[1] ?? ''
    const iconRule =
      styles.match(/\.cf-code-file-icon\[data-cf-file-icon='canofold'\]\s*\{([^}]*)\}/)?.[1] ?? ''
    const embedRule =
      styles.match(/\.cf-content > iframe\[data-cf-element='embed'\]\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(contentRule).not.toContain('--cf-canofold-config-icon:')
    expect(iconRule).toContain(
      "background-image: var(--cf-canofold-config-icon, url('./file-icons/config.svg'))"
    )
    expect(embedRule).toContain('border: 1px solid var(--cf-hairline)')
  })

  it('wraps terminal output at mobile widths without changing desktop formatting', async () => {
    const styles = await readFile(stylesUrl, 'utf8')
    const mobileRules = styles.split('@media (max-width: 47.5rem) {')[1] ?? ''

    expect(styles).toMatch(/\.cf-terminal > pre\s*\{\s*overflow-x: auto;/)
    expect(mobileRules).toMatch(/\.cf-terminal > pre\s*\{[^}]*white-space: pre-wrap;/s)
    expect(mobileRules).toMatch(/\.cf-terminal > pre\s*\{[^}]*overflow-wrap: anywhere;/s)
  })

  it('keeps the structural Markdown geometry and component contract', async () => {
    const styles = await readFile(stylesUrl, 'utf8')
    const mobileRules = styles.split('@media (max-width: 47.5rem) {')[1] ?? ''

    expect(styles).toContain('.cf-content')
    expect(styles).toContain('.cf-content *::before')
    expect(styles).not.toMatch(/(^|\n)\*[,\n]/)
    expect(styles).toContain('font-size: var(--cf-heading-1-size)')
    expect(styles).toContain('font-size: var(--cf-heading-6-size)')
    expect(styles).toContain('line-height: calc(var(--cf-heading-line-height) + 0.05)')
    expect(styles).toContain('line-height: calc(var(--cf-heading-line-height) + 0.2)')
    expect(styles).toContain('.cf-callout')
    expect(styles).not.toMatch(/--cf-callout-tone:/)
    expect(styles).toContain('--cf-callout-tone-deep: var(--cf-success-deep)')
    expect(styles).toContain('--cf-block-padding: 0.875rem')
    expect(styles).toContain(
      '--cf-block-toolbar-surface: color-mix(in oklab, var(--cf-ink) 6%, var(--cf-surface-secondary))'
    )
    expect(styles).toContain('--cf-block-stage-surface: var(--cf-surface-soft)')
    expect(styles).not.toContain('.cf-diagram-window')
    expect(styles).toContain('height: 1.2em')
    expect(styles).toContain('inset: 0 auto auto -32px')
    expect(mobileRules).not.toContain('inset-inline-start: -1.75rem')
    expect(styles).toContain('var(--cf-ink-secondary) 12%')
    expect(styles).toContain(".cf-sort-button[data-sort='asc'] .cf-sort-icon path:nth-child(2)")
    expect(styles).toContain(".cf-sort-button[data-sort='desc'] .cf-sort-icon path:nth-child(1)")
    expect(styles).toContain('counter-reset: cf-code-line')
    expect(styles).toContain('counter-increment: cf-code-line')
    expect(styles).toContain('white-space: pre-wrap')
    expect(styles).toContain('line-height: 1.8')
    expect(styles).toContain('padding-inline: calc(var(--cf-code-line-gutter) + 0.5rem) 0')
    expect(styles).toContain('.cf-table-window > .cf-block-toolbar')
    expect(styles).toContain('background: var(--cf-surface-elevated)')
    expect(styles).toContain('padding: 0 var(--cf-block-padding)')
    expect(styles).toContain('min-height: var(--cf-block-toolbar-height)')
    expect(styles).not.toContain('linear-gradient(')
  })
})
