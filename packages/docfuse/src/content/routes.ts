import { posix } from 'node:path'

function normalizeRoutePath(path: string) {
  return path.replace(/\\/g, '/')
}

/**
 * Return the path inside one locale, supporting both the preferred root layout
 * for the default locale and the legacy explicit locale directory.
 */
export function localeRelativePathFor(path: string, locale: string) {
  const normalized = normalizeRoutePath(path)
  const segments = normalized.split('/')
  return segments[0] === locale ? segments.slice(1).join('/') : normalized
}

export function assertRoutePath(path: string) {
  if (!path.startsWith('/') || (path !== '/' && path.includes('//')) || /[\\?#\u0000-\u001f]/.test(path)) {
    throw new Error(`Invalid route path: "${path}"`)
  }
  for (const segment of path.split('/')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      throw new Error(`Invalid route path: "${path}"`)
    }
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      /[\u0000-\u001f]/.test(decoded)
    ) {
      throw new Error(`Invalid route path: "${path}"`)
    }
  }
  return path
}

export function canonicalRoutePath(path: string) {
  assertRoutePath(path)
  return path
    .split('/')
    .map((segment) => (segment ? encodeURIComponent(decodeURIComponent(segment).normalize('NFC')) : ''))
    .join('/')
}

function normalizedBase(base: string) {
  const canonical = canonicalRoutePath(base)
  if (canonical === '/') return '/'
  return `/${canonical.replace(/^\/+|\/+$/g, '')}/`
}

function pageSegments(path: string) {
  const normalized = normalizeRoutePath(path)
  if (normalized.startsWith('/') || /[?#\u0000-\u001f]/.test(normalized)) {
    throw new Error(`Invalid page path: "${path}"`)
  }
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '.' || segment === '..' || segment === '')) {
    throw new Error(`Invalid page path: "${path}"`)
  }
  const withoutExt = stripMarkdownExtension(normalized)
  const route = /^index$/i.test(withoutExt) ? '' : withoutExt.replace(/\/index$/i, '')
  return route ? route.split('/') : []
}

function pageRoute(path: string) {
  return pageSegments(path)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function pageOutputPath(path: string) {
  return pageSegments(path).join('/')
}

export function localeRootPath(locale: string, defaultLocale: string, base = '/') {
  const root = normalizedBase(base)
  return locale === defaultLocale ? root : `${root}${locale}/`
}

function localeOutputPrefix(locale: string, defaultLocale: string, base = '/') {
  const basePrefix = normalizedBase(base).replace(/^\/|\/$/g, '')
  return [basePrefix, locale === defaultLocale ? '' : locale].filter(Boolean).join('/')
}

export function routePathFor(locale: string, defaultLocale: string, pagePath: string, base = '/') {
  const route = pageRoute(pagePath)
  return route
    ? `${localeRootPath(locale, defaultLocale, base)}${route}/`
    : localeRootPath(locale, defaultLocale, base)
}

export function htmlOutputPathFor(locale: string, defaultLocale: string, pagePath: string, base = '/') {
  const route = pageOutputPath(pagePath)
  const prefix = localeOutputPrefix(locale, defaultLocale, base)
  if (!route) {
    return posix.join(prefix, 'index.html')
  }
  return posix.join(prefix, route, 'index.html')
}

export function markdownOutputPathFor(locale: string, defaultLocale: string, pagePath: string, base = '/') {
  const route = pageOutputPath(pagePath)
  const prefix = localeOutputPrefix(locale, defaultLocale, base)
  if (!route) {
    return posix.join(prefix, 'index.md')
  }
  return posix.join(prefix, route, 'index.md')
}

export function routeOutputPathFor(routePath: string) {
  const normalized = assertRoutePath(routePath).replace(/^\/+|\/+$/g, '')
  if (!normalized) return 'index.html'
  return posix.join(...normalized.split('/').map((segment) => decodeURIComponent(segment)), 'index.html')
}
import { stripMarkdownExtension } from './fileKinds'
