import { createMarkdownRenderer } from '@canofold/markdown/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { countReadingTime, readingTime } from './index'

async function render(source: string, plugin = readingTime(), locale?: string) {
  const renderer = createMarkdownRenderer()
  const result = await renderer.render(source, { markdown: { plugins: [plugin], locale } })
  return renderToStaticMarkup(result.content)
}

describe('readingTime plugin', () => {
  it('inserts a reading-time line with minute and word counts', async () => {
    const html = await render('# Hello\n\n' + 'word '.repeat(220))

    expect(html).toContain('class="cf-reading-time"')
    expect(html).toContain('data-cf-reading-minutes="1"')
    expect(html).toContain('1 min read')
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('class="cf-reading-time"'))
  })

  it('counts CJK characters separately and uses the built-in Chinese label', async () => {
    const html = await render('中文阅读时长测试正文'.repeat(50), readingTime(), 'zh-CN')

    expect(html).toContain('约 2 分钟阅读')
    expect(html).toContain('data-cf-reading-minutes="2"')
  })

  it('selects locale-specific labels for Markdown and MDX', async () => {
    const plugin = readingTime({
      labels: { ja: '約 {minutes} 分で読めます' }
    })

    expect(await render('# 見出し\n\n本文', plugin, 'ja-JP')).toContain('約 1 分で読めます')

    const renderer = createMarkdownRenderer()
    const result = await renderer.renderMdx('# 标题\n\n正文内容', {
      markdown: { plugins: [plugin], locale: 'zh' }
    })
    expect(renderToStaticMarkup(result.content)).toContain('约 1 分钟阅读')
  })

  it('does not add reading metadata to an empty document', async () => {
    const html = await render('   \n\n')

    expect(html).not.toContain('class="cf-reading-time"')
    expect(html).not.toContain('min read')
  })

  it('excludes code by default and includes it when asked', async () => {
    const source = 'intro\n\n```ts\n' + 'token '.repeat(500) + '\n```'
    const withoutCode = await render(source)
    const withCode = await render(source, readingTime({ includeCode: true, wordsPerMinute: 100 }))

    expect(withoutCode).toContain('data-cf-reading-minutes="1"')
    expect(withCode).toMatch(/data-cf-reading-minutes="[2-9]"/)
  })

  it('exposes a pure counter for the cache identity inputs', () => {
    expect(countReadingTime('one two three 你好', 220, 300)).toEqual({
      latinWords: 3,
      cjkCharacters: 2,
      minutes: 1
    })
    expect(readingTime({ includeCode: true }).cacheKey).toMatchObject({ includeCode: true })
  })

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects an invalid words-per-minute value: %s',
    (wordsPerMinute) => {
      expect(() => readingTime({ wordsPerMinute })).toThrow('wordsPerMinute must be a positive finite number')
    }
  )

  it('rejects invalid CJK reading speed in both the plugin and pure counter', () => {
    expect(() => readingTime({ cjkWordsPerMinute: 0 })).toThrow(
      'cjkWordsPerMinute must be a positive finite number'
    )
    expect(() => countReadingTime('正文', 220, 0)).toThrow(
      'cjkWordsPerMinute must be a positive finite number'
    )
  })
})
