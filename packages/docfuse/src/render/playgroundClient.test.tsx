// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountPlaygrounds } from './playgroundClient'

type PlaygroundRuntime = typeof window & {
  __docfuseBootstrapMarkdown?: () => Promise<void>
  __docfuseEnhanceMarkdown?: (root: ParentNode) => Promise<() => void>
  __docfuseMarkdownReady?: Promise<void>
}

function renderPlayground(source = '# First', previewHtml = '<article data-old-preview>First</article>') {
  document.body.innerHTML = `
    <div
      data-docfuse-playground
      data-docfuse-playground-labels="{}"
      data-docfuse-playground-preview-label="Preview"
    >
      <section class="df-playground-source">
        <textarea data-docfuse-playground-source>${source}</textarea>
      </section>
      <section class="df-playground-preview">
        <div data-docfuse-playground-preview>${previewHtml}</div>
      </section>
    </div>`
  mountPlaygrounds({ basePath: '/', markdown: {} })
  return {
    source: document.querySelector<HTMLTextAreaElement>('[data-docfuse-playground-source]')!,
    preview: document.querySelector<HTMLElement>('[data-docfuse-playground-preview]')!
  }
}

afterEach(() => {
  const runtime = window as PlaygroundRuntime
  delete runtime.__docfuseBootstrapMarkdown
  delete runtime.__docfuseEnhanceMarkdown
  delete runtime.__docfuseMarkdownReady
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

describe('playground client', () => {
  it('keeps the active preview visible until the next plugin enhancement is ready', async () => {
    let finishInitialEnhancement: (() => void) | undefined
    let finishEnhancement: (() => void) | undefined
    const enhance = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          finishEnhancement = () => resolve(() => undefined)
        })
    )
    const bootstrap = vi.fn(async () => undefined)
    const runtime = window as PlaygroundRuntime
    runtime.__docfuseMarkdownReady = new Promise<void>((resolve) => {
      finishInitialEnhancement = resolve
    })
    runtime.__docfuseEnhanceMarkdown = enhance
    runtime.__docfuseBootstrapMarkdown = bootstrap
    const { source, preview } = renderPlayground()

    source.value = '# Second'
    source.dispatchEvent(new Event('input', { bubbles: true }))

    await new Promise((resolve) => window.setTimeout(resolve, 180))
    expect(enhance).not.toHaveBeenCalled()
    expect(preview.querySelector('[data-old-preview]')?.textContent).toBe('First')

    finishInitialEnhancement?.()
    await vi.waitFor(() => expect(enhance).toHaveBeenCalledOnce())
    expect(preview.querySelector('[data-old-preview]')?.textContent).toBe('First')
    expect(preview.querySelector<HTMLElement>('.df-playground-live-preview')?.hidden).toBe(true)

    finishEnhancement?.()
    await vi.waitFor(() => expect(preview.querySelector('h1')?.textContent).toBe('Second'))
    expect(preview.querySelector('[data-old-preview]')).toBeNull()
    expect(bootstrap).not.toHaveBeenCalled()
  })

  it('synchronizes the source and preview by proportional scroll progress', async () => {
    const { source, preview } = renderPlayground()
    Object.defineProperties(source, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1000 }
    })
    Object.defineProperties(preview, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 2000 }
    })

    source.scrollTop = 400
    source.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => expect(preview.scrollTop).toBe(800))
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    preview.scrollTop = 1200
    preview.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => expect(source.scrollTop).toBe(600))
  })

  it('restores preview scroll before the replacement can paint', async () => {
    const runtime = window as PlaygroundRuntime
    runtime.__docfuseMarkdownReady = Promise.resolve()
    runtime.__docfuseEnhanceMarkdown = vi.fn(async () => () => undefined)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    const { source, preview } = renderPlayground()
    Object.defineProperties(source, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1000 }
    })
    Object.defineProperties(preview, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 2000 }
    })
    source.scrollTop = 400

    source.value = '# Second'
    source.dispatchEvent(new Event('input', { bubbles: true }))

    await vi.waitFor(() => expect(preview.querySelector('h1')?.textContent).toBe('Second'))
    expect(preview.scrollTop).toBe(800)
    expect(source.scrollTop).toBe(400)
  })

  it('keeps footnote navigation inside the preview without moving the source', () => {
    const { source, preview } = renderPlayground(
      '# Footnote',
      '<article data-df-root="markdown"><a href="#footnote" data-footnote-ref>1</a><div id="footnote">Note</div></article>'
    )
    const target = preview.querySelector<HTMLElement>('#footnote')!
    Object.defineProperties(source, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1000 }
    })
    Object.defineProperties(preview, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 2000 }
    })
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect)
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect)
    source.scrollTop = 100
    preview.scrollTop = 200

    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    preview.querySelector<HTMLElement>('[data-footnote-ref]')!.dispatchEvent(click)
    preview.dispatchEvent(new Event('scroll'))

    expect(click.defaultPrevented).toBe(true)
    expect(preview.scrollTop).toBe(600)
    expect(source.scrollTop).toBe(100)
    expect(window.location.hash).toBe('#footnote')
  })

  it('replaces an active live preview without leaving the previous enhancement mounted', async () => {
    const firstDispose = vi.fn()
    const secondDispose = vi.fn()
    const enhance = vi
      .fn<() => Promise<() => void>>()
      .mockResolvedValueOnce(firstDispose)
      .mockResolvedValueOnce(secondDispose)
    const runtime = window as PlaygroundRuntime
    runtime.__docfuseMarkdownReady = Promise.resolve()
    runtime.__docfuseEnhanceMarkdown = enhance
    const { source, preview } = renderPlayground()

    source.value = '# Second'
    source.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(preview.querySelector('h1')?.textContent).toBe('Second'))

    source.value = '# Third'
    source.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(preview.querySelector('h1')?.textContent).toBe('Third'))

    expect(firstDispose).toHaveBeenCalledOnce()
    expect(secondDispose).not.toHaveBeenCalled()
    expect(preview.querySelectorAll('.df-playground-live-preview')).toHaveLength(1)
  })

  it('keeps the current preview when enhancement of a staged update fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const runtime = window as PlaygroundRuntime
    runtime.__docfuseMarkdownReady = Promise.resolve()
    runtime.__docfuseEnhanceMarkdown = vi.fn(async () => {
      throw new Error('plugin failed')
    })
    const { source, preview } = renderPlayground()

    source.value = '# Broken update'
    source.dispatchEvent(new Event('input', { bubbles: true }))

    await vi.waitFor(() =>
      expect(errorLog).toHaveBeenCalledWith(
        '[docfuse] Playground preview enhancement failed:',
        expect.objectContaining({ message: 'plugin failed' })
      )
    )
    expect(preview.querySelector('[data-old-preview]')?.textContent).toBe('First')
    expect(preview.querySelector('.df-playground-live-preview')).toBeNull()
  })

  it('keeps the current preview and discards the stage when directive validation fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const runtime = window as PlaygroundRuntime
    runtime.__docfuseMarkdownReady = Promise.resolve()
    runtime.__docfuseEnhanceMarkdown = vi.fn(async () => () => undefined)
    const { source, preview } = renderPlayground()

    source.value = ':::gallery[Preview]\nVisible prose\n:::'
    source.dispatchEvent(new Event('input', { bubbles: true }))

    await vi.waitFor(() =>
      expect(errorLog).toHaveBeenCalledWith(
        '[docfuse] Playground preview render failed:',
        expect.objectContaining({ message: 'Each Gallery item must contain exactly one Markdown image' })
      )
    )
    expect(preview.querySelector('[data-old-preview]')?.textContent).toBe('First')
    expect(preview.querySelector('.df-playground-live-preview')).toBeNull()
  })

  it('inserts two spaces for Tab and schedules a preview update', async () => {
    const runtime = window as PlaygroundRuntime
    runtime.__docfuseMarkdownReady = Promise.resolve()
    runtime.__docfuseEnhanceMarkdown = vi.fn(async () => () => undefined)
    const { source, preview } = renderPlayground('# Title')
    source.setSelectionRange(0, 0)

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    source.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(source.value).toBe('  # Title')
    expect(source.selectionStart).toBe(2)
    await vi.waitFor(() => expect(preview.querySelector('h1')?.textContent).toBe('Title'))
  })

  it('does not mount the same playground twice', () => {
    const runtime = window as PlaygroundRuntime
    runtime.__docfuseMarkdownReady = Promise.resolve()
    runtime.__docfuseEnhanceMarkdown = vi.fn(async () => () => undefined)
    const { source } = renderPlayground('# Title')

    mountPlaygrounds({ basePath: '/', markdown: {} })
    source.value = '# Updated'
    source.dispatchEvent(new Event('input', { bubbles: true }))

    expect(
      document.querySelector('[data-docfuse-playground]')?.hasAttribute('data-docfuse-playground-ready')
    ).toBe(true)
  })
})
