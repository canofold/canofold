import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CanofoldConfig } from '../config/types'
import type { ContentGraph } from '../content/types'
import { siteUrlFor } from './urls'
import { resolveOutputRoot } from '../utils/paths'

export async function writeSitemap(cwd: string, config: CanofoldConfig, graph: ContentGraph) {
  if (!config.siteUrl) return
  const escapeXml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character
    )
  const urls = graph.pages
    .map((route) => `  <url><loc>${escapeXml(siteUrlFor(config, route.routePath)!)}</loc></url>`)
    .join('\n')
  await writeFile(
    join(resolveOutputRoot(cwd, config.outputDir), 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  )
}
