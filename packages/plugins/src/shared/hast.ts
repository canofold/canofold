import type { Element, ElementContent } from 'hast'

export function element(
  tagName: string,
  properties: Element['properties'] = {},
  children: ElementContent[] = []
): Element {
  return { type: 'element', tagName, properties, children }
}
