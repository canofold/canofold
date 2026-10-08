import { describe, expect, it } from 'vitest'
import { parseFrontmatter, frontmatterSchema } from './frontmatter'

describe('parseFrontmatter', () => {
  it('parses YAML with CRLF, a BOM, aliases, nested values, and date strings', () => {
    const parsed = parseFrontmatter(
      '\uFEFF---\r\ntitle: Guide\r\ncreatedAt: 2026-01-02\r\nbase: &base\r\n  enabled: true\r\ncopy:\r\n  <<: *base\r\n---\r\n# Body\r\n'
    )
    expect(parsed.content).toBe('# Body\r\n')
    expect(parsed.data).toMatchObject({ title: 'Guide', copy: { enabled: true } })
    expect(frontmatterSchema.parse(parsed.data).createdAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('preserves normal Markdown and accepts empty frontmatter and YAML end markers', () => {
    expect(parseFrontmatter('# Body\n---\n')).toEqual({ data: {}, content: '# Body\n---\n' })
    expect(parseFrontmatter('---\n---\nBody')).toEqual({ data: {}, content: 'Body' })
    expect(parseFrontmatter('---\ntitle: Title\n...\nBody')).toEqual({
      data: { title: 'Title' },
      content: 'Body'
    })
  })

  it('rejects malformed or unterminated YAML instead of silently losing content', () => {
    expect(() => parseFrontmatter('---\ntitle: [broken\n---\nBody')).toThrow()
    expect(() => parseFrontmatter('---\ntitle: missing end')).toThrow(/Unterminated/)
    expect(() => parseFrontmatter('---\ntitle: one\ntitle: two\n---')).toThrow()
  })

  it('bounds alias expansion and never changes object prototypes', () => {
    const repeated = Array.from({ length: 15 }, () => '*a').join(', ')
    expect(() =>
      parseFrontmatter(
        `---\na: &a [one, two]\nb: &b [${repeated}]\nc: [${Array.from({ length: 15 }, () => '*b').join(', ')}]\n---\nBody`
      )
    ).toThrow(/alias/i)
    parseFrontmatter('---\n__proto__: {canofoldPolluted: true}\n---\nBody')
    expect(Object.hasOwn(Object.prototype, 'canofoldPolluted')).toBe(false)
  })
})
