import { expect, test, type Locator, type Page } from '@playwright/test'

async function insideViewport(locator: Locator, width: number) {
  await expect(locator).toBeVisible()
  const bounds = await locator.boundingBox()
  expect(bounds).not.toBeNull()
  assertBounds(bounds!, width)
}

function assertBounds(
  bounds: { x: number; y: number; width: number; height: number },
  width: number,
  height = 844
) {
  expect(bounds.width).toBeGreaterThan(0)
  expect(bounds.height).toBeGreaterThan(0)
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(height)
}

async function checkHeader(page: Page, width: number) {
  const controls = page.locator(
    '.cf-brand, .cf-search-trigger, .cf-sidebar-toggle, .cf-header-link, .cf-header-right > a, .cf-header-right > details > summary'
  )
  const measuredControls = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect()
      const visibility = getComputedStyle(element).visibility
      const visible =
        bounds.width > 0 && bounds.height > 0 && visibility !== 'hidden' && visibility !== 'collapse'
      const expectedVisible = element.matches('.cf-header-link')
        ? innerWidth > 840
        : element.matches('.cf-sidebar-toggle, .cf-primary-menu > summary')
          ? innerWidth <= 840
          : true
      const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      return {
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        visible,
        expectedVisible,
        children: element.matches('.cf-search-trigger')
          ? Array.from(element.children)
              .filter((child) => getComputedStyle(child).display !== 'none')
              .map((child) => {
                const rect = child.getBoundingClientRect()
                return { x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height }
              })
          : [],
        hittable: target !== null && element.contains(target)
      }
    })
  )
  expect(measuredControls.length).toBeGreaterThan(0)
  for (const control of measuredControls) {
    expect(control.visible).toBe(control.expectedVisible)
    if (!control.visible) continue
    assertBounds(control.bounds, width)
    for (const child of control.children) assertBounds(child, control.bounds.width, control.bounds.height)
    expect(control.hittable).toBe(true)
  }
  for (const menu of await page.locator('.cf-header-right > details').all()) {
    const trigger = menu.locator('summary')
    if (!(await trigger.isVisible())) continue
    await trigger.press('Enter')
    await expect(menu).toHaveAttribute('open', '')
    await insideViewport(menu.locator('.cf-menu-list'), width)
    const links = menu.locator('.cf-menu-item')
    await expect(links.first()).toBeVisible()
    await links.last().scrollIntoViewIfNeeded()
    await expect(links.last()).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(menu).not.toHaveAttribute('open')
  }
  await page.locator('.cf-version-menu > summary').click()
  await page.locator('.cf-lang > summary').click()
  await expect(page.locator('.cf-version-menu')).not.toHaveAttribute('open')
  await expect(page.locator('.cf-lang')).toHaveAttribute('open', '')
  await page.locator('main p').last().click()
  await expect(page.locator('.cf-lang')).not.toHaveAttribute('open')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
}

for (const width of [320, 390, 559, 560, 561, 839, 840, 841, 1179, 1180, 1181, 1280]) {
  for (const locale of ['', '/en']) {
    for (const kind of ['home', 'document']) {
      for (const scrolled of [false, true]) {
        for (const firstAppearance of [0, 5, 10]) {
          test(`${width}px ${locale ? 'en' : 'zh'} ${kind} ${scrolled ? 'scrolled' : 'top'} appearances ${firstAppearance + 1}–${firstAppearance + 5}`, async ({
            page
          }) => {
            const errors: string[] = []
            page.on('pageerror', (error) => errors.push(error.message))
            page.on('console', (message) => {
              if (message.type() === 'error') errors.push(message.text())
            })
            await page.setViewportSize({ width, height: 844 })
            const route = `${locale}/${kind === 'home' ? '' : 'guide/'}`
            await page.goto(route)
            const options = page.locator('[data-canofold-theme-option]')
            await expect(options).toHaveCount(15)
            for (const option of (await options.all()).slice(firstAppearance, firstAppearance + 5)) {
              const value = await option.getAttribute('data-canofold-theme-option')
              await test.step(`appearance ${value}`, async () => {
                await page.locator('.cf-theme-menu > summary').click()
                await option.click()
                const [theme, appearance] = value!.split(':')
                await expect(page.locator('html')).toHaveAttribute('data-cf-theme', theme!)
                await expect(page.locator('html')).toHaveAttribute('data-cf-theme-appearance', appearance!)
                await page.evaluate((y) => window.scrollTo(0, y), scrolled ? 240 : 0)
                if (scrolled) {
                  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
                } else {
                  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
                }
                const header = page.locator('.cf-header')
                if (kind === 'home') {
                  await expect(header).toHaveCSS('--cf-header-surface-mix', scrolled ? '68%' : '0%')
                  await expect(header).toHaveCSS('box-shadow', 'none')
                } else {
                  await expect(header).not.toHaveClass(/cf-header-home/)
                }
                await checkHeader(page, width)
                await page.locator('.cf-search-trigger').click()
                const dialog = page.getByRole('dialog')
                await insideViewport(dialog, width)
                await expect(page.getByRole('searchbox')).toBeFocused()
                await page.keyboard.press('Escape')
                await expect(dialog).toBeHidden()
                const sidebar = page.locator('.cf-sidebar-toggle')
                if (await sidebar.isVisible()) {
                  await sidebar.click()
                  await expect(sidebar).toHaveAttribute('aria-expanded', 'true')
                  await page.keyboard.press('Escape')
                  await expect(sidebar).toHaveAttribute('aria-expanded', 'false')
                }
              })
            }
            if (scrolled || firstAppearance !== 10) {
              expect(errors).toEqual([])
              return
            }
            // Exercise actual destinations, not just whether popup boxes are visible.
            await page.locator('.cf-version-menu > summary').click()
            await page.locator(`.cf-version-menu a[href="/archive${route}"]`).click()
            await expect(page).toHaveURL(`/archive${route}`)
            await expect(page.locator('.cf-version-banner')).toBeVisible()
            await checkHeader(page, width)
            await page.locator('.cf-lang > summary').click()
            const otherRoute = `/archive${locale ? '' : '/en'}/${kind === 'home' ? '' : 'guide/'}`
            await page.locator(`.cf-lang a[href="${otherRoute}"]`).click()
            await expect(page).toHaveURL(otherRoute)
            await page.locator('.cf-version-menu > summary').click()
            const currentRoute = otherRoute.replace('/archive', '')
            await page.locator(`.cf-version-menu a[href="${currentRoute}"]`).click()
            await expect(page).toHaveURL(currentRoute)
            await expect(page.locator('.cf-version-banner')).toHaveCount(0)
            await page.locator('.cf-search-trigger').click()
            await page.getByRole('searchbox').fill('boundary')
            const result = page.locator('[data-canofold-search-results] a').first()
            await expect(result).toBeVisible()
            const resultHref = await result.getAttribute('href')
            await result.click()
            await expect(page).toHaveURL(resultHref!)
            await expect(page.getByRole('dialog')).toBeHidden()
            const link = page
              .locator(
                `.cf-header-nav a[href="${locale ? '' : '/en'}/reference/"], .cf-primary-menu a[href="${locale ? '' : '/en'}/reference/"], .cf-sidebar-primary-nav a[href="${locale ? '' : '/en'}/reference/"]`
              )
              .filter({ visible: true })
            if (width <= 840) {
              const sidebar = page.locator('.cf-sidebar-toggle')
              if (await sidebar.isVisible()) await sidebar.click()
              else await page.locator('.cf-primary-menu > summary').click()
            }
            await link.click()
            await expect(page).toHaveURL(`${locale ? '' : '/en'}/reference/`)
            expect(errors).toEqual([])
          })
        }
      }
    }
  }
}
