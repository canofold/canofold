import { access, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaults'
import {
  createMockConfig,
  createMockGraph,
  createMockPage,
  trackedMkdtemp as mkdtemp
} from '../../test/fixtures'
import { writeRobots } from './robots'
import { writeSitemap } from './sitemap'
import { siteUrlFor } from './urls'

describe('SEO writers', () => {
  it('includes the hosting base path in absolute canonical URLs', () => {
    expect(
      siteUrlFor(createMockConfig({ siteUrl: 'https://docs.example.com', basePath: '/project/' }), '/guide/')
    ).toBe('https://docs.example.com/project/guide/')
  })

  it('uses siteUrl for sitemap and robots output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-seo-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    const config = createMockConfig({ siteUrl: 'https://docs.example.com' })
    const graph = createMockGraph({ pages: [createMockPage({ routePath: '/', outputPath: 'index.html' })] })

    await writeSitemap(cwd, config, graph)
    await writeRobots(cwd, config)

    expect(await readFile(join(cwd, '.canofold/dist/sitemap.xml'), 'utf8')).toContain(
      'https://docs.example.com/'
    )
    expect(await readFile(join(cwd, '.canofold/dist/robots.txt'), 'utf8')).toContain(
      'Sitemap: https://docs.example.com/sitemap.xml'
    )
  })

  it('does not emit invalid relative sitemap URLs when siteUrl is absent', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-seo-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    const graph = createMockGraph({ pages: [createMockPage({ routePath: '/', outputPath: 'index.html' })] })

    await writeSitemap(cwd, defaultConfig, graph)
    await writeRobots(cwd, defaultConfig)

    await expect(access(join(cwd, '.canofold/dist/sitemap.xml'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(cwd, '.canofold/dist/robots.txt'), 'utf8')).not.toContain('Sitemap:')
  })

  it('escapes sitemap XML values', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-seo-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    const config = createMockConfig({ siteUrl: 'https://docs.example.com' })
    const graph = createMockGraph({
      pages: [createMockPage({ routePath: '/guide/<xml>/', outputPath: 'guide/index.html' })]
    })

    await writeSitemap(cwd, config, graph)
    const sitemap = await readFile(join(cwd, '.canofold/dist/sitemap.xml'), 'utf8')
    expect(sitemap).toContain('https://docs.example.com/guide/&lt;xml&gt;/')
  })
})
