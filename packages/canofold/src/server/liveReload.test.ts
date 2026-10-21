// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { injectLiveReloadScript } from './staticServer'

afterEach(() => {
  vi.unstubAllGlobals()
  delete window.__canofoldApplyPageDocument
  document.body.replaceChildren()
})

function client() {
  const listeners = new Map<string, (event: { data: string }) => Promise<void>>()
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener(name: string, listener: (event: { data: string }) => Promise<void>) {
        listeners.set(name, listener)
      }
    }
  )
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true
    }
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false
    }
  })
  const html = injectLiveReloadScript('<body></body>')
  window.eval(
    html.slice(
      html.indexOf('<script type="module">') + '<script type="module">'.length,
      html.indexOf('</script>')
    )
  )
  return () =>
    listeners.get('update')!({
      data: JSON.stringify({ protocol: 1, type: 'update', mode: 'page', routes: ['/'] })
    })
}

describe('Live page revisions', () => {
  it('does not apply a delayed older response over a newer document', async () => {
    let finish!: (response: Response) => void
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce(
        new Response('<body>Newest</body>', { headers: { 'content-type': 'text/html' } })
      )
    vi.stubGlobal('fetch', fetcher)
    const apply = vi.fn(async (_next: Document) => true)
    window.__canofoldApplyPageDocument = apply
    const update = client()
    const first = update()
    await update()
    finish(new Response('<body>Outdated</body>', { headers: { 'content-type': 'text/html' } }))
    await first
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0]![0].body.textContent).toBe('Newest')
  })

  it('retains the current view on render failure and clears the error when corrected', async () => {
    document.body.innerHTML = '<main>Last good page</main>'
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('<pre>Widget failed &lt;script&gt;</pre>', {
            status: 500,
            headers: { 'content-type': 'text/html' }
          })
        )
        .mockResolvedValueOnce(
          new Response('<body>Recovered</body>', { headers: { 'content-type': 'text/html' } })
        )
    )
    const apply = vi.fn(async (_next: Document) => true)
    window.__canofoldApplyPageDocument = apply
    const update = client()
    await update()
    expect(document.querySelector('main')?.textContent).toBe('Last good page')
    expect(document.querySelector('dialog')?.textContent).toContain('HTTP 500')
    expect(document.querySelector('dialog')?.textContent).toContain('Widget failed <script>')
    expect(document.querySelector('dialog script')).toBeNull()
    expect(apply).not.toHaveBeenCalled()
    await update()
    expect(document.querySelector('dialog')).toBeNull()
    expect(apply).toHaveBeenCalledOnce()
  })
})
