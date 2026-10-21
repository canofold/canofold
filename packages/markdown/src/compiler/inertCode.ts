import type { Element, Nodes } from 'hast'

function onlyStyling(node: Element) {
  return Object.keys(node.properties).every(
    (key) => key === 'className' || key === 'class' || key === 'style'
  )
}

function isToken(node: Nodes): boolean {
  return (
    node.type === 'text' ||
    (node.type === 'element' && node.tagName === 'span' && onlyStyling(node) && node.children.every(isToken))
  )
}

/** Only generated text/style tokens may bypass semantic traversal. */
export function inertHighlightedCode(node: Nodes): Element | undefined {
  if (node.type !== 'element' || node.tagName !== 'pre' || node.children.length !== 1) return
  if (
    !String(node.properties.className ?? node.properties.class ?? '')
      .split(/[\s,]+/)
      .includes('shiki')
  )
    return
  const code = node.children[0]
  return code?.type === 'element' &&
    code.tagName === 'code' &&
    onlyStyling(code) &&
    code.children.length > 0 &&
    code.children.every(isToken)
    ? code
    : undefined
}
