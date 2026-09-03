import { describe, expect, it } from 'vitest'
import { compileCss, markdownFileIconsDir, mathFontsDir } from './buildCss'

describe('buildCss', () => {
  it('assembles the shared Markdown theme and site-shell layers', async () => {
    const css = await compileCss()
    expect(css).toContain('/* Markdown base */')
    expect(css).toContain('/* Default theme */')
    expect(css).toContain('/* Canofold shell */')
    expect(css).toContain('.cf-shell')
    expect(css).toContain('.cf-shell-playground')
    expect(css).toContain(".cf-playground[data-view='source'] .cf-playground-source")
    expect(css).toContain('.cf-content')
    expect(css).toContain('--cf-accent-500: #0088ff')
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
