import type { DocfuseConfig } from '../config/types'

function normalizeSiteUrl(siteUrl?: string) {
  return siteUrl?.replace(/\/+$/, '')
}

export function siteUrlFor(config: DocfuseConfig, path: string) {
  const siteUrl = normalizeSiteUrl(config.siteUrl)
  if (!siteUrl) return undefined
  return `${siteUrl}${publicPathFor(config, path)}`
}

export function publicPathFor(config: DocfuseConfig, path: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path)) return path
  const absolutePath = path.startsWith('/') ? path : `/${path}`
  if (config.basePath === '/') return absolutePath
  return `${config.basePath.replace(/\/$/, '')}${absolutePath}`
}
