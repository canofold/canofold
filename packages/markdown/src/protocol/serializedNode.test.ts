import { describe, expect, it } from 'vitest'
import { deserializeMarkdownNode, serializeMarkdownNode } from './serializedNode'

describe('serialized Markdown node protocol', () => {
  it('round-trips the compact protocol', () => {
    const node = { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: 'Hi' }] }
    expect(deserializeMarkdownNode(serializeMarkdownNode(node))).toEqual(node)
  })

  it('rejects legacy objects and malformed compact tuples', () => {
    expect(deserializeMarkdownNode(JSON.stringify({ type: 'text', value: 'legacy' }))).toBeUndefined()
    expect(deserializeMarkdownNode(JSON.stringify(['e', 'p', {}, 'invalid']))).toBeUndefined()
    expect(deserializeMarkdownNode(JSON.stringify(['r', [['x', 'invalid']]]))).toBeUndefined()
  })
})
