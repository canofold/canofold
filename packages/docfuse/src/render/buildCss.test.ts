import { describe, expect, it } from 'vitest'
import { compileCss, markdownFileIconsDir, mathFontsDir } from './buildCss'

describe('buildCss', () => {
  it('assembles the shared Markdown theme and site-shell layers', async () => {
    const css = await compileCss()
    expect(css).toContain('/* Markdown base */')
    expect(css).toContain('/* Default theme */')
    expect(css).toContain('/* Docfuse shell */')
    expect(css).toContain('.df-shell')
    expect(css).toContain('.df-shell-playground')
    expect(css).toContain(".df-playground[data-view='source'] .df-playground-source")
    expect(css).toContain('.df-content')
    expect(css).toContain('--df-accent-500: #0088ff')
    expect(css).not.toContain('.apple-')
    expect(css).not.toContain('/* Math */')
    expect(css).not.toContain('KaTeX_Main')
    expect(mathFontsDir()).toMatch(/fonts$/)
    expect(markdownFileIconsDir()).toMatch(/file-icons$/)
  })

  it('includes KaTeX only for math-enabled builds', async () => {
    const css = await compileCss({ math: true })
    expect(css).toContain('/* Math */')
    expect(css).toContain('.katex')
  })
})
