import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { canofold, defineTheme, memphis, neoBrutalist, neumorphism, outrun } from '@canofold/themes'
import { compileCss, compileThemes, markdownFileIconsDir, mathFontsDir } from './buildCss'

vi.mock('node:fs/promises', { spy: true })
afterEach(() => vi.resetAllMocks())

describe('buildCss', () => {
  it('reads changed styles on the next build in the same process', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('before' as never)
    expect(await compileCss()).toContain('before')
    vi.mocked(fs.readFile).mockResolvedValue('after' as never)
    expect(await compileCss()).toContain('after')
  })

  it('assembles only the shared Markdown structure and site-shell layers', async () => {
    const css = await compileCss()
    expect(css).toContain('/* Markdown base */')
    expect(css).toContain('/* Canofold shell */')
    expect(css).toContain('.cf-shell')
    expect(css).toContain('.cf-shell-playground')
    expect(css).toContain(".cf-playground[data-view='source'] .cf-playground-source")
    expect(css).toContain('.cf-content')
    expect(css).not.toContain('--cf-accent-500: #0088ff')
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

  it('outputs only styles owned by the configured theme definitions', async () => {
    const defaultTheme = await compileThemes([canofold])
    expect(defaultTheme.match(/--cf-canvas: #f6f6f8/g)).toHaveLength(1)
    expect(defaultTheme).toContain("html[data-cf-theme='canofold']) .cf-btn-primary")
    const softUi = await compileThemes([neumorphism])
    expect(softUi).toContain("data-cf-theme='neumorphism'")
    expect(softUi).not.toContain("data-cf-theme='neo-brutalist'")
    expect(softUi).not.toContain('#087af7')
    const variants = await compileThemes([neoBrutalist, neumorphism])
    expect(variants).toContain("html[data-cf-theme='neo-brutalist']")
    expect(variants).toContain("html[data-cf-theme='neumorphism']")
    expect(variants).not.toContain('--cf-canvas: #f6f6f8')

    const expressive = await compileThemes([memphis, outrun])
    expect(expressive).toContain("html[data-cf-theme='memphis']")
    expect(expressive).toContain("html[data-cf-theme='outrun']")
    expect(expressive.match(/Shared visual treatment for Canofold's expressive/g)).toHaveLength(1)
  })

  it('compiles a third-party theme through the same style contract', async () => {
    const theme = defineTheme({
      id: 'aurora',
      name: { en: 'Aurora' },
      styles: [new URL('../../../themes/src/neumorphism/theme.css', import.meta.url).href],
      appearances: [{ id: 'default', name: { en: 'Default' }, colorScheme: 'light' }]
    })

    expect(await compileThemes([theme])).toContain("data-cf-theme='neumorphism'")
  })
})
