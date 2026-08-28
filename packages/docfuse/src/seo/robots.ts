import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocfuseConfig } from '../config/types'
import { resolveOutputRoot } from '../utils/paths'
import { siteUrlFor } from './urls'

export async function writeRobots(cwd: string, config: DocfuseConfig) {
  const sitemapUrl = siteUrlFor(config, '/sitemap.xml')
  await writeFile(
    join(resolveOutputRoot(cwd, config.outputDir), 'robots.txt'),
    `User-agent: *\nAllow: /\n${sitemapUrl ? `Sitemap: ${sitemapUrl}\n` : ''}`
  )
}
