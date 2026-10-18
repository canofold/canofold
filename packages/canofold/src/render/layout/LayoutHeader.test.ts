import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { LayoutHeader, navItemIsActive } from './LayoutHeader'
import type { LayoutModel } from './model'

describe('navItemIsActive', () => {
  const model = (routePath: string, group = '') => ({ page: { routePath, group } }) as LayoutModel

  it('keeps a flat page within its explicitly assigned primary navigation section', () => {
    const components = { title: 'Components', routePath: '/button/', activePaths: ['/notice/'] }
    expect(navItemIsActive(model('/notice/'), components)).toBe(true)
    expect(navItemIsActive(model('/progress/'), components)).toBe(false)
    expect(navItemIsActive(model('/button/'), components)).toBe(true)
  })

  it('retains directory-based navigation matching', () => {
    expect(navItemIsActive(model('/guide/next/', 'guide'), { title: 'Guide', routePath: '/guide/' })).toBe(
      true
    )
  })

  it('keeps graph-owned sections selected after their first page has been opened', () => {
    const guide = { title: 'Guide', routePath: '/guide/start/', section: 'guide' }
    expect(navItemIsActive(model('/guide/next/', 'guide'), guide)).toBe(true)
    expect(navItemIsActive(model('/reference/next/', 'reference'), guide)).toBe(false)
  })

  it('does not keep the root navigation item active on every page', () => {
    const home = { title: 'Home', routePath: '/' }
    expect(navItemIsActive(model('/'), home)).toBe(true)
    expect(navItemIsActive(model('/guide/'), home)).toBe(false)
  })

  it('does not select sibling configured entries merely because they share a directory', () => {
    const page = model('/guide/writing/', 'guide')
    expect(navItemIsActive(page, { title: 'Writing', routePath: '/guide/writing/' })).toBe(true)
    expect(navItemIsActive(page, { title: 'Deployment', routePath: '/guide/deploy/' })).toBe(false)
    expect(
      navItemIsActive(model('/guide/writing-next/', 'guide'), {
        title: 'Writing',
        routePath: '/guide/writing/'
      })
    ).toBe(false)
  })
})

describe('mobile primary navigation', () => {
  const model = (
    home: boolean,
    hasSidebarItems: boolean,
    navItems = [{ title: 'Skills', routePath: '/skills/' }]
  ) =>
    ({
      config: { title: 'Docs', basePath: '/', themes: [], search: { enabled: false }, branding: {} },
      page: { routePath: '/skills/', locale: 'en' },
      home,
      hasSidebarItems,
      navItems,
      localeRoot: '/',
      versionLabel: 'current',
      versionOptions: [{ id: 'current' }],
      languageOptions: [{ locale: 'en' }],
      labels: { primaryNavigation: 'Primary navigation', openSidebar: 'Open sidebar' }
    }) as unknown as LayoutModel

  it.each([
    [true, true],
    [true, false],
    [false, false]
  ])('provides a menu without a usable sidebar: home=%s sidebar=%s', (home, sidebar) => {
    const html = renderToStaticMarkup(createElement(LayoutHeader, { model: model(home, sidebar) }))
    expect(html).toContain('cf-primary-menu')
    expect(html).toMatch(/<summary[^>]+aria-label="Primary navigation"/)
    expect(html).toMatch(
      /class="cf-menu-item cf-menu-item-active"[^>]+href="\/skills\/"[^>]+aria-current="page"/
    )
  })

  it('retains the existing sidebar entry point on document pages', () => {
    const html = renderToStaticMarkup(createElement(LayoutHeader, { model: model(false, true) }))
    expect(html).not.toContain('cf-primary-menu')
    expect(html).toContain('data-canofold-sidebar-open')
  })

  it('does not render an empty menu', () => {
    expect(
      renderToStaticMarkup(createElement(LayoutHeader, { model: model(true, false, []) }))
    ).not.toContain('cf-primary-menu')
  })
})
