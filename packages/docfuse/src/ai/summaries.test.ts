import { describe, expect, it } from 'vitest'
import { createDeterministicSummary } from './summaries'

describe('createDeterministicSummary', () => {
  it('prefers description over first paragraph', () => {
    expect(createDeterministicSummary({ description: 'Desc', body: 'First paragraph.' })).toBe('Desc')
  })

  it('uses first paragraph when description is missing', () => {
    expect(
      createDeterministicSummary({ description: '', body: '# Title\n\nFirst paragraph.\n\nSecond.' })
    ).toBe('First paragraph.')
  })

  it.each([
    [':::tip\nKeep the deployment reversible.\n:::', 'Keep the deployment reversible.'],
    ['| Name | Value |\n| --- | --- |\n| Mode | Safe |', 'Name Value Mode Safe'],
    ['- First item\n- Second item', 'First item Second item'],
    ['> Quoted guidance', 'Quoted guidance'],
    ['![Architecture overview](/architecture.png)', 'Architecture overview']
  ])('returns plain text for Markdown block %s', (body, expected) => {
    expect(createDeterministicSummary({ description: '', body })).toBe(expected)
  })
})
