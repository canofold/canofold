import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { DocfuseConfig } from '../config/types'
import { resolveOutputPath, resolveOutputRoot } from '../utils/paths'
import { publicPathFor, siteUrlFor } from '../seo/urls'
import { escapeHtml } from '../utils/html'
import { canonicalRoutePath, routeOutputPathFor } from './routes'
import type { ContentGraph } from './types'

function normalizeRedirectRoute(route: string) {
  const normalized = route === '/' ? '/' : `${route.replace(/\/+$/, '')}/`
  return canonicalRoutePath(normalized)
}

export function resolveRedirects(config: DocfuseConfig, graph: ContentGraph) {
  const pageRoutes = new Set(graph.pages.map((page) => normalizeRedirectRoute(page.routePath)))
  const redirects = Object.entries(config.redirects).map(
    ([source, target]) => [normalizeRedirectRoute(source), normalizeRedirectRoute(target)] as const
  )
  const sourceRoutes = new Set(redirects.map(([source]) => source))

  for (const [source, target] of redirects) {
    if (source === '/') throw new Error('Redirect source must not replace the site root')
    if (pageRoutes.has(source)) throw new Error(`Redirect source collides with a generated page: "${source}"`)
    if (sourceRoutes.has(target)) {
      throw new Error(`Redirect chains are not allowed: "${source}" points to redirect "${target}"`)
    }
    if (!pageRoutes.has(target)) {
      throw new Error(`Redirect target is not a published generated page: "${target}"`)
    }
  }
  if (sourceRoutes.size !== redirects.length) {
    throw new Error('Redirect sources must be unique after route normalization')
  }
  return redirects
}

export async function writeRedirects(cwd: string, config: DocfuseConfig, graph: ContentGraph) {
  const redirects = resolveRedirects(config, graph)
  if (redirects.length === 0) return
  const outputRoot = resolveOutputRoot(cwd, config.outputDir)

  for (const [source, target] of redirects) {
    const outputPath = resolveOutputPath(outputRoot, routeOutputPathFor(source), 'redirect route')
    const publicTarget = publicPathFor(config, target)
    const safeTarget = escapeHtml(publicTarget)
    const safeCanonicalTarget = escapeHtml(siteUrlFor(config, target) ?? publicTarget)
    const scriptTarget = JSON.stringify(publicTarget).replace(/</g, '\\u003c')
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${safeCanonicalTarget}"><meta http-equiv="refresh" content="0;url=${safeTarget}"><script>location.replace(${scriptTarget})</script></head><body><a href="${safeTarget}">Redirecting to ${safeTarget}</a></body></html>`
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html)
  }

  await writeFile(join(outputRoot, 'redirects.json'), JSON.stringify(Object.fromEntries(redirects), null, 2))
}
