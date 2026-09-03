import type { MarkdownUrlTransform } from '@canofold/markdown'

function withBasePath(value: string, basePath: string) {
  if (basePath === '/') return value
  const base = basePath.replace(/\/$/, '')
  return value === base || value.startsWith(`${base}/`) || !value.startsWith('/') || value.startsWith('//')
    ? value
    : `${base}${value}`
}

export function createBasePathUrlTransform(basePath: string): MarkdownUrlTransform {
  return (value) => withBasePath(value, basePath)
}
