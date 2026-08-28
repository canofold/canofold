// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyMarkdownText } from './copyText'

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
  vi.restoreAllMocks()
})

describe('copyMarkdownText', () => {
  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    await expect(copyMarkdownText('pnpm test')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('pnpm test')
  })

  it('falls back to a temporary textarea when Clipboard API access is rejected', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) }
    })
    const copy = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: copy })

    await expect(copyMarkdownText('fallback')).resolves.toBe(true)
    expect(copy).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('returns false when neither browser copy mechanism is available', async () => {
    await expect(copyMarkdownText('unavailable')).resolves.toBe(false)
  })
})
