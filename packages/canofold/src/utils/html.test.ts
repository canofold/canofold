import { describe, expect, it } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('escapes text and attribute delimiters through one shared Node-side implementation', () => {
    expect(escapeHtml(`<a title="Tom & Jerry's">`)).toBe('&lt;a title=&quot;Tom &amp; Jerry&#39;s&quot;&gt;')
  })
})
