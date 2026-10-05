import type { Element, Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { diagramFence } from './diagram'

describe('diagram fences', () => {
  it('ignores malformed pre elements and defaults to English labels without file metadata', () => {
    const missingCode: Element = { type: 'element', tagName: 'pre', properties: {}, children: [] }
    const diagramCode: Element = {
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['language-mermaid'] },
          children: [{ type: 'text', value: 'graph LR' }]
        }
      ]
    }
    const tree: Root = { type: 'root', children: [missingCode, diagramCode] }

    diagramFence({ kind: 'mermaid', languages: new Set(['mermaid']), filename: () => 'diagram.mmd' })()(
      tree,
      undefined
    )

    expect(tree.children[0]).toBe(missingCode)
    expect((tree.children[1] as Element).tagName).toBe('figure')
    expect(JSON.stringify(tree.children[1])).toContain('Copy source')
  })
})
