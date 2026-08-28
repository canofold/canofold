import { defineMarkdownPlugin, type MarkdownPlugin } from '@docfuse/markdown'
import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'
import { hostnameOf, isInternalHost } from '../shared/urls'

const PLUGIN_VERSION = '1'

export interface ExternalLinksOptions {
  newTab?: boolean
  rel?: readonly string[]
  internalHosts?: readonly string[]
}

export function externalLinks(options: ExternalLinksOptions = {}): MarkdownPlugin {
  const newTab = options.newTab !== false
  const rel = [...(options.rel ?? ['noopener', 'noreferrer'])]
  const internalHosts = (options.internalHosts ?? []).map((host) => host.toLowerCase())

  return defineMarkdownPlugin({
    name: 'external-links',
    version: PLUGIN_VERSION,
    cacheKey: { newTab, rel, internalHosts },
    browserCompiler: {
      module: '@docfuse/plugins/external-links',
      exportName: 'externalLinks',
      options: { newTab, rel, internalHosts }
    },
    rehypePlugins: [
      () => (tree: Root) => {
        visit(tree, 'element', (node: Element) => {
          if (node.tagName !== 'a') return
          const href = node.properties.href
          if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return
          const host = hostnameOf(href)
          if (!host || isInternalHost(host, internalHosts)) return
          if (newTab) node.properties.target = '_blank'
          if (rel.length > 0) node.properties.rel = [...rel]
        })
      }
    ]
  })
}
