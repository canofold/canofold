import { SKIP, visit } from 'unist-util-visit'
import type { Element, ElementContent, Root as HastRoot, RootContent as HastContent } from 'hast'
import type { Root as MdastRoot } from 'mdast'
import type { Node } from 'unist'
import type { MarkdownAssetCollector } from '../assets'
import type { NormalizedMarkdownOptions } from '../normalizeOptions'

function mdxComponentName(name: unknown) {
  return String(name ?? '')
    .replace(/^Markdown/, '')
    .toLowerCase()
}

function isComponent(node: unknown, component: string) {
  if (!node || typeof node !== 'object' || !('properties' in node)) return false
  const properties = (node as Element).properties
  return properties?.dataCfComponent === component || properties?.['data-cf-component'] === component
}

interface MdxJsxNode extends Node {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement'
  name?: string | null
}

function trackMdxComponent(node: Node, assets: MarkdownAssetCollector) {
  if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return false

  const name = mdxComponentName((node as MdxJsxNode).name)
  if (name === 'terminal') {
    assets.markBehavior('terminal-toolbar')
    return true
  }

  if (name === 'gallery') assets.markBehavior('gallery')
  else if (name === 'filetree') assets.markBehavior('file-tree')
  else if (name === 'table') assets.markBehavior('table')
  else if (name === 'image') assets.markBehavior('image')
  else if (name === 'codeblock') assets.markBehavior('code-toolbar')
  else if (name === 'codegroup' || name === 'tabs') assets.markBehavior('tabs')
  else return false
  return true
}

/** Track explicit React components embedded in trusted MDX. */
export const remarkMdxIslandTracker = (assets: MarkdownAssetCollector) => {
  return (tree: MdastRoot) => {
    visit(tree, (node) => {
      trackMdxComponent(node, assets)
    })
  }
}

/** Preserve fenced block metadata through raw HTML sanitization. */
export const remarkFenceMetadata = (options: NormalizedMarkdownOptions) => {
  return (tree: MdastRoot) => {
    visit(tree, 'code', (node) => {
      const language = String(node.lang ?? '').toLowerCase()
      const meta = String(node.meta ?? '')
      const match = meta.match(/(?:title|filename|label)\s*=\s*["']([^"']+)["']|\[([^\]]+)\]/i)
      const filename = match?.[1]?.trim() || match?.[2]?.trim()
      const isTerminal = options.features.terminals && language === 'terminal'
      if (!meta && !filename && !isTerminal) return
      node.data = {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          ...(meta ? { metastring: meta } : {}),
          ...(filename ? { title: filename, dataCfFilename: filename } : {}),
          ...(isTerminal ? { title: filename || options.labels.terminalTitle } : {})
        }
      }
    })
  }
}

/** Copy authored code titles onto the pre element before Shiki replaces code children. */
export const rehypeFenceMetadata = () => {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'pre') return
      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code'
      )
      const filename = String(
        code?.properties?.dataCfFilename ??
          code?.properties?.['data-cf-filename'] ??
          code?.properties?.title ??
          code?.properties?.['data-title'] ??
          ''
      ).trim()
      if (filename) node.properties = { ...node.properties, dataCfFilename: filename }
    })
  }
}

function element(
  tagName: string,
  properties: Element['properties'] = {},
  children: ElementContent[] = []
): Element {
  return { type: 'element', tagName, properties, children }
}

function hastText(node: HastRoot | HastContent | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value
  return 'children' in node ? node.children.map((child) => hastText(child)).join('') : ''
}

function classNames(node: Element | undefined) {
  const raw = node?.properties?.className ?? node?.properties?.class
  return Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/\s+/) : []
}

function codeLines(code: Element | undefined) {
  if (!code) return []
  return code.children.filter(
    (child): child is Element =>
      child.type === 'element' && child.tagName === 'span' && classNames(child).includes('line')
  )
}

function codeSource(code: Element | undefined, fallback: Element) {
  const lines = codeLines(code)
  if (lines.length > 0) return lines.map((line) => hastText(line)).join('\n')
  return hastText(code ?? fallback).replace(/\n$/, '')
}

function ensureCodeLines(code: Element | undefined, source: string) {
  if (!code || codeLines(code).length > 0) return
  code.children = source
    .split('\n')
    .map((line) => element('span', { className: ['line'] }, line ? [{ type: 'text', value: line }] : []))
}

function languageFromCode(node: Element | undefined) {
  const raw = node?.properties.className ?? node?.properties.class
  const classes = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\s+/) : []
  const language = classes.find(
    (value: unknown) => typeof value === 'string' && value.startsWith('language-')
  )
  return typeof language === 'string' ? language.slice('language-'.length).toLowerCase() : ''
}

/** Convert special fenced code into serializable inputs for React blocks. */
export const rehypeRichFences = (assets: MarkdownAssetCollector, options: NormalizedMarkdownOptions) => {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined || isComponent(parent, 'code-block'))
        return
      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code'
      )
      const language = languageFromCode(code)
      const source = hastText(code).replace(/\n$/, '')

      if (options.features.terminals && language === 'terminal') {
        assets.markBehavior('terminal-toolbar')
        parent.children[index] = element('div', {
          className: ['cf-terminal'],
          dataCfComponent: 'terminal',
          dataCfBehavior: 'terminal-toolbar',
          dataCfSlot: 'root',
          dataCfTitle: String(code?.properties?.title ?? options.labels.terminalTitle),
          dataCfSource: source,
          dataCfCopyLabel: options.labels.copyTerminal,
          dataCfCopyFailureLabel: options.labels.copyFailed
        })
        return [SKIP, index]
      }
    })
  }
}

function mdxAttribute(name: string, value: string | null) {
  return { type: 'mdxJsxAttribute' as const, name, value }
}

/** Convert rich fences into React components for the MDX recma pipeline. */
export const remarkMdxRichBlocks = (assets: MarkdownAssetCollector, options: NormalizedMarkdownOptions) => {
  return (tree: MdastRoot) => {
    visit(tree, 'code', (node, index, parent) => {
      if (!parent || index === undefined) return
      const lang = String(node.lang ?? '').toLowerCase()
      const source = String(node.value ?? '')
      const meta = String(node.meta ?? '')
      const titleMatch = meta.match(/(?:title|label)\s*=\s*["']([^"']+)["']/i)

      if (lang === 'terminal') {
        if (!options.features.terminals) return
        assets.markBehavior('terminal-toolbar')
        parent.children[index] = {
          type: 'mdxJsxFlowElement',
          name: 'Terminal',
          attributes: [
            mdxAttribute('title', titleMatch?.[1]?.trim() || options.labels.terminalTitle),
            mdxAttribute('source', source),
            mdxAttribute('copyLabel', options.labels.copyTerminal),
            mdxAttribute('copyFailureLabel', options.labels.copyFailed)
          ],
          children: []
        }
        return [SKIP, index]
      }
    })
  }
}

/** Wrap each highlighted code block with a file/language label and copy action. */
export const rehypeCodeBlocks = (
  assets: MarkdownAssetCollector,
  labels: NormalizedMarkdownOptions['labels'],
  excludedLanguages: ReadonlySet<string> = new Set()
) => {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined || isComponent(parent, 'code-block'))
        return
      assets.markBehavior('code-toolbar')
      node.properties = { ...node.properties, dataCfSlot: 'content' }
      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code'
      )
      const language = languageFromCode(code)
      if (language && excludedLanguages.has(language)) return
      // @shikijs/rehype writes the language onto `properties.class`, not `className`.
      const raw: unknown = code?.properties?.className ?? code?.properties?.class
      const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\s+/) : []
      const match = list.find((value) => typeof value === 'string' && value.startsWith('language-')) as
        string | undefined
      const lang = match ? match.slice('language-'.length) : 'text'
      const parentProperties = parent.type === 'element' ? parent.properties : undefined
      const filename = String(
        node.properties?.dataCfFilename ??
          node.properties?.['data-cf-filename'] ??
          parentProperties?.dataCfFilename ??
          parentProperties?.['data-cf-filename'] ??
          code?.properties?.dataCfFilename ??
          code?.properties?.['data-cf-filename'] ??
          code?.properties?.title ??
          code?.properties?.['data-title'] ??
          ''
      ).trim()
      const source = codeSource(code, node)
      ensureCodeLines(code, source)
      const figure: Element = {
        type: 'element',
        tagName: 'figure',
        properties: {
          className: ['cf-code'],
          dataCfComponent: 'code-block',
          dataCfBehavior: 'code-toolbar',
          dataCfSlot: 'root',
          dataCfLanguage: lang,
          ...(filename ? { dataCfFilename: filename } : {}),
          dataCfSource: source,
          dataCfCopyLabel: labels.copyCode,
          dataCfCopyFailureLabel: labels.copyFailed
        },
        children: [node]
      }
      parent.children[index] = figure
      return [SKIP]
    })
  }
}
