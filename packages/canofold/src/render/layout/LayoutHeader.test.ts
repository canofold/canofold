import { describe, expect, it } from 'vitest'
import { navItemIsActive } from './LayoutHeader'
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

  it('does not keep the root navigation item active on every page', () => {
    const home = { title: 'Home', routePath: '/' }
    expect(navItemIsActive(model('/'), home)).toBe(true)
    expect(navItemIsActive(model('/guide/'), home)).toBe(false)
  })
})
