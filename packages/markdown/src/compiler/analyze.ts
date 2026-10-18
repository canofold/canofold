import rehypeSlug from 'rehype-slug'
import { toHast } from 'mdast-util-to-hast'
import { toString } from 'hast-util-to-string'
import { remarkDefinitionList } from 'remark-definition-list'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified, type Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import type {
  Code,
  Definition,
  Image,
  ImageReference,
  Link,
  LinkReference,
  Text,
  Root as MdastRoot
} from 'mdast'
import type { Root as HastRoot, Element } from 'hast'
import type { Directives } from 'mdast-util-directive'
import type { Node, Parent } from 'unist'
import { srcSetCandidates } from '../utils/srcSet.js'
import { normalizeCallouts } from './plugins/directives.js'
import {
  collectRichDirectiveIssues,
  restoreLiteralDirectives,
  type MarkdownDirectiveIssue
} from './directiveValidation.js'
import { activeMarkdownPlugins, markdownPluginDirectiveNames, normalizeMarkdownPlugins } from './plugins.js'
import type { MarkdownPlugin } from './types.js'

export interface MarkdownHeading {
  level: number
  text: string
  slug: string
}

export interface MarkdownCodeExample {
  language: string
  meta?: string
  code: string
}

export interface MarkdownDirective {
  name: string
  type: 'containerDirective' | 'leafDirective' | 'textDirective'
  label: string
  attributes: Record<string, string>
  line?: number
  column?: number
  offset?: number
  endOffset?: number
}

export interface MarkdownAnalysis {
  text: string
  headings: MarkdownHeading[]
  codeExamples: MarkdownCodeExample[]
  links: string[]
  linkLocations: Array<{ line: number; column: number } | undefined>
  images: string[]
  imageLocations: Array<{ line: number; column: number } | undefined>
  missingCodeBlockLanguages: number
  missingCodeBlockLanguageLocations: Array<{ line: number; column: number } | undefined>
  directives: MarkdownDirective[]
  directiveIssues: MarkdownDirectiveIssue[]
}

export interface AnalyzeMarkdownOptions {
  /** Plugins whose declared directives should be accepted for this source. */
  plugins?: readonly MarkdownPlugin[]
  mode?: 'markdown' | 'mdx'
}

/** Content facts from the final compiler tree, without exposing that tree to hosts. */
export type MarkdownContentAnalysis = Pick<MarkdownAnalysis, 'text' | 'headings' | 'codeExamples'> &
  MarkdownReferences & { excerpt: string }

export type MarkdownReferences = Pick<MarkdownAnalysis, 'links' | 'images'> & {
  anchors: string[]
  /** null denotes a generated reference with no authored source position. */
  linkLocations: Array<{ line: number; column: number } | null>
  imageLocations: Array<{ line: number; column: number } | null>
}

function codeExample(node: Code): MarkdownCodeExample {
  return { language: node.lang || 'text', ...(node.meta ? { meta: node.meta } : {}), code: node.value }
}

/** Capture author/plugin code before rich fences become presentation components. */
export const remarkCollectCodeExamples: Plugin<[], MdastRoot> = () => (tree, file) => {
  const examples: MarkdownCodeExample[] = []
  visit(tree, 'code', (node) => {
    examples.push(codeExample(node))
  })
  file.data.canofoldCodeExamples = examples
}

interface MdxJsxElement extends Parent {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement'
  name: string | null
  attributes: Array<{ type: string; name?: string; value?: unknown }>
}

function isMdxJsxElement(node: Node): node is MdxJsxElement {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement'
}

/** Only native tags and literal attributes have predictable static output. */
function staticTagName(node: Node): string | undefined {
  if (node.type === 'element') return (node as Element).tagName
  if (isMdxJsxElement(node) && (node.name === 'MarkdownImage' || node.name === 'Image')) return 'img'
  if (isMdxJsxElement(node) && node.name && /^[a-z][a-z\d-]*$/.test(node.name)) return node.name
  return undefined
}

function staticAttributeValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  const body = (
    value as {
      data?: {
        estree?: { body?: Array<{ type: string; expression?: { type: string; value?: unknown } }> }
      }
    }
  ).data?.estree?.body
  const expression =
    body?.length === 1 && body[0]?.type === 'ExpressionStatement' ? body[0].expression : undefined
  return expression?.type === 'Literal' && typeof expression.value === 'string' ? expression.value : undefined
}

function staticProperty(node: Node, name: string): unknown {
  if (node.type === 'element') return (node as Element).properties[name]
  if (isMdxJsxElement(node)) {
    // JSX applies attributes from left to right. A later spread can override
    // any earlier value, and must never be evaluated during static analysis.
    for (let index = node.attributes.length - 1; index >= 0; index -= 1) {
      const attribute = node.attributes[index]!
      if (attribute.type === 'mdxJsxExpressionAttribute') return undefined
      if (attribute.type === 'mdxJsxAttribute' && attribute.name === name) {
        return staticAttributeValue(attribute.value)
      }
    }
  }
  return undefined
}

export function analyzeDocument(
  document: HastRoot,
  codeExamples: MarkdownCodeExample[]
): MarkdownContentAnalysis {
  const result: MarkdownContentAnalysis = {
    text: '',
    excerpt: '',
    headings: [],
    codeExamples,
    links: [],
    linkLocations: [],
    images: [],
    imageLocations: [],
    anchors: []
  }
  const isFootnoteLabel = (node: Node) =>
    node.type === 'element' && staticProperty(node, 'id') === 'footnote-label' && !node.position
  const location = (node: Node) =>
    node.position ? { line: node.position.start.line, column: node.position.start.column } : undefined
  const text = (node: Node): string => {
    if (node.type === 'text') return String((node as Text).value)
    const tagName = staticTagName(node)
    if (tagName) {
      const component = staticProperty(node, 'dataCfComponent') ?? staticProperty(node, 'data-cf-component')
      if (
        ['demo', 'code-block', 'terminal'].includes(String(component)) ||
        ['pre', 'script', 'style', 'button', 'svg'].includes(tagName) ||
        isFootnoteLabel(node) ||
        staticProperty(node, 'dataFootnoteBackref') !== undefined ||
        staticProperty(node, 'dataFootnoteRef') !== undefined
      )
        return ''
      if (tagName === 'img') return String(staticProperty(node, 'alt') ?? '')
    }
    // MDX expressions/modules are never evaluated to discover static content.
    return hasChildren(node) ? node.children.map(text).join(' ') : ''
  }
  result.text = text(document).replace(/\s+/g, ' ').trim()
  result.excerpt =
    document.children
      .filter((node) => !/^h[1-6]$/.test(staticTagName(node) ?? ''))
      .map((node) => text(node).replace(/\s+/g, ' ').trim())
      .find(Boolean) ?? ''
  visit(document, (node) => {
    const tagName = staticTagName(node)
    if (!tagName) return
    const component = staticProperty(node, 'dataCfComponent') ?? staticProperty(node, 'data-cf-component')
    if (component === 'demo') return 'skip'
    const id = staticProperty(node, 'id')
    if (typeof id === 'string') result.anchors.push(id)
    if (/^h[1-6]$/.test(tagName) && typeof id === 'string' && !isFootnoteLabel(node)) {
      result.headings.push({
        level: Number(tagName[1]),
        text: node.type === 'element' ? toString(node as Element) : text(node).trim(),
        slug: id
      })
    }
    if (
      tagName === 'a' &&
      typeof staticProperty(node, 'href') === 'string' &&
      staticProperty(node, 'dataFootnoteBackref') === undefined &&
      staticProperty(node, 'dataFootnoteRef') === undefined
    ) {
      result.links.push(staticProperty(node, 'href') as string)
      result.linkLocations.push(location(node) ?? null)
    }
    if (tagName === 'img' || tagName === 'source') {
      const src = tagName === 'img' ? staticProperty(node, 'src') : undefined
      const srcSet = staticProperty(node, 'srcSet') ?? staticProperty(node, 'srcset')
      const sources = new Set([
        ...(typeof src === 'string' ? [src] : []),
        ...(typeof srcSet === 'string' ? srcSetCandidates(srcSet).map(({ url }) => url) : [])
      ])
      for (const url of sources) {
        if (!url) continue
        result.images.push(url)
        result.imageLocations.push(location(node) ?? null)
      }
    }
  })
  return result
}

function hasChildren(node: Node): node is Parent {
  return 'children' in node && Array.isArray(node.children)
}

function nodeText(node: Node): string {
  if (node.type === 'text' || node.type === 'inlineCode') return String((node as Text).value ?? '')
  if (node.type === 'image') return String((node as Image).alt ?? '')
  if (node.type === 'code' || node.type === 'html' || node.type === 'definition') return ''
  return hasChildren(node) ? node.children.map(nodeText).join(' ') : ''
}

/** Source-only syntax diagnostics. Use renderer.analyze() for plugin-transformed content facts. */
export function analyzeMarkdown(source: string, options: AnalyzeMarkdownOptions = {}): MarkdownAnalysis {
  const processor = unified().use(remarkParse).use(remarkDefinitionList).use(remarkGfm).use(remarkDirective)
  const value = normalizeCallouts(source)
  const tree = processor.parse(value)
  const activePlugins = activeMarkdownPlugins(normalizeMarkdownPlugins(options.plugins), {
    source,
    mode: options.mode ?? 'markdown'
  })
  restoreLiteralDirectives(tree, value, markdownPluginDirectiveNames(activePlugins))
  const headings: MarkdownHeading[] = []
  // The parser always produces a root, which toHast preserves.
  const renderedTree = toHast(tree) as HastRoot
  rehypeSlug()(renderedTree)
  visit(renderedTree, 'element', (node) => {
    // Footnotes move headings and add a synthetic label. Read source headings
    // from the rendered tree itself, never zip two differently ordered trees.
    if (/^h[1-6]$/.test(node.tagName) && node.position) {
      headings.push({
        level: Number(node.tagName[1]),
        text: toString(node),
        slug: String(node.properties.id)
      })
    }
  })
  const codeExamples: MarkdownCodeExample[] = []
  const links: string[] = []
  const linkLocations: MarkdownAnalysis['linkLocations'] = []
  const images: string[] = []
  const imageLocations: MarkdownAnalysis['imageLocations'] = []
  const directives: MarkdownDirective[] = []
  let missingCodeBlockLanguages = 0
  const missingCodeBlockLanguageLocations: MarkdownAnalysis['missingCodeBlockLanguageLocations'] = []
  const definitions = new Map<string, string>()
  const locationOf = (node: Node) =>
    node.position?.start.line && node.position.start.column
      ? { line: node.position.start.line, column: node.position.start.column }
      : undefined

  visit(tree, 'definition', (node: Definition) => {
    if (node.url) definitions.set(node.identifier.toLowerCase(), node.url)
  })

  visit(tree, (node: Node) => {
    if (node.type === 'code') {
      const code = node as Code
      if (!code.lang) {
        missingCodeBlockLanguages += 1
        missingCodeBlockLanguageLocations.push(locationOf(node))
      }
      codeExamples.push(codeExample(code))
    }
    if (node.type === 'link') {
      const link = node as Link
      if (link.url) {
        links.push(link.url)
        linkLocations.push(locationOf(node))
      }
    }
    if (node.type === 'image') {
      const image = node as Image
      if (image.url) {
        images.push(image.url)
        imageLocations.push(locationOf(node))
      }
    }
    if (node.type === 'linkReference') {
      const link = node as LinkReference
      const url = definitions.get(link.identifier.toLowerCase())
      if (url) {
        links.push(url)
        linkLocations.push(locationOf(node))
      }
    }
    if (node.type === 'imageReference') {
      const image = node as ImageReference
      const url = definitions.get(image.identifier.toLowerCase())
      if (url) {
        images.push(url)
        imageLocations.push(locationOf(node))
      }
    }
    if (
      node.type === 'containerDirective' ||
      node.type === 'leafDirective' ||
      node.type === 'textDirective'
    ) {
      const directive = node as Directives
      directives.push({
        name: directive.name,
        type: directive.type,
        label: nodeText(directive).replace(/\s+/g, ' ').trim(),
        attributes: Object.fromEntries(
          Object.entries(directive.attributes ?? {}).flatMap(([name, value]) =>
            typeof value === 'string' ? [[name, value]] : []
          )
        ),
        ...(directive.position?.start.line === undefined ? {} : { line: directive.position.start.line }),
        ...(directive.position?.start.column === undefined
          ? {}
          : { column: directive.position.start.column }),
        ...(directive.position?.start.offset === undefined
          ? {}
          : { offset: directive.position.start.offset }),
        ...(directive.position?.end.offset === undefined ? {} : { endOffset: directive.position.end.offset })
      })
    }
  })

  return {
    text: nodeText(tree).replace(/\s+/g, ' ').trim(),
    headings,
    codeExamples,
    links,
    linkLocations,
    images,
    imageLocations,
    missingCodeBlockLanguages,
    missingCodeBlockLanguageLocations,
    directives,
    directiveIssues: collectRichDirectiveIssues(tree, markdownPluginDirectiveNames(activePlugins)).map(
      ({ message, line, column }) => ({
        message,
        line,
        column
      })
    )
  }
}
