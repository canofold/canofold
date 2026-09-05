import { createMarkdownRenderer } from '@canofold/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { hasMathSyntax, math } from './index'

describe('math plugin', () => {
  it('activates only for prose math syntax', () => {
    expect(hasMathSyntax('Inline $E = mc^2$ formula.')).toBe(true)
    expect(hasMathSyntax('Inline $a \\$ b$ formula.')).toBe(true)
    expect(hasMathSyntax('```math\nE = mc^2\n```')).toBe(true)
    expect(hasMathSyntax('Escaped \\$5 and `const price = "$5"`')).toBe(false)
    expect(hasMathSyntax('Escaped display opener \\$$')).toBe(false)
    expect(hasMathSyntax('```ts\nconst value = "$x$"\n```')).toBe(false)
    expect(
      hasMathSyntax(['````markdown', '```ts', 'const value = true', '```', '$not_math$', '````'].join('\n'))
    ).toBe(false)
  })

  it('renders KaTeX and reports the required asset', async () => {
    const renderer = createMarkdownRenderer()
    const rendered = await renderer.render('Inline $E = mc^2$.', {
      markdown: { plugins: [math()] }
    })

    expect(renderToStaticMarkup(rendered.content)).toContain('class="katex"')
    expect(rendered.assets.math).toBe(true)
  })

  it('renders a standalone math fence without requiring prose math', async () => {
    const renderer = createMarkdownRenderer()
    const rendered = await renderer.render('```math\nE = mc^2\n```', {
      markdown: { plugins: [math()] }
    })

    expect(renderToStaticMarkup(rendered.content)).toContain('class="katex-display"')
    expect(rendered.assets.math).toBe(true)
  })

  it('does not load KaTeX for ordinary documents', async () => {
    const renderer = createMarkdownRenderer()
    const rendered = await renderer.render('# Plain\n\nNo formula.', {
      markdown: { plugins: [math()] }
    })

    expect(renderToStaticMarkup(rendered.content)).not.toContain('class="katex"')
    expect(rendered.assets.math).toBe(false)
  })
})
