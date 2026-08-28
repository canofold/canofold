import type { MarkdownLabels } from '@docfuse/markdown'
import { DOCFUSE_MARKDOWN_ELEMENT_GROUP_IDS } from '../config/constants'
import {
  type DocfuseLayoutLabels,
  type DocfuseLocaleMessages,
  type DocfuseMarkdownElementGroupId,
  type DocfuseNotFoundMessages,
  type DocfuseQuickActionMessages
} from '../config/types'

export const MARKDOWN_ELEMENT_GROUP_IDS = DOCFUSE_MARKDOWN_ELEMENT_GROUP_IDS
export type MarkdownElementGroupId = DocfuseMarkdownElementGroupId

export interface MarkdownElementGroup {
  id: MarkdownElementGroupId
  label: string
  detail: string
  hash: string
}

export interface LayoutContent {
  labels: DocfuseLayoutLabels
  brandTagline: string
  markdownElementGroups: MarkdownElementGroup[]
  quickActions: DocfuseQuickActionMessages
}

const zhContent: LayoutContent = {
  labels: {
    skipToContent: '跳到正文',
    search: '搜索文档',
    searchEmpty: '没有找到匹配文档',
    searchUnavailable: '搜索索引暂时不可用',
    language: '语言',
    primaryNavigation: '主导航',
    theme: '切换主题',
    openSidebar: '打开侧边栏',
    onThisPage: '本页目录',
    edit: '编辑此页',
    updated: '最后更新',
    previous: '上一页',
    next: '下一页',
    close: '关闭',
    source: '源文档',
    preview: '预览效果',
    copySource: '复制源文档',
    sourceCopied: '源文档已复制',
    quickActions: '快捷入口',
    github: 'GitHub 仓库',
    docsNavigation: '文档导航',
    pageNavigation: '页面导航',
    advertisement: '推广',
    version: '文档版本'
  },
  brandTagline: '面向 AI 的 React/MDX 文档',
  markdownElementGroups: [
    { id: 'headings', label: '标题与正文', detail: 'H1-H6 · p · hr', hash: '标题与正文' },
    { id: 'inline', label: '行内语义', detail: 'a · strong · code', hash: '行内语义' },
    { id: 'lists', label: '列表与任务', detail: 'ul · ol · task', hash: '列表与任务' },
    { id: 'callouts', label: '引用与提示', detail: 'quote · callout', hash: '引用与提示' },
    { id: 'code', label: '代码与终端', detail: 'Shiki · pre · diff', hash: '代码与终端' },
    { id: 'tables', label: '表格与数据', detail: 'table · CSV · sort', hash: '表格与数据' },
    { id: 'media', label: '媒体与嵌入', detail: 'img · video · iframe', hash: '媒体与嵌入' },
    { id: 'diagrams', label: '图表与数学', detail: 'Mermaid · PlantUML · KaTeX', hash: '图表与数学' },
    { id: 'disclosure', label: '折叠与脚注', detail: 'details · footnotes', hash: '折叠与脚注' },
    {
      id: 'extensions',
      label: '扩展内容组件',
      detail: 'tabs · steps · cards · tree',
      hash: '扩展内容组件'
    },
    { id: 'api', label: 'API 与侧注', detail: 'API · aside', hash: 'api-与侧注' },
    {
      id: 'metadata',
      label: '文档元信息',
      detail: 'meta · breadcrumb · pagination',
      hash: '文档元信息'
    }
  ],
  quickActions: {
    headingsTitle: '标题 H1-H6',
    headingsDescription: '查看完整标题层级与正文节奏',
    codeTitle: '代码与语法高亮',
    codeDescription: 'Shiki 高亮、diff 行状态与复制',
    tableTitle: '表格与数据操作',
    tableDescription: '排序、复制 CSV 与放大预览',
    diagramTitle: 'Mermaid、PlantUML 与数学公式',
    diagramDescription: '图表预览、源码与缩放',
    sourceDescription: '打开当前页面的 Markdown 原文',
    themeDescription: '在浅色与深色阅读模式间切换'
  }
}

const enContent: LayoutContent = {
  labels: {
    skipToContent: 'Skip to content',
    search: 'Search docs',
    searchEmpty: 'No matching documents',
    searchUnavailable: 'Search index is unavailable',
    language: 'Language',
    primaryNavigation: 'Primary navigation',
    theme: 'Toggle theme',
    openSidebar: 'Open sidebar',
    onThisPage: 'On this page',
    edit: 'Edit this page',
    updated: 'Last updated',
    previous: 'Previous',
    next: 'Next',
    close: 'Close',
    source: 'Source',
    preview: 'Preview',
    copySource: 'Copy source',
    sourceCopied: 'Markdown source copied',
    quickActions: 'Quick actions',
    github: 'GitHub repository',
    docsNavigation: 'Docs navigation',
    pageNavigation: 'Page navigation',
    advertisement: 'Advertisement',
    version: 'Documentation version'
  },
  brandTagline: 'AI-friendly React/MDX documentation',
  markdownElementGroups: [
    { id: 'headings', label: 'Headings & prose', detail: 'H1-H6 · p · hr', hash: 'headings-and-prose' },
    { id: 'inline', label: 'Inline semantics', detail: 'a · strong · code', hash: 'inline-semantics' },
    { id: 'lists', label: 'Lists & tasks', detail: 'ul · ol · task', hash: 'lists-and-tasks' },
    { id: 'callouts', label: 'Quotes & callouts', detail: 'quote · callout', hash: 'quotes-and-callouts' },
    { id: 'code', label: 'Code & terminal', detail: 'Shiki · pre · diff', hash: 'code-and-terminal' },
    { id: 'tables', label: 'Tables & data', detail: 'table · CSV · sort', hash: 'tables-and-data' },
    { id: 'media', label: 'Media & embeds', detail: 'img · video · iframe', hash: 'media-and-embeds' },
    {
      id: 'diagrams',
      label: 'Diagrams & math',
      detail: 'Mermaid · PlantUML · KaTeX',
      hash: 'diagrams-and-math'
    },
    {
      id: 'disclosure',
      label: 'Disclosure & notes',
      detail: 'details · footnotes',
      hash: 'disclosure-and-notes'
    },
    {
      id: 'extensions',
      label: 'Extended components',
      detail: 'tabs · steps · cards · tree',
      hash: 'extended-content-components'
    },
    { id: 'api', label: 'API & sidenote', detail: 'API · aside', hash: 'api-and-sidenote' },
    {
      id: 'metadata',
      label: 'Document metadata',
      detail: 'meta · breadcrumb · pagination',
      hash: 'document-metadata'
    }
  ],
  quickActions: {
    headingsTitle: 'Headings H1-H6',
    headingsDescription: 'Inspect the complete heading scale and prose rhythm',
    codeTitle: 'Code and syntax highlighting',
    codeDescription: 'Shiki highlighting, diff line states, and copy',
    tableTitle: 'Tables and data actions',
    tableDescription: 'Sort, copy CSV, and zoom',
    diagramTitle: 'Mermaid, PlantUML, and math',
    diagramDescription: 'Diagram preview, source, and scale',
    sourceDescription: 'Open the current page Markdown source',
    themeDescription: 'Switch between light and dark reading modes'
  }
}

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

const notFoundMessages = {
  zh: {
    title: '页面未找到',
    description: '该页面不存在、已被移动或地址有误。',
    home: '返回首页 →'
  },
  en: {
    title: 'Page not found',
    description: "The page you're looking for doesn't exist or has been moved.",
    home: 'Go back home →'
  }
} satisfies Record<'zh' | 'en', DocfuseNotFoundMessages>

function languageCode(locale: string): string {
  return locale.toLowerCase().split('-')[0] ?? locale.toLowerCase()
}

function localizedValue<T>(values: Record<string, T> | undefined, locale: string): T | undefined {
  if (!values) return undefined
  const normalized = locale.toLowerCase()
  return Object.entries(values).find(([key]) => key.toLowerCase() === normalized)?.[1]
}

function localeMessagesFor(
  locale: string,
  messages?: Record<string, DocfuseLocaleMessages>
): DocfuseLocaleMessages | undefined {
  return localizedValue(messages, locale)
}

export function layoutContentFor(
  locale: string,
  messages?: Record<string, DocfuseLocaleMessages>
): LayoutContent {
  const base = languageCode(locale) === 'zh' ? zhContent : enContent
  const custom = localeMessagesFor(locale, messages)
  return {
    labels: { ...base.labels, ...custom?.labels },
    brandTagline: custom?.brandTagline ?? base.brandTagline,
    markdownElementGroups: base.markdownElementGroups.map((group) => ({
      ...group,
      ...custom?.markdownElementGroups?.[group.id]
    })),
    quickActions: { ...base.quickActions, ...custom?.quickActions }
  }
}

export function markdownLabelsFor(
  locale: string,
  messages?: Record<string, DocfuseLocaleMessages>
): Partial<MarkdownLabels> | undefined {
  const custom = localeMessagesFor(locale, messages)?.markdown
  const builtIn = languageCode(locale) === 'zh' ? zhMarkdownLabels : undefined
  if (!builtIn && !custom) return undefined
  return { ...builtIn, ...custom }
}

export function notFoundContentFor(
  locale: string,
  messages?: Record<string, DocfuseLocaleMessages>
): DocfuseNotFoundMessages {
  const base = languageCode(locale) === 'zh' ? notFoundMessages.zh : notFoundMessages.en
  return { ...base, ...localeMessagesFor(locale, messages)?.notFound }
}

export function localeNameFor(locale: string, localeNames?: Record<string, string>): string {
  const configured = localizedValue(localeNames, locale)
  if (configured) return configured
  const language = languageCode(locale)
  if (language === 'zh') return '简体中文'
  if (language === 'en') return 'English'
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
  } catch {
    return locale
  }
}

export const DEFAULT_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230088FF'/%3E%3Cpath d='M9 7h10l4 4v14H9z' fill='none' stroke='white' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M19 7v5h5' fill='none' stroke='white' stroke-width='2'/%3E%3Ccircle cx='21' cy='22' r='5' fill='%230088FF' stroke='white' stroke-width='2'/%3E%3C/svg%3E"
