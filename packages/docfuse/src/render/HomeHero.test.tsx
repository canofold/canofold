import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaults'
import type { DocPage } from '../content/types'
import { HomeHero } from './HomeHero'

describe('HomeHero', () => {
  it('renders configured landing content with deployment-aware links', () => {
    const page = {
      title: 'Build documentation',
      frontmatter: {
        hero: {
          accent: 'without friction',
          tagline: 'Static, typed, and portable.',
          image: '/banner.png',
          imageAlt: 'Documentation flowing into a static site',
          actions: [
            { text: 'Get started', link: '/guide/', primary: true, icon: 'rocket' },
            { text: 'GitHub', link: 'https://github.com/example/docfuse' }
          ]
        },
        features: [
          {
            image: '/feature/cli.png',
            title: 'Static output',
            details: 'Deploy anywhere.'
          }
        ]
      }
    } as DocPage

    const html = renderToStaticMarkup(
      <HomeHero
        page={page}
        config={{
          ...defaultConfig,
          basePath: '/project/',
          theme: { ...defaultConfig.theme, logo: '/logo.svg', logoDark: '/logo-dark.svg' }
        }}
      />
    )

    expect(html).toContain('<h1 class="df-hero-title">Build documentation</h1>')
    expect(html).not.toContain('src="/project/logo.svg"')
    expect(html).not.toContain('src="/project/logo-dark.svg"')
    expect(html).toContain('without friction')
    expect(html).toContain('href="/project/guide/"')
    expect(html).toContain('href="https://github.com/example/docfuse"')
    expect(html).toContain('Static output')
    expect(html).toContain('Deploy anywhere.')
    expect(html).toContain('class="df-hero df-hero-with-visual"')
    expect(html).toContain('<article class="df-feature">')
    expect(html).not.toContain('df-feature-footer')
    expect(html).toContain('class="lucide lucide-rocket"')
    expect(html).toContain('src="/project/feature/cli.png"')
    expect(html).toContain('width="32" height="32"')
    expect(html).toContain('src="/project/banner.png"')
    expect(html).toContain('alt="Documentation flowing into a static site"')
  })

  it('omits the visual column when the home page has no image', () => {
    const page = {
      locale: 'ja',
      title: 'ドキュメント',
      frontmatter: { hero: {} }
    } as DocPage
    const html = renderToStaticMarkup(<HomeHero page={page} config={defaultConfig} />)

    expect(html).toContain('class="df-hero"')
    expect(html).not.toContain('df-hero-with-visual')
    expect(html).not.toContain('<img')
  })

  it('uses the page title as the single source of truth for the home heading', () => {
    const page = {
      title: 'Documentation',
      frontmatter: { hero: { accent: 'Built once' } }
    } as DocPage
    const html = renderToStaticMarkup(<HomeHero page={page} config={defaultConfig} />)

    expect(html).toContain('<h1 class="df-hero-title">Documentation</h1>')
    expect(html).toContain('<p class="df-hero-accent">Built once</p>')
  })

  it('does not render an empty icon container for text-only features', () => {
    const page = {
      title: 'Documentation',
      frontmatter: {
        features: [{ title: 'Static output', details: 'Deploy anywhere.' }]
      }
    } as DocPage

    const html = renderToStaticMarkup(<HomeHero page={page} config={defaultConfig} />)

    expect(html).toContain('Static output')
    expect(html).not.toContain('df-feature-icon')
  })
})
