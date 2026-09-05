import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CanofoldConfig } from '../config/types'
import { resolveOutputRoot } from '../utils/paths'
import { siteUrlFor } from './urls'

export async function writeRobots(cwd: string, config: CanofoldConfig) {
  const sitemapUrl = siteUrlFor(config, '/sitemap.xml')
  await writeFile(
    join(resolveOutputRoot(cwd, config.outputDir), 'robots.txt'),
    `User-agent: *\nAllow: /\n${sitemapUrl ? `Sitemap: ${sitemapUrl}\n` : ''}`
  )
}
