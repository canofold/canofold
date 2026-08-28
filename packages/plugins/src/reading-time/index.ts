import { defineMarkdownPlugin, type MarkdownPlugin } from '@docfuse/markdown'
import type { Root, Text } from 'hast'
import { SKIP, visit } from 'unist-util-visit'
import { element } from '../shared/hast'

const PLUGIN_VERSION = '3'
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g
const SKIP_TAGS = new Set(['pre', 'code', 'script', 'style', 'svg'])
const DEFAULT_LABEL = '{minutes} min read'
const DEFAULT_LABELS = { zh: '约 {minutes} 分钟阅读' } as const

export interface ReadingTimeOptions {
  wordsPerMinute?: number
  cjkWordsPerMinute?: number
  includeCode?: boolean
  /** Fallback label template. English is built in. `{minutes}` is replaced with the calculated value. */
  label?: string
  /** Locale-specific templates, merged over the built-in Chinese label. */
  labels?: Readonly<Record<string, string>>
}

export interface ReadingTimeCounts {
  latinWords: number
  cjkCharacters: number
  minutes: number
}

function positiveRate(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive finite number`)
  return value
}

export function countReadingTime(
  text: string,
  wordsPerMinute: number,
  cjkWordsPerMinute: number
): ReadingTimeCounts {
  positiveRate(wordsPerMinute, 'wordsPerMinute')
  positiveRate(cjkWordsPerMinute, 'cjkWordsPerMinute')
  const cjkCharacters = text.match(CJK)?.length ?? 0
  const latinWords = text.replace(CJK, ' ').match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g)?.length ?? 0
  const minutes = Math.max(1, Math.round(latinWords / wordsPerMinute + cjkCharacters / cjkWordsPerMinute))
  return { latinWords, cjkCharacters, minutes }
}

function collectText(tree: Root, includeCode: boolean) {
  const chunks: string[] = []
  visit(tree, (node) => {
    if (!includeCode && node.type === 'element' && SKIP_TAGS.has(node.tagName)) return SKIP
    if (node.type === 'text') chunks.push((node as Text).value)
  })
  return chunks.join(' ')
}

function localeFromFile(file: unknown) {
  if (!file || typeof file !== 'object' || !('data' in file)) return undefined
  const data = file.data
  if (!data || typeof data !== 'object' || !('docfuseLocale' in data)) return undefined
  const locale = data.docfuseLocale
  return typeof locale === 'string' ? locale.trim().toLowerCase() || undefined : undefined
}

function normalizeLabels(labels: ReadingTimeOptions['labels']) {
  return Object.fromEntries(
    Object.entries(labels ?? {})
      .map(([locale, value]) => [locale.trim().toLowerCase(), value] as const)
      .filter(([locale]) => locale.length > 0)
  )
}

function labelForLocale(fallback: string, labels: Readonly<Record<string, string>>, locale?: string) {
  if (!locale) return fallback
  return labels[locale] ?? labels[locale.split('-')[0] ?? ''] ?? fallback
}

export function readingTime(options: ReadingTimeOptions = {}): MarkdownPlugin {
  const wordsPerMinute = positiveRate(options.wordsPerMinute ?? 220, 'wordsPerMinute')
  const cjkWordsPerMinute = positiveRate(options.cjkWordsPerMinute ?? 300, 'cjkWordsPerMinute')
  const includeCode = options.includeCode === true
  const label = options.label ?? DEFAULT_LABEL
  const labels = { ...DEFAULT_LABELS, ...normalizeLabels(options.labels) }

  return defineMarkdownPlugin({
    name: 'reading-time',
    version: PLUGIN_VERSION,
    cacheKey: { wordsPerMinute, cjkWordsPerMinute, includeCode, label, labels },
    browserCompiler: {
      module: '@docfuse/plugins/reading-time',
      exportName: 'readingTime',
      options: { wordsPerMinute, cjkWordsPerMinute, includeCode, label, labels }
    },
    rehypePlugins: [
      () => (tree: Root, file: unknown) => {
        const counts = countReadingTime(collectText(tree, includeCode), wordsPerMinute, cjkWordsPerMinute)
        if (counts.latinWords + counts.cjkCharacters === 0) return
        const resolvedLabel = labelForLocale(label, labels, localeFromFile(file))
        const readingTimeNode = element(
          'p',
          {
            className: ['df-reading-time'],
            dataDfReadingMinutes: String(counts.minutes),
            dataDfWordCount: String(counts.latinWords + counts.cjkCharacters)
          },
          [{ type: 'text', value: resolvedLabel.replaceAll('{minutes}', String(counts.minutes)) }]
        )
        const titleIndex = tree.children.findIndex((node) => node.type === 'element' && node.tagName === 'h1')
        tree.children.splice(titleIndex >= 0 ? titleIndex + 1 : 0, 0, readingTimeNode)
      }
    ]
  })
}
