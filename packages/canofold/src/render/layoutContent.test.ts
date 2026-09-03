import { describe, expect, it } from 'vitest'
import {
  layoutContentFor,
  localeNameFor,
  markdownLabelsFor,
  MARKDOWN_ELEMENT_GROUP_IDS,
  notFoundContentFor
} from './layoutContent'

describe('layout content', () => {
  it.each(['zh-CN', 'en'])('defines every Markdown element group exactly once for %s', (locale) => {
    const ids = layoutContentFor(locale).markdownElementGroups.map((group) => group.id)

    expect(ids).toHaveLength(new Set(ids).size)
    expect([...ids].sort()).toEqual([...MARKDOWN_ELEMENT_GROUP_IDS].sort())
  })

  it('merges a third locale over the explicit English fallback', () => {
    const messages = {
      ja: {
        labels: { search: 'ドキュメントを検索', previous: '前へ' },
        brandTagline: 'React ドキュメント',
        quickActions: { codeTitle: 'コードと構文ハイライト' },
        markdownElementGroups: { headings: { label: '見出しと本文', hash: '見出しと本文' } },
        markdown: { terminalTitle: 'ターミナル', copyTerminal: '出力をコピー' },
        notFound: { title: 'ページが見つかりません', home: 'ホームへ戻る' }
      }
    }

    const content = layoutContentFor('ja', messages)
    expect(content.labels.search).toBe('ドキュメントを検索')
    expect(content.labels.previous).toBe('前へ')
    expect(content.labels.next).toBe('Next')
    expect(content.brandTagline).toBe('React ドキュメント')
    expect(content.quickActions.codeTitle).toBe('コードと構文ハイライト')
    expect(content.markdownElementGroups[0]).toMatchObject({
      id: 'headings',
      label: '見出しと本文',
      hash: '見出しと本文'
    })
    expect(markdownLabelsFor('ja', messages)).toMatchObject({
      terminalTitle: 'ターミナル',
      copyTerminal: '出力をコピー'
    })
    expect(notFoundContentFor('ja', messages)).toMatchObject({
      title: 'ページが見つかりません',
      description: "The page you're looking for doesn't exist or has been moved.",
      home: 'ホームへ戻る'
    })
  })

  it('uses configured language names and native Intl names as a fallback', () => {
    expect(localeNameFor('ja', { ja: '日本語（カスタム）' })).toBe('日本語（カスタム）')
    expect(localeNameFor('ja')).toBe('日本語')
    expect(localeNameFor('zh-CN')).toBe('简体中文')
  })
})
