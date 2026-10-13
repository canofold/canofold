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

  it('emits renderer metadata and preview controls for host-rendered diagrams', () => {
    const diagramCode: Element = {
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['language-dot'] },
          children: [{ type: 'text', value: 'digraph G { a -> b }' }]
        }
      ]
    }
    const tree: Root = { type: 'root', children: [diagramCode] }

    diagramFence({
      kind: 'kroki',
      languages: new Set(['dot']),
      filename: () => 'diagram.graphviz',
      diagramType: () => 'graphviz',
      clientRenderer: true
    })()(tree, { data: { canofoldLocale: 'zh' } })

    const html = JSON.stringify(tree.children[0])
    expect(html).toContain('dataCfDiagramLanguage')
    expect(html).toContain('dot')
    expect(html).toContain('dataCfDiagramType')
    expect(html).toContain('graphviz')
    expect(html).toContain('dataCfImageAlt')
    expect(html).toContain('Kroki 图表')
    expect(html).toContain('cf-diagram-zoom-controls')
  })

  it('renders source-only diagrams as source without inactive preview controls', () => {
    const diagramCode: Element = {
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['language-dot'] },
          children: [{ type: 'text', value: 'digraph G { a -> b }' }]
        }
      ]
    }
    const tree: Root = { type: 'root', children: [diagramCode] }

    diagramFence({
      kind: 'kroki',
      languages: new Set(['dot']),
      filename: () => 'diagram.graphviz'
    })()(tree, { data: { canofoldLocale: 'en' } })

    const html = JSON.stringify(tree.children[0])
    expect(html).toContain('cf-diagram-source')
    expect(html).not.toContain('cf-diagram-placeholder')
    expect(html).not.toContain('cf-diagram-zoom-controls')
    expect(html).not.toContain('dataCfDiagramAction":"source')
    expect(html).not.toContain('dataCfDiagramAction":"expand')
  })
})
