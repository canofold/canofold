import type { Root } from 'hast'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { serializeMarkdownNode } from '../protocol/serializedNode'
import { readSerializedChildren, readSerializedNode } from './serialized'

const document: Root = {
  type: 'root',
  children: [
    { type: 'text', value: 'Before ' },
    {
      type: 'element',
      tagName: 'strong',
      properties: {},
      children: [{ type: 'text', value: 'important' }]
    }
  ]
}

describe('serialized island rendering', () => {
  it('renders a serialized node with the shared Markdown component map', () => {
    const serialized = serializeMarkdownNode({
      type: 'element',
      tagName: 'p',
      properties: {},
      children: document.children
    })

    const html = renderToStaticMarkup(
      <>{readSerializedNode(serialized, { classNames: { paragraph: 'custom-paragraph' } })}</>
    )

    expect(html).toContain('class="custom-paragraph"')
    expect(html).toContain('Before <strong')
    expect(html).toContain('important</strong>')
  })

  it('renders serialized children with and without mapped components', () => {
    const serialized = serializeMarkdownNode(document)

    const mapped = renderToStaticMarkup(<>{readSerializedChildren(serialized)}</>)
    const intrinsic = renderToStaticMarkup(<>{readSerializedChildren(serialized, {}, false)}</>)

    expect(mapped).toContain('data-df-element="strong"')
    expect(intrinsic).toBe('Before <strong>important</strong>')
  })

  it('returns undefined for missing, malformed, or non-parent serialized values', () => {
    const text = serializeMarkdownNode({ type: 'text', value: 'plain' })

    expect(readSerializedNode('{invalid')).toBeUndefined()
    expect(readSerializedNode()).toBeUndefined()
    expect(readSerializedChildren('{invalid')).toBeUndefined()
    expect(readSerializedChildren(text)).toBeUndefined()
  })
})
