import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import type { Components as HastComponents } from 'hast-util-to-jsx-runtime'
import type { Nodes } from 'hast'
import { cloneElement, isValidElement, type ReactNode } from 'react'
import { createMarkdownComponentMap } from '../react/componentMap'
import type { MarkdownIslandRenderOptions } from './options'
import { deserializeMarkdownNode } from '../protocol/serializedNode'

function isHastNode(node: unknown): node is Nodes {
  return Boolean(node && typeof node === 'object' && typeof (node as { type?: unknown }).type === 'string')
}

function renderNode(
  node: Nodes,
  options: MarkdownIslandRenderOptions = {},
  mappedComponents = true
): ReactNode {
  return toJsxRuntime(node, {
    Fragment,
    jsx,
    jsxs,
    components: mappedComponents
      ? (createMarkdownComponentMap(options.classNames, options.slots, options.components) as HastComponents)
      : undefined,
    passNode: true
  })
}

export function readSerializedNode(
  value?: string,
  options: MarkdownIslandRenderOptions = {}
): ReactNode | undefined {
  try {
    const node = deserializeMarkdownNode(value)
    return node ? renderNode(node, options) : undefined
  } catch {
    return undefined
  }
}

export function readSerializedChildren(
  value?: string,
  options: MarkdownIslandRenderOptions = {},
  mappedComponents = true
): ReactNode | undefined {
  try {
    const node = deserializeMarkdownNode(value)
    if (!node || !('children' in node) || !Array.isArray(node.children)) return undefined
    return node.children.filter(isHastNode).map((child: Nodes, index) => {
      const rendered = child.type === 'text' ? child.value : renderNode(child, options, mappedComponents)
      return isValidElement(rendered) && rendered.key === null
        ? cloneElement(rendered, { key: `markdown-node-${index}` })
        : rendered
    })
  } catch {
    return undefined
  }
}
