import type { Element, Root, RootContent } from 'hast'
import { hastToHtml } from 'shiki/core'
import { jsx, jsxs } from 'react/jsx-runtime'
import { inertHighlightedCode } from '../compiler/inertCode.js'

/** Serialize inert highlight tokens once, not one React component per token.
 * Only text/span leaves are eligible. Arbitrary plugin HTML still goes through
 * the normal component/URL handling, as does every host component override.
 */
export function staticTokens(document: Root) {
  const htmlByNode = new WeakMap<Element, string>()
  let retainedBytes = 0
  const compact = <T extends Root | RootContent>(node: T): T => {
    if (!('children' in node)) return node
    const code = inertHighlightedCode(node)
    if (code) {
      const copy: Element = { ...code, children: [] }
      const html = hastToHtml(code.children)
      retainedBytes += html.length * 2
      htmlByNode.set(copy, html)
      return { ...node, children: [copy] } as T
    }
    const children = node.children.map((child) => compact(child))
    return children.some((child, index) => child !== node.children[index])
      ? ({ ...node, children } as T)
      : node
  }
  const factory =
    (create: typeof jsx): typeof jsx =>
    (type, props, key) => {
      const node = (props as { node?: Element } | null)?.node
      const html = node ? htmlByNode.get(node) : undefined
      if (html === undefined) return create(type, props, key)
      const { children: _children, ...rest } = props as Record<string, unknown>
      return create(type, { ...rest, dangerouslySetInnerHTML: { __html: html } }, key)
    }
  return { document: compact(document), runtime: { jsx: factory(jsx), jsxs: factory(jsxs), retainedBytes } }
}
