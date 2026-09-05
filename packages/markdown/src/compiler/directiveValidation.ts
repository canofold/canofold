import type { Image, ImageReference, Paragraph, Root } from 'mdast'
import type { ContainerDirective, Directives } from 'mdast-util-directive'
import type { Node, Parent } from 'unist'
import { visit } from 'unist-util-visit'

export interface MarkdownDirectiveIssue {
  message: string
  line?: number
  column?: number
}

interface LocatedDirectiveIssue extends MarkdownDirectiveIssue {
  node: Node
}

const BADGE_TONES = new Set(['accent', 'success', 'warning', 'danger'])
const MEDIA_DIRECTIVES = new Set(['audio', 'video', 'embed'])
const CONTAINER_DIRECTIVES = new Set([
  'aside',
  'file-tree',
  'gallery',
  'card-grid',
  'card',
  'api',
  'response',
  'details',
  'tabs',
  'tab',
  'code-group',
  'steps',
  'step',
  'info',
  'tip',
  'warning',
  'danger'
])
const TEXT_DIRECTIVES = new Set(['badge', 'copy'])
const SAFE_LINK_PROTOCOLS = new Set(['http', 'https', 'irc', 'ircs', 'mailto', 'tel', 'xmpp'])
const SAFE_MEDIA_PROTOCOLS = new Set(['http', 'https'])

function isParent(node: Node): node is Node & Parent {
  return 'children' in node && Array.isArray(node.children)
}

function nodeText(node: Node): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  return isParent(node) ? node.children.map(nodeText).join('') : ''
}

function directiveLabel(node: Directives): string {
  return node.children
    .map((child) => nodeText(child))
    .join('')
    .trim()
}

function directiveAttribute(node: Directives, name: string): string {
  const value = node.attributes?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

function hasSafeProtocol(value: string, protocols: ReadonlySet<string>) {
  const colon = value.indexOf(':')
  const slash = value.indexOf('/')
  const questionMark = value.indexOf('?')
  const numberSign = value.indexOf('#')
  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign)
  ) {
    return true
  }
  const protocol = value
    .slice(0, colon)
    .replace(/[\u0000-\u0020]/g, '')
    .toLowerCase()
  return protocols.has(protocol)
}

function body(node: ContainerDirective) {
  return node.children.filter((child) => !child.data?.directiveLabel)
}

function isDirective(node: Node | undefined, name: string): node is Directives {
  return Boolean(
    node &&
    (node.type === 'containerDirective' || node.type === 'leafDirective' || node.type === 'textDirective') &&
    (node as Directives).name === name
  )
}

function isImageParagraph(node: Node): node is Paragraph {
  if (node.type !== 'paragraph') return false
  const paragraph = node as Paragraph
  const children = paragraph.children.filter(
    (child) => child.type !== 'text' || String(child.value ?? '').trim() !== ''
  )
  return (
    children.length === 1 &&
    children.every(
      (child): child is Image | ImageReference => child.type === 'image' || child.type === 'imageReference'
    )
  )
}

function located(message: string, node: Node): LocatedDirectiveIssue {
  return {
    message,
    line: node.position?.start.line,
    column: node.position?.start.column,
    node
  }
}

function unexpectedAttributes(
  node: Directives,
  allowed: ReadonlySet<string>,
  issues: LocatedDirectiveIssue[]
) {
  for (const name of Object.keys(node.attributes ?? {})) {
    if (!allowed.has(name)) {
      issues.push(located(`The ${node.name} directive does not support the \`${name}\` attribute`, node))
    }
  }
}

/** Validate the public Canofold directive grammar and explicitly declared plugin directives. */
export function collectRichDirectiveIssues(
  tree: Root,
  pluginDirectiveNames: ReadonlySet<string> = new Set()
): LocatedDirectiveIssue[] {
  const issues: LocatedDirectiveIssue[] = []

  visit(tree, (candidate, _index, parent) => {
    if (
      candidate.type !== 'containerDirective' &&
      candidate.type !== 'leafDirective' &&
      candidate.type !== 'textDirective'
    ) {
      return
    }
    const node = candidate as Directives
    const known =
      CONTAINER_DIRECTIVES.has(node.name) || TEXT_DIRECTIVES.has(node.name) || MEDIA_DIRECTIVES.has(node.name)
    if (!known) {
      if (!pluginDirectiveNames.has(node.name)) {
        issues.push(located(`Unknown Markdown directive \`${node.name}\``, node))
      }
      return
    }

    if (CONTAINER_DIRECTIVES.has(node.name) && node.type !== 'containerDirective') {
      issues.push(located(`The ${node.name} directive must use container syntax`, node))
      return
    }
    if (TEXT_DIRECTIVES.has(node.name) && node.type !== 'textDirective') {
      issues.push(located(`The ${node.name} directive must use inline syntax`, node))
      return
    }
    if (MEDIA_DIRECTIVES.has(node.name) && node.type !== 'leafDirective') {
      issues.push(located(`The ${node.name} directive must use leaf syntax`, node))
      return
    }

    if (node.type === 'textDirective' && node.name === 'badge') {
      unexpectedAttributes(node, new Set(['tone']), issues)
      if (!directiveLabel(node)) issues.push(located('Badge directives require a label', node))
      const tone = directiveAttribute(node, 'tone').toLowerCase()
      if (tone && !BADGE_TONES.has(tone)) {
        issues.push(located('Badge `tone` must be one of `accent`, `success`, `warning`, or `danger`', node))
      }
      return
    }

    if (node.type === 'textDirective' && node.name === 'copy') {
      unexpectedAttributes(node, new Set(), issues)
      if (!directiveLabel(node)) issues.push(located('Copy directives require text to copy', node))
      return
    }

    if (node.type === 'leafDirective') {
      const label = directiveLabel(node)
      const readableName = node.name === 'embed' ? 'Embed' : node.name === 'video' ? 'Video' : 'Audio'
      const allowed =
        node.name === 'video'
          ? new Set(['src', 'poster', 'preload'])
          : node.name === 'audio'
            ? new Set(['src', 'preload'])
            : new Set(['src', 'loading', 'sandbox', 'allow', 'referrerpolicy', 'allowfullscreen'])
      unexpectedAttributes(node, allowed, issues)
      if (!directiveAttribute(node, 'src')) {
        issues.push(located(`${readableName} directives require a \`src\` attribute`, node))
      } else if (!hasSafeProtocol(directiveAttribute(node, 'src'), SAFE_MEDIA_PROTOCOLS)) {
        issues.push(located(`${readableName} \`src\` must use a relative, HTTP, or HTTPS URL`, node))
      }
      if (!label) {
        issues.push(located(`${readableName} directives require an accessible label`, node))
      }
      const preload = directiveAttribute(node, 'preload')
      if (preload && !['none', 'metadata', 'auto'].includes(preload)) {
        issues.push(located('Media `preload` must be `none`, `metadata`, or `auto`', node))
      }
      const loading = directiveAttribute(node, 'loading')
      if (node.name === 'embed' && loading && !['lazy', 'eager'].includes(loading)) {
        issues.push(located('Embed `loading` must be `lazy` or `eager`', node))
      }
      const poster = directiveAttribute(node, 'poster')
      if (poster && !hasSafeProtocol(poster, SAFE_MEDIA_PROTOCOLS)) {
        issues.push(located('Video `poster` must use a relative, HTTP, or HTTPS URL', node))
      }
      return
    }

    if (node.type !== 'containerDirective') return

    if (node.name === 'gallery') {
      unexpectedAttributes(node, new Set(), issues)
      for (const child of body(node)) {
        if (!isImageParagraph(child)) {
          issues.push(located('Each Gallery item must contain exactly one Markdown image', child))
        }
      }
      if (!body(node).length) issues.push(located('Gallery directives require at least one image', node))
      return
    }

    if (node.name === 'card') {
      unexpectedAttributes(node, new Set(['href']), issues)
      if (!directiveAttribute(node, 'href')) {
        issues.push(located('Card directives require an `href` attribute', node))
      } else if (!hasSafeProtocol(directiveAttribute(node, 'href'), SAFE_LINK_PROTOCOLS)) {
        issues.push(located('Card `href` uses an unsupported URL protocol', node))
      }
      if (!isDirective(parent, 'card-grid')) {
        issues.push(located('Card directives must be direct children of a card-grid directive', node))
      }
      return
    }

    if (node.name === 'api') {
      unexpectedAttributes(node, new Set(['method', 'path']), issues)
      if (!directiveAttribute(node, 'method')) {
        issues.push(located('API directives require a `method` attribute', node))
      }
      if (!directiveAttribute(node, 'path')) {
        issues.push(located('API directives require a `path` attribute', node))
      }
      return
    }

    if (node.name === 'response') {
      unexpectedAttributes(node, new Set(), issues)
      if (!directiveLabel(node)) issues.push(located('Response directives require a status label', node))
      if (!isDirective(parent, 'api')) {
        issues.push(located('Response directives must be direct children of an API directive', node))
      }
      return
    }

    if (node.name === 'details') {
      unexpectedAttributes(node, new Set(['open']), issues)
      if (!directiveLabel(node)) {
        issues.push(located('Details directives require a summary label', node))
      }
      if (!body(node).length) issues.push(located('Details directives require body content', node))
      return
    }

    if (node.name === 'tabs' || node.name === 'steps' || node.name === 'card-grid') {
      unexpectedAttributes(node, new Set(), issues)
      const expected = node.name === 'tabs' ? 'tab' : node.name === 'steps' ? 'step' : 'card'
      const children = body(node)
      if (!children.length) {
        issues.push(located(`${node.name} directives require at least one ${expected} child`, node))
      }
      for (const child of children) {
        if (!isDirective(child, expected)) {
          issues.push(located(`${node.name} directives can contain only ${expected} directives`, child))
        }
      }
      return
    }

    if (node.name === 'code-group') {
      unexpectedAttributes(node, new Set(), issues)
      const children = body(node)
      if (!children.length)
        issues.push(located('code-group directives require at least one code block', node))
      for (const child of children) {
        if (child.type !== 'code') {
          issues.push(located('code-group directives can contain only fenced code blocks', child))
        }
      }
      return
    }

    if (node.name === 'tab') {
      unexpectedAttributes(node, new Set(), issues)
      if (!isDirective(parent, 'tabs')) {
        issues.push(located('Tab directives must be direct children of a tabs directive', node))
      }
      return
    }

    if (node.name === 'step') {
      unexpectedAttributes(node, new Set(), issues)
      if (!isDirective(parent, 'steps')) {
        issues.push(located('Step directives must be direct children of a steps directive', node))
      }
      return
    }

    if (node.name === 'file-tree') {
      unexpectedAttributes(node, new Set(), issues)
      const children = body(node)
      if (children.length !== 1 || children[0]?.type !== 'list') {
        issues.push(located('File-tree directives must contain exactly one Markdown list', node))
      }
      return
    }

    unexpectedAttributes(node, new Set(), issues)
  })

  return issues
}

/** Stop rendering malformed core directives before a transform can discard content. */
export const remarkValidateRichDirectives = (pluginDirectiveNames: ReadonlySet<string> = new Set()) => {
  return (tree: Root, file: { fail(message: string, node?: Node): never }) => {
    const issue = collectRichDirectiveIssues(tree, pluginDirectiveNames)[0]
    if (issue) file.fail(issue.message, issue.node)
  }
}
