import { expect, test, type Page } from '@playwright/test'

function captureRuntimeErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    const location = message.location().url
    const expectedSandboxBlock =
      (text.includes("document's frame is sandboxed") && text.includes("'allow-scripts'")) ||
      (text.includes("from origin 'null'") && text.includes('blocked by CORS policy')) ||
      (text === 'Failed to load resource: net::ERR_FAILED' && location.endsWith('/assets/canofold-search.js'))
    if (!expectedSandboxBlock) errors.push(text)
  })
  return () => expect(errors, '页面不应产生运行时错误').toEqual([])
}

async function scrollRatio(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const node = element as HTMLElement
    const max = node.scrollHeight - node.clientHeight
    return max > 0 ? node.scrollTop / max : 0
  })
}

test('首页、搜索和站内导航可以正常使用', async ({ page }) => {
  const expectNoRuntimeErrors = captureRuntimeErrors(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Canofold' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await expect(page.locator('main > article.cf-content')).toHaveCount(0)

  await page.getByRole('button', { name: '搜索文档' }).click()
  const search = page.getByRole('searchbox', { name: '搜索文档' })
  await expect(search).toBeFocused()
  await search.fill('Playground')
  const result = page.locator('[data-canofold-search-results] a').filter({ hasText: 'Playground' }).first()
  await expect(result).toBeVisible()
  await result.click()

  await expect(page).toHaveURL(/\/markdown\/playground\/(?:#.*)?$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Markdown Playground' })).toBeVisible()
  expectNoRuntimeErrors()
})

test('指南侧栏在站内导航后保留位置且不整页刷新', async ({ page }) => {
  test.setTimeout(30_000)
  const expectNoRuntimeErrors = captureRuntimeErrors(page)
  await page.setViewportSize({ width: 1280, height: 560 })
  await page.goto('/guide/introduction/what-is-canofold/')

  const sidebar = page.locator('[data-canofold-sidebar]')
  const target = sidebar.locator('a[href="/guide/delivery/deployment/"]')
  await expect(sidebar).toBeVisible()
  await expect(target).toBeAttached()
  await target.scrollIntoViewIfNeeded()

  const before = await sidebar.evaluate((element) => ({
    scrollTop: element.scrollTop,
    top: element.getBoundingClientRect().top,
    width: element.getBoundingClientRect().width,
    scrollable: element.scrollHeight > element.clientHeight
  }))
  expect(before.scrollable).toBe(true)
  await page.evaluate(() => {
    ;(window as Window & { __canofoldE2EMarker?: string }).__canofoldE2EMarker = 'preserved'
  })

  await target.click()
  await expect(page).toHaveURL(/\/guide\/delivery\/deployment\/$/)
  await expect(page.getByRole('heading', { level: 1, name: '部署' })).toBeVisible()

  await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeCloseTo(before.scrollTop, 0)
  const after = await sidebar.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    width: element.getBoundingClientRect().width
  }))
  expect(after.top).toBeCloseTo(before.top, 0)
  expect(after.width).toBeCloseTo(before.width, 0)
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __canofoldE2EMarker?: string }).__canofoldE2EMarker))
    .toBe('preserved')
  expectNoRuntimeErrors()
})

test('点击后续目录标题时阅读进度不会倒退', async ({ page }) => {
  const expectNoRuntimeErrors = captureRuntimeErrors(page)
  await page.goto('/markdown/syntax/')

  const outline = page.locator('[data-canofold-outline]')
  await outline.getByRole('link', { name: '代码块标题与标注' }).click()
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#代码块标题与标注')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

  const initial = await page.locator('[data-canofold-progress]').evaluate((element) => {
    const read = () => Number(element.getAttribute('style')?.match(/scaleX\(([^)]+)\)/)?.[1] ?? 0)
    const initialValue = read()
    const values = [initialValue]
    const observer = new MutationObserver(() => values.push(read()))
    observer.observe(element, { attributes: true, attributeFilter: ['style'] })
    ;(window as Window & { __canofoldProgressValues?: number[] }).__canofoldProgressValues = values
    return initialValue
  })

  await outline.getByRole('link', { name: '文件树', exact: true }).click()
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#文件树')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const values = (window as Window & { __canofoldProgressValues?: number[] }).__canofoldProgressValues
        return values?.at(-1) ?? 0
      })
    )
    .toBeGreaterThan(initial)

  const values = await page.evaluate(
    () => (window as Window & { __canofoldProgressValues?: number[] }).__canofoldProgressValues ?? []
  )
  expect(values.length).toBeGreaterThan(1)
  expect(Math.min(...values)).toBeGreaterThanOrEqual(initial - 0.01)
  await expect(outline.getByRole('link', { name: '文件树', exact: true })).toHaveAttribute(
    'data-active',
    'true'
  )
  expectNoRuntimeErrors()
})

test('Playground 实时预览不闪空白并保持双向滚动同步', async ({ page }) => {
  test.setTimeout(30_000)
  const expectNoRuntimeErrors = captureRuntimeErrors(page)
  await page.goto('/markdown/playground/')

  const playground = page.locator('[data-canofold-playground]')
  const source = page.locator('[data-canofold-playground-source]')
  const preview = page.locator('[data-canofold-playground-preview]')
  await expect(playground).toHaveAttribute('data-canofold-playground-ready', '')
  await expect(preview.locator('.katex').first()).toBeVisible()
  await expect(preview.locator('.cf-diagram-preview svg').first()).toBeVisible()

  await preview.evaluate((element) => {
    const state = { blank: false }
    const check = () => {
      if (!(element.textContent ?? '').trim() || element.getBoundingClientRect().height === 0) {
        state.blank = true
      }
    }
    new MutationObserver(check).observe(element, { childList: true, subtree: true })
    ;(window as Window & { __canofoldPreviewState?: { blank: boolean } }).__canofoldPreviewState = state
  })

  const original = await source.inputValue()
  await source.fill(`${original}\n\n## E2E 实时预览\n\n预览内容已更新。`)
  await expect(preview.getByRole('heading', { level: 2, name: 'E2E 实时预览' })).toBeVisible()
  await expect(page.locator('[data-canofold-playground-error]')).toHaveCount(0)
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __canofoldPreviewState?: { blank: boolean } }).__canofoldPreviewState?.blank ??
        true
    )
  ).toBe(false)

  await source.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.6
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => scrollRatio(page, '[data-canofold-playground-preview]')).toBeCloseTo(0.6, 1)

  await preview.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.25
    element.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => scrollRatio(page, '[data-canofold-playground-source]')).toBeCloseTo(0.25, 1)

  const resizer = page.locator('[data-canofold-playground-resizer]')
  await resizer.focus()
  await resizer.press('ArrowRight')
  await expect(resizer).toHaveAttribute('aria-valuenow', '47')
  expectNoRuntimeErrors()
})

test.describe('移动端 Playground', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('右上角图标在源码和预览之间切换', async ({ page }) => {
    const expectNoRuntimeErrors = captureRuntimeErrors(page)
    await page.goto('/markdown/playground/')

    const playground = page.locator('[data-canofold-playground]')
    const toggle = page.locator('[data-canofold-playground-toggle]')
    const source = page.locator('[data-canofold-playground-source]')
    const preview = page.locator('[data-canofold-playground-preview]')
    await expect(toggle).toBeVisible()
    await expect(playground).toHaveAttribute('data-view', 'preview')
    await expect(preview).toBeVisible()

    await toggle.click()
    await expect(playground).toHaveAttribute('data-view', 'source')
    await expect(source).toBeVisible()

    await toggle.click()
    await expect(playground).toHaveAttribute('data-view', 'preview')
    await expect(preview).toBeVisible()
    expectNoRuntimeErrors()
  })
})

test.describe('移动端导航', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('GitHub 入口保持在视口内且页面不横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto('/guide/introduction/what-is-canofold/')

    const github = page.getByRole('link', { name: 'GitHub 仓库' })
    await expect(github).toBeVisible()

    const box = await github.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  })
})
