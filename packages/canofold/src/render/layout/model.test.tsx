import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMockConfig, createMockGraph, createMockPage } from '../../../test/fixtures'
import { createLayoutModel } from './model'
import { LayoutDocument } from './LayoutDocument'
import { Layout } from '../Layout'
import { LayoutHeader } from './LayoutHeader'

const assets = { behaviors: [], math: false, pluginClients: [], pluginStyles: [] }
const modelFor = (
  config = createMockConfig(),
  page = createMockPage(),
  graph = createMockGraph({ pages: [page], ...(config.versions.length ? { versions: config.versions } : {}) })
) => createLayoutModel({ config, page, graph, home: false, assets, rawSource: page.transformedSource })

afterEach(() => vi.unstubAllEnvs())

describe('site-owned layout metadata', () => {
  it.each(['current', 'stable'])('honors a single document version label for %s', (id) => {
    const config = createMockConfig({
      versions: [{ id, label: 'Acme 2.4', docsDir: 'docs', base: '/' }]
    })
    expect(modelFor(config, createMockPage({ version: id })).versionLabel).toBe('Acme 2.4')
  })

  it('does not offer implicit document versions in the header', () => {
    expect(modelFor().versionOptions).toEqual([])
  })

  it('renders no version control for an unversioned site', () => {
    const html = renderToStaticMarkup(<LayoutHeader model={modelFor()} />)
    expect(html).not.toContain('cf-version-badge')
    expect(html).not.toContain('cf-version-menu')
  })

  it('renders a single configured label without an empty dropdown', () => {
    const config = createMockConfig({
      versions: [{ id: 'current', label: 'Acme 2.4', docsDir: 'docs', base: '/' }]
    })
    const html = renderToStaticMarkup(<LayoutHeader model={modelFor(config)} />)
    expect(html).toContain('<span class="cf-version-badge">Acme 2.4</span>')
    expect(html).not.toContain('cf-version-menu')
  })

  it('preserves labels and archived state across multiple document versions', () => {
    const config = createMockConfig({
      versions: [
        { id: 'stable', label: 'Acme 2.4', docsDir: 'docs', base: '/' },
        { id: 'old', label: 'Acme 1.0', docsDir: 'old', base: '/v1/', status: 'archived' }
      ]
    })
    const model = modelFor(config, createMockPage({ version: 'old', versionBase: '/v1/' }))
    expect(model.versionLabel).toBe('Acme 1.0')
    expect(model.versionArchived).toBe(true)
    const html = renderToStaticMarkup(<LayoutHeader model={model} />)
    expect(html).toContain('cf-version-menu')
    expect(html).toContain('cf-version-icon"')
    expect(html).toContain('aria-label="文档版本"')
    expect(html).toContain('title="Acme 1.0"')
    expect(html).toContain('href="/v1/"')
  })

  it.each(['guide/literal%20name.md', 'guide/组件 & name.md', 'en/guide/plain.md'])(
    'encodes each original source path segment once in the edit URL: %s',
    (relativePath) => {
      const model = modelFor(
        createMockConfig({ editUrl: 'https://example.com/repo/edit/main/docs/' }),
        createMockPage({ relativePath })
      )
      const encoded = relativePath.split('/').map(encodeURIComponent).join('/')
      expect(model.editHref).toBe(`https://example.com/repo/edit/main/docs/${encoded}`)
      expect(new URL(model.editHref!).pathname.split('/').slice(5).map(decodeURIComponent).join('/')).toBe(
        relativePath
      )
    }
  )

  it('does not offer a current-source edit link for an archived page', () => {
    expect(
      modelFor(
        createMockConfig({ editUrl: 'https://example.com/repo/edit/main/docs' }),
        createMockPage({ version: 'old' })
      ).editHref
    ).toBeUndefined()
  })

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Shanghai'])(
    'renders content dates in UTC independently of the build timezone %s',
    (timezone) => {
      vi.stubEnv('TZ', timezone)
      for (const [lastUpdated, expected] of [
        ['2026-10-17T00:00:00.000Z', 'Oct 17, 2026'],
        ['2026-10-17T23:30:00-07:00', 'Oct 18, 2026'],
        ['2026-10-17T01:00:00+08:00', 'Oct 16, 2026']
      ]) {
        const model = modelFor(undefined, createMockPage({ locale: 'en', lastUpdated }))
        expect(renderToStaticMarkup(<LayoutDocument model={model}>Body</LayoutDocument>)).toContain(expected)
      }
    }
  )

  it('omits the update date when no reliable date exists', () => {
    const model = modelFor(undefined, createMockPage({ locale: 'en', lastUpdated: '' }))
    const html = renderToStaticMarkup(<LayoutDocument model={model}>Body</LayoutDocument>)
    expect(html).not.toContain(model.labels.updated)
  })

  it.each(['draft', 'published'] as const)('manages the robots head entry for %s pages', (status) => {
    const page = createMockPage({ status })
    const html = renderToStaticMarkup(
      <Layout
        config={createMockConfig()}
        page={page}
        graph={createMockGraph({ pages: [page] })}
        markdownAssets={assets}
        rawSource={page.transformedSource}
      >
        Body
      </Layout>
    )
    if (status === 'draft') {
      expect(html).toMatch(/<meta name="robots" content="noindex, nofollow" data-canofold-page-head=""\/>/)
    } else expect(html).not.toContain('name="robots"')
  })

  it('manages Demo entry CSS through the existing page head lifecycle', () => {
    const page = createMockPage()
    const html = renderToStaticMarkup(
      <Layout
        config={createMockConfig()}
        page={page}
        graph={createMockGraph({ pages: [page] })}
        markdownAssets={assets}
        rawSource={page.transformedSource}
        demoStyleUrls={['/assets/provider.css']}
      >
        Body
      </Layout>
    )
    expect(html).toMatch(/<link rel="stylesheet" href="\/assets\/provider.css" data-canofold-page-head=""\/>/)
  })
})
