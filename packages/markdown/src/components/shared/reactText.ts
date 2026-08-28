import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'

export function reactText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(reactText).join('')
  if (isValidElement(value)) return reactText((value.props as { children?: ReactNode }).children)
  if (!value || typeof value !== 'object') return ''
  if ((value as { type?: string }).type === 'text') {
    return String((value as { value?: unknown }).value ?? '')
  }
  return reactText((value as { children?: unknown }).children)
}

export type MarkdownReactElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

export function elementChildren(value: ReactNode): MarkdownReactElement[] {
  return Children.toArray(value).filter((child): child is MarkdownReactElement => isValidElement(child))
}

/** Resolve names from raw elements and the mapped Markdown element functions. */
export function elementTag(element: MarkdownReactElement): string {
  if (typeof element.type === 'string') return element.type
  const component = element.type as { displayName?: string }
  const displayName = component.displayName
  return displayName?.startsWith('Markdown') ? displayName.slice('Markdown'.length).toLowerCase() : ''
}

export function readProp(props: object, ...names: string[]) {
  const values = props as Record<string, unknown>
  for (const name of names) {
    if (values[name] !== undefined && values[name] !== null) return values[name]
  }
  return undefined
}

export function stringProp(props: object, ...names: string[]) {
  const value = readProp(props, ...names)
  return typeof value === 'string' ? value : ''
}

const MARKDOWN_DOM_PROP_NAMES = new Set([
  'id',
  'className',
  'style',
  'title',
  'role',
  'tabIndex',
  'hidden',
  'dir',
  'lang',
  'slot',
  'draggable',
  'contentEditable',
  'spellCheck',
  'open',
  'href',
  'target',
  'rel',
  'download',
  'src',
  'alt',
  'width',
  'height',
  'loading',
  'srcSet',
  'sizes',
  'type',
  'name',
  'value',
  'checked',
  'disabled',
  'controls',
  'loop',
  'muted',
  'autoPlay',
  'poster',
  'preload',
  'colSpan',
  'rowSpan',
  'scope',
  'dateTime'
])

export function markdownDomProps(props: object, omitted: readonly string[] = []) {
  const omittedKeys = new Set(['node', ...omitted])
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key]) =>
        !omittedKeys.has(key) &&
        !key.startsWith('dataDf') &&
        !key.startsWith('data-df-') &&
        (MARKDOWN_DOM_PROP_NAMES.has(key) ||
          key.startsWith('aria-') ||
          (key.startsWith('data-') && !key.startsWith('data-df-')) ||
          /^on[A-Z]/.test(key))
    )
  )
}

export function mergeMarkdownClasses(base: string, value: unknown) {
  const extra = typeof value === 'string' ? value.split(/\s+/) : []
  return [...new Set([...base.split(/\s+/), ...extra].filter(Boolean))].join(' ')
}
