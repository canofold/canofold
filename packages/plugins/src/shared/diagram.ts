import type { Element, Root, Text } from 'hast'
import { visit } from 'unist-util-visit'

export interface DiagramFenceOptions {
  kind: string
  languages: ReadonlySet<string>
  filename(language: string): string
  imageUrl?(source: string, language: string): string | undefined
  moduleUrl?: string
}

interface DiagramLabels {
  copy: string
  source: string
  preview: string
  expand: string
  close: string
  controls: string
  zoomOut: string
  zoomReset: string
  zoomIn: string
  imageAlt(kind: string): string
  loadingPreview: string
}

function displayKind(kind: string) {
  if (kind === 'plantuml') return 'PlantUML'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

const DIAGRAM_LABELS: Record<'en' | 'zh', DiagramLabels> = {
  en: {
    copy: 'Copy source',
    source: 'Show source',
    preview: 'Show preview',
    expand: 'Expand diagram',
    close: 'Close expanded diagram',
    controls: 'Diagram zoom controls',
    zoomOut: 'Zoom out',
    zoomReset: 'Reset zoom',
    zoomIn: 'Zoom in',
    imageAlt: (kind) => `${displayKind(kind)} diagram`,
    loadingPreview: 'Diagram preview loads in the browser.'
  },
  zh: {
    copy: '复制图表源码',
    source: '显示图表源码',
    preview: '显示图表预览',
    expand: '放大图表',
    close: '关闭图表预览',
    controls: '图表缩放控件',
    zoomOut: '缩小图表',
    zoomReset: '重置图表缩放',
    zoomIn: '放大图表',
    imageAlt: (kind) => `${displayKind(kind)} 图表`,
    loadingPreview: '图表预览将在浏览器中加载。'
  }
}

function labelsFromFile(file: unknown) {
  if (!file || typeof file !== 'object' || !('data' in file)) return DIAGRAM_LABELS.en
  const data = file.data
  if (!data || typeof data !== 'object' || !('canofoldLocale' in data)) return DIAGRAM_LABELS.en
  const locale = typeof data.canofoldLocale === 'string' ? data.canofoldLocale.toLowerCase() : ''
  return locale === 'zh' || locale.startsWith('zh-') ? DIAGRAM_LABELS.zh : DIAGRAM_LABELS.en
}

function languageOf(node: Element) {
  const code = node.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code'
  )
  if (!code) return undefined
  const classes = Array.isArray(code.properties.className) ? code.properties.className : []
  const language = classes
    .map(String)
    .find((className) => className.startsWith('language-'))
    ?.slice('language-'.length)
    .toLowerCase()
  const source = code.children
    .filter((child): child is Text => child.type === 'text')
    .map((child) => child.value)
    .join('')
  return language ? { language, source } : undefined
}

function action(name: string, label: string, properties: Element['properties'] = {}): Element {
  return {
    type: 'element',
    tagName: 'button',
    properties: { type: 'button', dataCfDiagramAction: name, ariaLabel: label, ...properties },
    children: [{ type: 'text', value: label }]
  }
}

function zoomControl(name: 'zoom-out' | 'zoom-reset' | 'zoom-in', label: string): Element {
  return {
    type: 'element',
    tagName: 'button',
    properties: { type: 'button', dataCfDiagramAction: name, ariaLabel: label, title: label },
    children: [{ type: 'text', value: label }]
  }
}

/** Replace plugin-owned code fences with a stable, framework-free diagram shell. */
export function diagramFence(options: DiagramFenceOptions) {
  return () => (tree: Root, file: unknown) => {
    const labels = labelsFromFile(file)
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index === undefined || node.tagName !== 'pre') return
      const fence = languageOf(node)
      if (!fence || !options.languages.has(fence.language)) return
      const imageUrl = options.imageUrl?.(fence.source, fence.language)
      const hasVisualPreview = Boolean(imageUrl || options.kind === 'mermaid')
      const preview: Element = imageUrl
        ? {
            type: 'element',
            tagName: 'img',
            properties: {
              className: ['cf-diagram-img'],
              src: imageUrl,
              alt: labels.imageAlt(options.kind),
              loading: 'lazy'
            },
            children: []
          }
        : {
            type: 'element',
            tagName: 'div',
            properties: { className: ['cf-diagram-placeholder'] },
            children: [{ type: 'text', value: labels.loadingPreview }]
          }

      parent.children[index] = {
        type: 'element',
        tagName: 'figure',
        properties: {
          className: ['cf-diagram-window'],
          dataCfPluginDiagram: options.kind,
          dataCfSource: fence.source,
          ...(options.moduleUrl ? { dataCfModuleUrl: options.moduleUrl } : {})
        },
        children: [
          {
            type: 'element',
            tagName: 'figcaption',
            properties: { className: ['cf-diagram-toolbar'] },
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['cf-diagram-title'] },
                children: [{ type: 'text', value: options.filename(fence.language) }]
              },
              {
                type: 'element',
                tagName: 'span',
                properties: { className: ['cf-diagram-actions'] },
                children: [
                  action('copy', labels.copy),
                  action('source', labels.source, { dataCfDiagramPreviewLabel: labels.preview }),
                  action('expand', labels.expand, { dataCfDiagramCloseLabel: labels.close })
                ]
              }
            ]
          },
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['cf-diagram-stage'] },
            children: [
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['cf-diagram-preview'] },
                children: [preview]
              },
              {
                type: 'element',
                tagName: 'pre',
                properties: { className: ['cf-diagram-source'], hidden: true },
                children: [
                  {
                    type: 'element',
                    tagName: 'code',
                    properties: {},
                    children: [{ type: 'text', value: fence.source }]
                  }
                ]
              },
              ...(hasVisualPreview
                ? [
                    {
                      type: 'element' as const,
                      tagName: 'div',
                      properties: {
                        className: ['cf-diagram-zoom-controls'],
                        role: 'group',
                        ariaLabel: labels.controls
                      },
                      children: [
                        zoomControl('zoom-out', labels.zoomOut),
                        zoomControl('zoom-reset', labels.zoomReset),
                        zoomControl('zoom-in', labels.zoomIn)
                      ]
                    }
                  ]
                : [])
            ]
          }
        ]
      }
    })
  }
}
