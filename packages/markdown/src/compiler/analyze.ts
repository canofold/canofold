import GithubSlugger from 'github-slugger'
import { remarkDefinitionList } from 'remark-definition-list'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type {
  Code,
  Definition,
  Image,
  ImageReference,
  Link,
  LinkReference,
  PhrasingContent,
  Text
} from 'mdast'
import type { Node, Parent } from 'unist'
import { normalizeCallouts } from './plugins/directives'
import { collectRichDirectiveIssues, type MarkdownDirectiveIssue } from './directiveValidation'
import { activeMarkdownPlugins, markdownPluginDirectiveNames, normalizeMarkdownPlugins } from './plugins'
import type { MarkdownPlugin } from './types'

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

export interface MarkdownAnalysis {
  text: string
  headings: MarkdownHeading[]
  codeExamples: MarkdownCodeExample[]
  links: string[]
  images: string[]
  missingCodeBlockLanguages: number
  directiveIssues: MarkdownDirectiveIssue[]
}

export interface AnalyzeMarkdownOptions {
  /** Plugins whose declared directives should be accepted for this source. */
  plugins?: readonly MarkdownPlugin[]
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

/** Parse navigation/search metadata using syntax that is always part of the Markdown core. */
export function analyzeMarkdown(source: string, options: AnalyzeMarkdownOptions = {}): MarkdownAnalysis {
  const processor = unified().use(remarkParse).use(remarkDefinitionList).use(remarkGfm).use(remarkDirective)
  const tree = processor.parse(normalizeCallouts(source))
  const slugger = new GithubSlugger()
  const headings: MarkdownHeading[] = []
  const codeExamples: MarkdownCodeExample[] = []
  const links: string[] = []
  const images: string[] = []
  let missingCodeBlockLanguages = 0
  const definitions = new Map<string, string>()

  visit(tree, 'definition', (node: Definition) => {
    if (node.url) definitions.set(node.identifier.toLowerCase(), node.url)
  })

  visit(tree, (node: Node) => {
    if (node.type === 'heading') {
      const heading = node as Parent & { depth: number; children: PhrasingContent[] }
      const text = nodeText(heading).replace(/\s+/g, ' ').trim()
      headings.push({ level: heading.depth, text, slug: slugger.slug(text) })
    }
    if (node.type === 'code') {
      const code = node as Code
      if (!code.lang) missingCodeBlockLanguages += 1
      codeExamples.push({
        language: code.lang || 'text',
        ...(code.meta ? { meta: code.meta } : {}),
        code: code.value
      })
    }
    if (node.type === 'link') {
      const link = node as Link
      if (link.url) links.push(link.url)
    }
    if (node.type === 'image') {
      const image = node as Image
      if (image.url) images.push(image.url)
    }
    if (node.type === 'linkReference') {
      const link = node as LinkReference
      const url = definitions.get(link.identifier.toLowerCase())
      if (url) links.push(url)
    }
    if (node.type === 'imageReference') {
      const image = node as ImageReference
      const url = definitions.get(image.identifier.toLowerCase())
      if (url) images.push(url)
    }
  })

  const activePlugins = activeMarkdownPlugins(normalizeMarkdownPlugins(options.plugins), {
    source,
    mode: 'markdown'
  })

  return {
    text: nodeText(tree).replace(/\s+/g, ' ').trim(),
    headings,
    codeExamples,
    links,
    images,
    missingCodeBlockLanguages,
    directiveIssues: collectRichDirectiveIssues(tree, markdownPluginDirectiveNames(activePlugins)).map(
      ({ message, line, column }) => ({
        message,
        line,
        column
      })
    )
  }
}
