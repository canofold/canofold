import { describe, expect, it } from 'vitest'
import { createDeterministicSummary } from './summaries'
import { createMarkdownRenderer } from '@canofold/markdown/server'

describe('createDeterministicSummary', () => {
  it('prefers description over first paragraph', () => {
    expect(createDeterministicSummary({ description: 'Desc', excerpt: 'First paragraph.' })).toBe('Desc')
  })

  it('uses first compiled paragraph when description is missing', async () => {
    const analysis = await createMarkdownRenderer().analyze('# Title\n\nFirst paragraph.\n\nSecond.')
    expect(createDeterministicSummary({ description: '', excerpt: analysis.excerpt })).toBe(
      'First paragraph.'
    )
  })

  it.each([
    [':::tip\nKeep the deployment reversible.\n:::', 'Keep the deployment reversible.'],
    ['| Name | Value |\n| --- | --- |\n| Mode | Safe |', 'Name Value Mode Safe'],
    ['- First item\n- Second item', 'First item Second item'],
    ['> Quoted guidance', 'Quoted guidance'],
    ['![Architecture overview](/architecture.png)', 'Architecture overview']
  ])('returns plain text for Markdown block %s', async (body, expected) => {
    const analysis = await createMarkdownRenderer().analyze(body)
    expect(createDeterministicSummary({ description: '', excerpt: analysis.excerpt })).toBe(expected)
  })
})
