import type { MarkdownLabels } from '@canofold/markdown'
import type { CanofoldLocaleMessages } from './types'

const zhMarkdownLabels: Partial<MarkdownLabels> = {
  copyCode: '复制代码',
  copyFailed: '复制失败',
  copySnippet: '复制片段',
  copyTerminal: '复制终端输出',
  terminalTitle: '终端',
  tabsTitle: '选项卡',
  tabItem: '选项 {index}',
  codeGroupTitle: '代码组',
  codeGroupItem: '代码 {index}',
  taskCompleted: '已完成任务',
  taskIncomplete: '未完成任务',
  copySectionLink: '复制章节链接',
  tableTitle: '表格',
  copyTableCsv: '复制为 CSV',
  downloadTableCsv: '下载 CSV',
  zoomTable: '放大表格',
  closeTablePreview: '关闭表格预览',
  sortTableColumn: '按第 {column} 列排序',
  zoomImage: '放大图片',
  closeImagePreview: '关闭图片预览',
  imageGallery: '图片画廊',
  closeImageGallery: '关闭图片画廊',
  previousGalleryImage: '上一张图片',
  nextGalleryImage: '下一张图片',
  galleryThumbnails: '图片画廊缩略图',
  galleryImage: '图片'
}

export function languageCode(locale: string): string {
  return locale.toLowerCase().split('-')[0] ?? locale.toLowerCase()
}

export function localizedValue<T>(values: Record<string, T> | undefined, locale: string): T | undefined {
  if (!values) return undefined
  const normalized = locale.toLowerCase()
  return Object.entries(values).find(([key]) => key.toLowerCase() === normalized)?.[1]
}

export function markdownLabelsFor(
  locale: string,
  messages?: Record<string, CanofoldLocaleMessages>
): Partial<MarkdownLabels> | undefined {
  const custom = localizedValue(messages, locale)?.markdown
  const builtIn = languageCode(locale) === 'zh' ? zhMarkdownLabels : undefined
  if (!builtIn && !custom) return undefined
  return { ...builtIn, ...custom }
}
