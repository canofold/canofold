import type { ElementContent, Nodes, Properties, RootContent } from 'hast'

type CompactNode =
  ['r', CompactNode[]] | ['e', string, Properties, CompactNode[]] | ['t', string] | ['c', string]

function compact(node: Nodes): CompactNode {
  if (node.type === 'root') return ['r', node.children.map(compact)]
  if (node.type === 'element') return ['e', node.tagName, node.properties, node.children.map(compact)]
  if (node.type === 'comment') return ['c', node.value]
  return ['t', 'value' in node ? String(node.value) : '']
}

function expand(node: CompactNode): Nodes {
  if (node[0] === 'r') return { type: 'root', children: node[1].map(expand) as RootContent[] }
  if (node[0] === 'e') {
    return {
      type: 'element',
      tagName: node[1],
      properties: node[2],
      children: node[3].map(expand) as ElementContent[]
    }
  }
  if (node[0] === 'c') return { type: 'comment', value: node[1] }
  return { type: 'text', value: node[1] }
}

function isCompactNode(value: unknown): value is CompactNode {
  if (!Array.isArray(value)) return false
  if (value[0] === 'r') return value.length === 2 && Array.isArray(value[1]) && value[1].every(isCompactNode)
  if (value[0] === 'e')
    return (
      value.length === 4 &&
      typeof value[1] === 'string' &&
      Boolean(value[2]) &&
      typeof value[2] === 'object' &&
      !Array.isArray(value[2]) &&
      Array.isArray(value[3]) &&
      value[3].every(isCompactNode)
    )
  return (value[0] === 't' || value[0] === 'c') && value.length === 2 && typeof value[1] === 'string'
}

export function serializeMarkdownNode(node: unknown) {
  try {
    if (!node || typeof node !== 'object' || typeof (node as { type?: unknown }).type !== 'string')
      return undefined
    return JSON.stringify(compact(node as Nodes))
  } catch {
    return undefined
  }
}

export function deserializeMarkdownNode(value?: string): Nodes | undefined {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null')
    return isCompactNode(parsed) ? expand(parsed) : undefined
  } catch {
    return undefined
  }
}
