import type { MarkdownRenderer } from '@canofold/markdown/server'
import type { BuildResult } from '../commands/build'
import { renderPage } from '../render/renderSite'
import { collectPageAssets } from '../render/siteAssets'
import { createPageUrlTransform } from '../render/transformUrls'
import { promisify } from 'node:util'
import { gzip, gunzip } from 'node:zlib'

const compress = promisify(gzip)
const decompress = promisify(gunzip)

/** Development pages use the static renderer, but only for requested routes.
 * Keep compressed HTML, bounded independently of compiler caches. Requests
 * share pending work; a completed older revision cannot publish over a rebuild.
 */
export function createDevPages(
  cwd: string,
  renderer: MarkdownRenderer,
  current: () => BuildResult | undefined
) {
  let revision: BuildResult | undefined
  let bytes = 0
  interface Entry {
    pending?: Promise<string | undefined>
    value?: Buffer
    bytes: number
  }
  const entries = new Map<string, Entry>()
  const active = new Set<Promise<unknown>>()
  let closed = false
  const resolveDocument = async (pathname: string): Promise<string | undefined> => {
    if (closed) return undefined
    const state = current()
    if (revision !== state) {
      revision = state
      const unchanged = new Set<string>()
      if (state && !state.renderHtml && (state.mode === 'incremental' || state.mode === 'cached')) {
        const changed = new Set(state.changedPages)
        state.graph.pages.forEach((page) => {
          if (!changed.has(page.sourceRelativePath)) unchanged.add(page.outputPath)
        })
      }
      for (const [path, entry] of entries) {
        if (entry.bytes === 0 || !unchanged.has(path)) {
          entries.delete(path)
          bytes -= entry.bytes
        } else if (entry.pending) {
          // Retain unchanged bytes, not the previous revision's active decode.
          // Otherwise that task can redirect back into its own pending promise.
          entries.set(path, { value: entry.value, bytes: entry.bytes })
        }
      }
    }
    if (!state || state.renderHtml) return undefined
    const route = decodeURIComponent(pathname)
    const page = state.graph.pages.find(
      (page) =>
        route === decodeURIComponent(page.routePath) ||
        route === `${decodeURIComponent(page.routePath)}index.html` ||
        (page.routePath !== '/' && route === decodeURIComponent(page.routePath).replace(/\/$/, ''))
    )
    if (!page) return undefined
    const existing = entries.get(page.outputPath)
    if (existing) {
      entries.delete(page.outputPath)
      entries.set(page.outputPath, existing)
      if (existing.pending) return existing.pending
    }
    const entry: Entry = existing ?? { bytes: 0 }
    const render = () =>
      collectPageAssets(cwd, [page]).then(async (assets) => {
        if (closed) return undefined
        if (current() !== state) return resolveDocument(pathname)
        const urlTransform = createPageUrlTransform(state.config.basePath, state.graph.pages)(
          page,
          new Set(assets.map((asset) => asset.outputPath))
        )
        const rendered = await renderPage({
          cwd,
          config: state.config,
          graph: state.graph,
          page,
          renderer,
          demoManifest: state.demoManifest,
          urlTransform
        })
        return rendered.html
      })
    const pending = (entry.value ? decompress(entry.value).then((value) => value.toString('utf8')) : render())
      .then(async (html) => {
        if (closed || html === undefined) return undefined
        if (current() !== state) return resolveDocument(pathname)
        if (!entry.value && entries.get(page.outputPath) === entry) {
          const value = await compress(html, { level: 1 })
          if (closed) return undefined
          if (current() !== state) return resolveDocument(pathname)
          if (entries.get(page.outputPath) !== entry) return html
          entry.value = value
          entry.bytes = value.byteLength
          bytes += value.byteLength
          while (entries.size > 32 || bytes > 8 * 1024 * 1024) {
            const oldest = entries.keys().next().value
            if (oldest === undefined) break
            bytes -= entries.get(oldest)!.bytes
            entries.delete(oldest)
          }
        }
        return html
      })
      .catch((error) => {
        if (!closed && current() !== state) return resolveDocument(pathname)
        if (entries.get(page.outputPath) === entry) {
          bytes -= entry.bytes
          entries.delete(page.outputPath)
        }
        throw error
      })
      .finally(() => {
        entry.pending = undefined
        active.delete(pending)
      })
    entry.pending = pending
    entries.set(page.outputPath, entry)
    active.add(pending)
    return pending
  }
  return {
    resolveDocument,
    async close() {
      closed = true
      entries.clear()
      bytes = 0
      await Promise.allSettled(active)
    }
  }
}
