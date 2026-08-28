import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react'

export type MarkdownUrlProperty = 'href' | 'src' | 'poster' | 'srcSet'
export type MarkdownUrlTransform = (value: string, property: MarkdownUrlProperty) => string

const MarkdownUrlTransformContext = createContext<MarkdownUrlTransform | undefined>(undefined)

const SAFE_PROTOCOL = /^(?:https?|ircs?|mailto|tel|xmpp)$/i

/** Keep relative URLs and a small set of non-executable absolute protocols. */
export function sanitizeMarkdownUrl(value: string): string | undefined {
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
    return value
  }

  // Browsers ignore leading C0 controls/spaces and tabs/newlines inside a
  // protocol. Normalize those characters before checking the allowlist.
  const protocol = value.slice(0, colon).replace(/[\u0000-\u0020]/g, '')
  return SAFE_PROTOCOL.test(protocol) ? value : undefined
}

function transformMarkdownUrl(
  value: string,
  property: MarkdownUrlProperty,
  transform?: MarkdownUrlTransform
) {
  return sanitizeMarkdownUrl(transform ? transform(value, property) : value)
}

export function MarkdownUrlTransformProvider({
  transform,
  children
}: {
  transform?: MarkdownUrlTransform
  children: ReactNode
}) {
  const safeTransform = useMemo<MarkdownUrlTransform>(
    () => (value, property) => transformMarkdownUrl(value, property, transform) ?? '',
    [transform]
  )
  return createElement(MarkdownUrlTransformContext.Provider, { value: safeTransform, children })
}

export function useMarkdownUrlTransform() {
  return useContext(MarkdownUrlTransformContext)
}

function srcSetCandidates(value: string) {
  const candidates: Array<{ url: string; descriptor: string }> = []
  let position = 0
  while (position < value.length) {
    while (position < value.length && /[\t\n\f\r ,]/.test(value[position] ?? '')) position += 1
    if (position >= value.length) break

    const urlStart = position
    while (position < value.length && !/[\t\n\f\r ]/.test(value[position] ?? '')) position += 1
    let url = value.slice(urlStart, position)
    let trailingCommas = 0
    while (url.endsWith(',')) {
      url = url.slice(0, -1)
      trailingCommas += 1
    }
    if (trailingCommas > 0) {
      candidates.push({ url, descriptor: '' })
      continue
    }

    while (position < value.length && /[\t\n\f\r ]/.test(value[position] ?? '')) position += 1
    const descriptorStart = position
    while (position < value.length && value[position] !== ',') position += 1
    const descriptor = value.slice(descriptorStart, position).trim()
    if (value[position] === ',') position += 1
    candidates.push({ url, descriptor })
  }
  return candidates
}

export function transformMarkdownSrcSet(value: string, transform?: MarkdownUrlTransform) {
  return srcSetCandidates(value)
    .flatMap(({ url, descriptor }) => {
      const transformed = transformMarkdownUrl(url, 'srcSet', transform)
      return transformed ? [`${transformed}${descriptor ? ` ${descriptor}` : ''}`] : []
    })
    .join(', ')
}

export function transformMarkdownUrlProps(props: Record<string, unknown>, transform?: MarkdownUrlTransform) {
  let result = props
  const mutableResult = () => {
    if (result === props) result = { ...props }
    return result
  }
  for (const property of ['href', 'src', 'poster'] as const) {
    const value = props[property]
    if (typeof value !== 'string') continue
    const transformed = transformMarkdownUrl(value, property, transform)
    if (transformed === undefined) delete mutableResult()[property]
    else if (transformed !== value) mutableResult()[property] = transformed
  }
  for (const property of ['srcSet', 'srcset'] as const) {
    const value = props[property]
    if (typeof value !== 'string') continue
    const transformed = transformMarkdownSrcSet(value, transform)
    if (!transformed) delete mutableResult()[property]
    else if (transformed !== value) mutableResult()[property] = transformed
  }
  return result
}
