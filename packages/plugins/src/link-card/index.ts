import { defineMarkdownPlugin, type MarkdownPlugin } from '@docfuse/markdown'
import type { ElementContent, Root } from 'hast'
import { SKIP, visit } from 'unist-util-visit'
import { element } from '../shared/hast'
import { hostnameOf, isInternalHost } from '../shared/urls'

const PLUGIN_VERSION = '1'

export interface LinkCardOptions {
  internalHosts?: readonly string[]
  includeRelative?: boolean
}

function isExternalHttpLink(href: string, internalHosts: readonly string[], includeRelative: boolean) {
  if (!href) return false
  if (href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:'))
    return includeRelative && href.startsWith('/')
  if (!/^https?:\/\//i.test(href)) return false
  const host = hostnameOf(href)
  return Boolean(host && !isInternalHost(host, internalHosts))
}

function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value
  if ('children' in node) return node.children.map((child) => textOf(child)).join('')
  return ''
}

function displayHost(href: string) {
  try {
    const url = new URL(href)
    return url.hostname + (url.pathname === '/' ? '' : url.pathname)
  } catch {
    return href
  }
}

export function linkCard(options: LinkCardOptions = {}): MarkdownPlugin {
  const internalHosts = (options.internalHosts ?? []).map((host) => host.toLowerCase())
  const includeRelative = options.includeRelative === true

  return defineMarkdownPlugin({
    name: 'link-card',
    version: PLUGIN_VERSION,
    cacheKey: { internalHosts, includeRelative },
    browserCompiler: {
      module: '@docfuse/plugins/link-card',
      exportName: 'linkCard',
      options: { internalHosts, includeRelative }
    },
    rehypePlugins: [
      () => (tree: Root) => {
        visit(tree, 'element', (node, index, parent) => {
          if (node.tagName !== 'p' || !parent || index === undefined) return
          const meaningful = node.children.filter(
            (child) => child.type !== 'text' || child.value.trim() !== ''
          )
          const onlyChild = meaningful[0]
          if (meaningful.length !== 1 || onlyChild?.type !== 'element' || onlyChild.tagName !== 'a') return
          const href = String(onlyChild.properties.href ?? '')
          if (!isExternalHttpLink(href, internalHosts, includeRelative)) return
          if (onlyChild.properties.dataDfElement === 'file-link') return

          const title = textOf(onlyChild).trim() || displayHost(href)
          const meta = displayHost(href)
          parent.children[index] = element(
            'a',
            { ...onlyChild.properties, className: ['df-link-card'], href, dataDfComponent: 'link-card' },
            [
              element('strong', {}, [{ type: 'text', value: title }]),
              ...(meta && meta !== title ? [element('span', {}, [{ type: 'text', value: meta }])] : [])
            ]
          )
          return [SKIP, index]
        })
      }
    ]
  })
}
