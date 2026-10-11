import type { MarkdownUrlTransform } from '@canofold/markdown'
import type { DocPage } from '../content/types'
import { markdownExtensionKey, resolveRelativeSourcePath, sourceLinkCandidates } from '../content/routes'
import { posix } from 'node:path'

function withBasePath(value: string, basePath: string) {
  if (basePath === '/') return value
  const base = basePath.replace(/\/$/, '')
  const path = value.split(/[?#]/, 1)[0]!
  return path === base || path.startsWith(`${base}/`) || !value.startsWith('/') || value.startsWith('//')
    ? value
    : `${base}${value}`
}

/** Resolve author file links against the graph, not the relocated HTML directory. */
export function createPageUrlTransform(
  basePath: string,
  pages: readonly Pick<DocPage, 'relativePath' | 'version' | 'routePath'>[]
) {
  const key = (version: string, path: string) => `${version}\0${markdownExtensionKey(path)}`
  const routes = new Map(pages.map((page) => [key(page.version, page.relativePath), page.routePath]))
  return (
      page: Pick<DocPage, 'relativePath' | 'version' | 'outputPath'>,
      assetOutputPaths: ReadonlySet<string> = new Set()
    ): MarkdownUrlTransform =>
    (value, property) => {
      if (property === 'href' && !/^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i.test(value)) {
        const suffixIndex = value.search(/[?#]/)
        const path = suffixIndex === -1 ? value : value.slice(0, suffixIndex)
        const suffix = suffixIndex === -1 ? '' : value.slice(suffixIndex)
        let resolved: string
        try {
          const outputPath = posix.resolve('/', resolveRelativeSourcePath(page.outputPath, path)).slice(1)
          // A real download wins over a same-named Markdown candidate, as in check.
          if (assetOutputPaths.has(outputPath)) return value
          resolved = resolveRelativeSourcePath(page.relativePath, path)
        } catch {
          // The checker reports malformed references; rendering must not invent a route.
          return value
        }
        for (const candidate of sourceLinkCandidates(resolved)) {
          const route = routes.get(key(page.version, candidate))
          if (route) return withBasePath(route + suffix, basePath)
        }
      }
      return withBasePath(value, basePath)
    }
}
