// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createMarkdownRenderer } from './createMarkdownRenderer'
import { staticTokens } from '../react/staticTokens'
import type { Element, Root } from 'hast'
import { prepareMarkdown } from '../compiler/prepareMarkdown'

describe('Static code tokens', () => {
  it('accounts for serialized token strings in the same bounded cache', async () => {
    const prepared = await prepareMarkdown('```ts\nconst value = 1\n```')
    const compacted = staticTokens(prepared.document)
    const pending = [...compacted.document.children]
    let html = ''
    while (pending.length) {
      const node = pending.pop()!
      if (node.type === 'element' && node.tagName === 'code') {
        const element = compacted.runtime.jsx('code', { node })
        html +=
          (element.props as { dangerouslySetInnerHTML?: { __html: string } }).dangerouslySetInnerHTML
            ?.__html ?? ''
      }
      if ('children' in node) pending.push(...node.children)
    }
    expect(html).toContain('<span')
    expect(compacted.runtime.retainedBytes).toBe(html.length * 2)
  })
  it('does not confuse authored empty node attributes with compacted token nodes', async () => {
    const result = await createMarkdownRenderer().render('<custom-box node="">Keep this text</custom-box>', {
      markdown: { html: 'trusted' }
    })
    expect(renderToStaticMarkup(result.content)).toContain('Keep this text')
  })
  it('actually compacts Shiki output, including its HTML-style class properties', async () => {
    const prepared = await prepareMarkdown('```tsx\nconst view = <span>Hello</span>\n```')
    const compacted = staticTokens(prepared.document).document
    const codeChildren = (tree: Root) => {
      let count = -1
      const walk = (node: Root | Root['children'][number]) => {
        if (node.type === 'element' && node.tagName === 'code') count = node.children.length
        if ('children' in node) node.children.forEach(walk)
      }
      walk(tree)
      return count
    }
    expect(codeChildren(prepared.document)).toBeGreaterThan(0)
    expect(codeChildren(compacted)).toBe(0)
  })
  const source =
    '```tsx filename="Example.tsx"\nconst view = <span title="unsafe">{"<script>alert(1)</script>"}</span> // [!code focus]\nconst next = 2 // [!code ++]\n```'
  const parse = (html: string) => {
    const container = document.createElement('div')
    container.innerHTML = html
    return container
  }

  it('preserves tokens, notation, source, classes and toolbar without escaping code as markup', async () => {
    const renderer = createMarkdownRenderer()
    const fast = parse(
      renderToStaticMarkup((await renderer.render(source, { classNames: { code: 'custom-code' } })).content)
    )
    const normal = parse(
      renderToStaticMarkup(
        (
          await renderer.render(source, {
            classNames: { code: 'custom-code' },
            components: { span: (props) => createElement('span', props) }
          })
        ).content
      )
    )
    expect(fast.innerHTML).toBe(normal.innerHTML)
    expect(fast.querySelectorAll('code span').length).toBeGreaterThan(10)
    expect(fast.querySelector('code')?.textContent).toContain('<script>alert(1)</script>')
    expect(fast.querySelector('script')).toBeNull()
    expect(fast.querySelector('pre')?.classList.contains('custom-code')).toBe(true)
    expect(fast.querySelector('.cf-code-file-name')?.textContent).toBe('Example.tsx')
    expect(fast.querySelector('[data-cf-action="copy-code"]')).not.toBeNull()
  })

  it('preserves host overrides and does not mutate a cached document used by them', async () => {
    const renderer = createMarkdownRenderer()
    await renderer.render(source)
    const span = vi.fn((props) => createElement('span', { ...props, 'data-override': true }))
    const html = renderToStaticMarkup((await renderer.render(source, { components: { span } })).content)
    expect(span.mock.calls.length).toBeGreaterThan(10)
    expect(html).toContain('data-override="true"')
    expect(html).toContain('alert(1)')
    const inherited = Object.create({ span })
    span.mockClear()
    renderToStaticMarkup((await renderer.render(source, { components: inherited })).content)
    expect(span.mock.calls.length).toBeGreaterThan(10)
  })

  it('compacts only inert tokens, without mutating source or bypassing semantic plugin nodes', () => {
    const code: Element = {
      type: 'element',
      tagName: 'code',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: { style: 'color:red' },
          children: [{ type: 'text', value: '<&>' }]
        }
      ]
    }
    const tree: Root = {
      type: 'root',
      children: [{ type: 'element', tagName: 'pre', properties: { className: ['shiki'] }, children: [code] }]
    }
    const compacted = staticTokens(tree).document
    expect(((compacted.children[0] as Element).children[0] as Element).children).toEqual([])
    expect(code.children).toHaveLength(1)
    code.properties.id = 'code-anchor'
    expect(staticTokens(tree).document).toBe(tree)
    delete code.properties.id
    for (const properties of [{ dataCfComponent: 'badge' }, { onClick: 'unsafe' }, { id: 'anchor' }]) {
      const token = code.children[0] as Element
      token.properties = properties
      expect(staticTokens(tree).document).toBe(tree)
    }
  })
})
