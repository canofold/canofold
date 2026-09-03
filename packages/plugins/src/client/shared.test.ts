// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhanceDiagrams } from './shared'

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('diagram client lifecycle', () => {
  it('does not report the enhancement ready until asynchronous diagrams finish rendering', async () => {
    document.body.innerHTML = '<figure data-cf-plugin-diagram="mermaid"></figure>'
    let finishRender: (() => void) | undefined
    const enhancement = enhanceDiagrams(
      document,
      'mermaid',
      () =>
        new Promise<void>((resolve) => {
          finishRender = resolve
        })
    )
    let ready = false
    void enhancement.ready.then(() => {
      ready = true
    })

    await Promise.resolve()
    expect(ready).toBe(false)

    finishRender?.()
    await enhancement.ready
    expect(ready).toBe(true)
    enhancement()
  })

  it('removes listeners and allows a disposed figure to be enhanced again', () => {
    document.body.innerHTML = `
      <figure data-cf-plugin-diagram="plantuml" data-cf-source="A -&gt; B">
        <button data-cf-diagram-action="source" aria-label="Show source"></button>
        <div class="cf-diagram-preview"></div>
        <pre class="cf-diagram-source" hidden></pre>
      </figure>`
    const figure = document.querySelector<HTMLElement>('figure')!
    const button = document.querySelector<HTMLButtonElement>('button')!
    const source = document.querySelector<HTMLElement>('.cf-diagram-source')!
    const preview = document.querySelector<HTMLElement>('.cf-diagram-preview')!

    const dispose = enhanceDiagrams(document, 'plantuml')
    button.click()
    expect(source.hidden).toBe(false)
    expect(preview.hidden).toBe(true)

    dispose()
    expect(source.hidden).toBe(true)
    expect(preview.hidden).toBe(false)
    button.click()
    expect(source.hidden).toBe(true)
    expect(figure.dataset.dfEnhanced).toBeUndefined()

    const nextDispose = enhanceDiagrams(document, 'plantuml')
    button.click()
    expect(source.hidden).toBe(false)
    nextDispose()
  })

  it('restores inline diagram zoom controls and their lifecycle state', () => {
    document.body.innerHTML = `
      <figure data-cf-plugin-diagram="mermaid">
        <button data-cf-diagram-action="source" aria-label="Show source"></button>
        <div class="cf-diagram-preview"></div>
        <pre class="cf-diagram-source" hidden></pre>
        <div class="cf-diagram-zoom-controls">
          <button data-cf-diagram-action="zoom-out">out</button>
          <button data-cf-diagram-action="zoom-reset">reset</button>
          <button data-cf-diagram-action="zoom-in">in</button>
        </div>
      </figure>`
    const dispose = enhanceDiagrams(document, 'mermaid')
    const preview = document.querySelector<HTMLElement>('.cf-diagram-preview')!
    const controls = document.querySelector<HTMLElement>('.cf-diagram-zoom-controls')!
    const source = document.querySelector<HTMLButtonElement>('[data-cf-diagram-action="source"]')!
    const zoomIn = document.querySelector<HTMLButtonElement>('[data-cf-diagram-action="zoom-in"]')!
    const reset = document.querySelector<HTMLButtonElement>('[data-cf-diagram-action="zoom-reset"]')!

    expect(preview.style.getPropertyValue('--cf-diagram-zoom-width')).toBe('100%')
    expect(reset.disabled).toBe(true)
    zoomIn.click()
    expect(preview.style.getPropertyValue('--cf-diagram-zoom-width')).toBe('125%')
    expect(reset.disabled).toBe(false)
    reset.click()
    expect(preview.style.getPropertyValue('--cf-diagram-zoom-width')).toBe('100%')

    source.click()
    expect(controls.hidden).toBe(true)
    source.click()
    expect(controls.hidden).toBe(false)

    dispose()
    expect(preview.style.getPropertyValue('--cf-diagram-zoom-width')).toBe('')
    expect(preview.dataset.dfScale).toBeUndefined()
    expect(reset.disabled).toBe(false)
  })

  it('captures asynchronous render failures instead of leaking an unhandled rejection', async () => {
    document.body.innerHTML = '<figure data-cf-plugin-diagram="mermaid"></figure>'
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const figure = document.querySelector<HTMLElement>('figure')!

    const dispose = enhanceDiagrams(document, 'mermaid', async () => {
      throw new Error('invalid diagram')
    })
    await Promise.resolve()

    expect(figure.dataset.dfRenderError).toBe('true')
    expect(error).toHaveBeenCalledWith('[canofold] mermaid render failed:', expect.any(Error))
    dispose()
    error.mockRestore()
  })

  it('ignores a render failure that settles after the enhancement is disposed', async () => {
    document.body.innerHTML = '<figure data-cf-plugin-diagram="mermaid"></figure>'
    let rejectRender: ((error: Error) => void) | undefined
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const figure = document.querySelector<HTMLElement>('figure')!
    const dispose = enhanceDiagrams(
      document,
      'mermaid',
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRender = reject
        })
    )

    dispose()
    rejectRender?.(new Error('late failure'))
    await Promise.resolve()
    await Promise.resolve()

    expect(figure.dataset.dfRenderError).toBeUndefined()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('copies diagram source when the async Clipboard API is unavailable', async () => {
    document.body.innerHTML = `
      <figure data-cf-plugin-diagram="plantuml" data-cf-source="A -&gt; B">
        <button data-cf-diagram-action="copy" aria-label="Copy"></button>
      </figure>`
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const copy = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: copy })

    const dispose = enhanceDiagrams(document, 'plantuml')
    document.querySelector<HTMLButtonElement>('button')!.click()

    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith('copy'))
    expect(document.querySelector<HTMLButtonElement>('button')?.dataset.copied).toBe('true')
    dispose()
    expect(document.querySelector<HTMLButtonElement>('button')?.dataset.copied).toBeUndefined()
  })

  it('uses the Clipboard API and restores an action error when disposed', async () => {
    document.body.innerHTML = `
      <figure data-cf-plugin-diagram="plantuml" data-cf-source="A -&gt; B">
        <button data-cf-diagram-action="copy" aria-label="Copy"></button>
      </figure>`
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const dispose = enhanceDiagrams(document, 'plantuml')
    const button = document.querySelector<HTMLButtonElement>('button')!

    button.click()
    await vi.waitFor(() => expect(button.dataset.copied).toBe('true'))
    expect(writeText).toHaveBeenCalledWith('A -> B')
    dispose()
    expect(button.dataset.copied).toBeUndefined()

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const nextDispose = enhanceDiagrams(document, 'plantuml')
    button.click()
    await vi.waitFor(() => expect(button.dataset.dfActionError).toBe('true'))
    expect(error).toHaveBeenCalledWith('[canofold] Diagram action failed:', expect.any(Error))
    nextDispose()
    expect(button.dataset.dfActionError).toBeUndefined()
  })

  it('keeps the latest copy feedback visible when copy is clicked repeatedly', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <figure data-cf-plugin-diagram="plantuml" data-cf-source="A -&gt; B">
        <button data-cf-diagram-action="copy" aria-label="Copy"></button>
      </figure>`
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) }
    })
    const dispose = enhanceDiagrams(document, 'plantuml')
    const button = document.querySelector<HTMLButtonElement>('button')!

    button.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(button.dataset.copied).toBe('true')

    await vi.advanceTimersByTimeAsync(1000)
    button.click()
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(500)
    expect(button.dataset.copied).toBe('true')

    await vi.advanceTimersByTimeAsync(1000)
    expect(button.dataset.copied).toBeUndefined()
    dispose()
  })
})
