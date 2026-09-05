import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createMockConfig,
  createMockGraph,
  createMockPage,
  trackedMkdtemp as mkdtemp
} from '../../test/fixtures'
import { resolveRedirects, writeRedirects } from './redirects'

const graph = () => createMockGraph({ pages: [createMockPage({ routePath: '/guide/' })] })

describe('redirects', () => {
  it('writes redirect pages and a deployment manifest', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-redirects-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    const config = createMockConfig({ redirects: { '/old': '/guide/' } })
    await writeRedirects(cwd, config, graph())

    expect(await readFile(join(cwd, '.canofold/dist/old/index.html'), 'utf8')).toContain(
      'location.replace("/guide/")'
    )
    expect(JSON.parse(await readFile(join(cwd, '.canofold/dist/redirects.json'), 'utf8'))).toEqual({
      '/old/': '/guide/'
    })
  })

  it('writes an absolute canonical URL when siteUrl is configured', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-redirects-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    const config = createMockConfig({
      basePath: '/docs/',
      siteUrl: 'https://example.com/',
      redirects: { '/old/': '/guide/' }
    })

    await writeRedirects(cwd, config, graph())

    const html = await readFile(join(cwd, '.canofold/dist/old/index.html'), 'utf8')
    expect(html).toContain('<link rel="canonical" href="https://example.com/docs/guide/">')
    expect(html).toContain('location.replace("/docs/guide/")')
  })

  it('rejects missing targets, generated-page collisions, and redirect chains', () => {
    expect(() =>
      resolveRedirects(createMockConfig({ redirects: { '/old/': '/missing/' } }), graph())
    ).toThrow('not a published generated page')
    expect(() =>
      resolveRedirects(createMockConfig({ redirects: { '/guide/': '/guide/' } }), graph())
    ).toThrow('collides with a generated page')
    expect(() =>
      resolveRedirects(createMockConfig({ redirects: { '/old/': '/older/', '/older/': '/guide/' } }), graph())
    ).toThrow('Redirect chains are not allowed')
    expect(() =>
      resolveRedirects(
        createMockConfig({ redirects: { '/old page/': '/guide/', '/old%20page/': '/guide/' } }),
        graph()
      )
    ).toThrow('Redirect sources must be unique')
  })

  it('keeps redirect targets inside the inline script', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-redirects-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    const target = '/guide/</script><script>alert(1)</script>/'
    const unsafeGraph = {
      ...graph(),
      pages: [createMockPage({ routePath: target })]
    }
    await writeRedirects(cwd, createMockConfig({ redirects: { '/old/': target } }), unsafeGraph)

    const html = await readFile(join(cwd, '.canofold/dist/old/index.html'), 'utf8')
    expect(html).not.toContain('location.replace("/guide/</script>')
    expect(html).toContain('location.replace("/guide/%3C/script%3E')
  })
})
