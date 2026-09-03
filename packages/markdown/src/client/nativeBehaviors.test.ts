// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhanceMarkdown, type MarkdownEnhancement } from '../client'

let enhancement: MarkdownEnhancement | undefined

afterEach(() => {
  enhancement?.dispose()
  enhancement = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('native Markdown behaviors', () => {
  it('keeps tab keyboard state, focus, and panels synchronized', async () => {
    const root = document.createElement('div')
    root.innerHTML = `<div data-cf-behavior="tabs">
      <div role="tablist">
        <button role="tab" data-cf-tab="one" aria-selected="true" tabindex="0">One</button>
        <button role="tab" data-cf-tab="disabled" aria-selected="false" tabindex="-1" disabled>Disabled</button>
        <button role="tab" data-cf-tab="three" aria-selected="false" tabindex="-1">Three</button>
      </div>
      <div role="tabpanel" data-cf-tab-panel="one">First</div>
      <div role="tabpanel" data-cf-tab-panel="disabled" hidden>Disabled</div>
      <div role="tabpanel" data-cf-tab-panel="three" hidden>Third</div>
    </div>`
    document.body.append(root)
    enhancement = enhanceMarkdown(root, { behaviors: ['tabs'] })
    await enhancement.ready

    const first = root.querySelector<HTMLButtonElement>('[data-cf-tab="one"]')!
    const third = root.querySelector<HTMLButtonElement>('[data-cf-tab="three"]')!
    first.focus()
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))

    expect(document.activeElement).toBe(third)
    expect(third.getAttribute('aria-selected')).toBe('true')
    expect(first.tabIndex).toBe(-1)
    expect(root.querySelector<HTMLElement>('[data-cf-tab-panel="one"]')?.hidden).toBe(true)
    expect(root.querySelector<HTMLElement>('[data-cf-tab-panel="three"]')?.hidden).toBe(false)

    third.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(document.activeElement).toBe(first)

    enhancement.dispose()
    third.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(first)
  })

  it('does not bind native handlers inside a React-owned Markdown root', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const root = document.createElement('div')
    root.innerHTML = `<article data-cf-runtime="react">
      <span data-cf-behavior="copy-snippet" data-cf-value="pnpm test">
        <button data-cf-action="copy-snippet">Copy</button>
      </span>
    </article>`
    document.body.append(root)
    enhancement = enhanceMarkdown(root, { behaviors: ['copy-snippet'] })
    await enhancement.ready

    root.querySelector<HTMLButtonElement>('button')!.click()
    await Promise.resolve()

    expect(writeText).not.toHaveBeenCalled()
  })

  it('synchronizes native disclosure and file-tree accessibility state', async () => {
    const root = document.createElement('div')
    root.innerHTML = `<details data-cf-behavior="details" open>
      <summary>More</summary>
      <div data-cf-slot="content"><a href="#more">Content</a></div>
    </details>
    <div data-cf-behavior="file-tree">
      <div data-cf-file-tree-branch data-cf-state="expanded">
        <button data-cf-action="toggle-file-tree" aria-expanded="true">docs</button>
        <div class="cf-file-tree-children" data-cf-state="expanded"><a href="#file">README</a></div>
      </div>
    </div>`
    document.body.append(root)
    enhancement = enhanceMarkdown(root, { behaviors: ['details', 'file-tree'] })
    await enhancement.ready

    const details = root.querySelector('details')!
    const disclosure = details.querySelector<HTMLElement>('[data-cf-slot="content"]')!
    expect(details.dataset.dfEnhanced).toBe('true')
    expect(disclosure.hasAttribute('inert')).toBe(false)
    details.open = false
    details.dispatchEvent(new Event('toggle'))
    expect(disclosure.hasAttribute('inert')).toBe(true)

    const toggle = root.querySelector<HTMLButtonElement>('[data-cf-action="toggle-file-tree"]')!
    const children = root.querySelector<HTMLElement>('.cf-file-tree-children')!
    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(children.dataset.dfState).toBe('collapsed')
    expect(children.getAttribute('aria-hidden')).toBe('true')
    expect(children.hasAttribute('inert')).toBe(true)
  })

  it('toggles a file-tree branch that uses a plain nested list', async () => {
    const root = document.createElement('div')
    root.innerHTML = `<div data-cf-behavior="file-tree">
      <div data-cf-file-tree-branch data-cf-state="expanded">
        <button data-cf-action="toggle-file-tree" aria-expanded="true">docs</button>
        <ul><li>README.md</li></ul>
      </div>
    </div>`
    document.body.append(root)
    enhancement = enhanceMarkdown(root, { behaviors: ['file-tree'] })
    await enhancement.ready

    const toggle = root.querySelector<HTMLButtonElement>('[data-cf-action="toggle-file-tree"]')!
    const children = root.querySelector<HTMLUListElement>('ul')!
    toggle.click()

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(children.dataset.dfState).toBe('collapsed')
    expect(children.getAttribute('aria-hidden')).toBe('true')
    expect(children.hasAttribute('inert')).toBe(true)
  })

  it('announces copy success without replacing the server-rendered control', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const root = document.createElement('div')
    root.innerHTML = `<span data-cf-behavior="copy-snippet" data-cf-value="pnpm test">
      <code>pnpm test</code>
      <button data-cf-action="copy-snippet" aria-label="Copy" title="Copy">
        <svg aria-hidden="true"></svg><span aria-live="polite" aria-atomic="true"></span>
      </button>
    </span>`
    document.body.append(root)
    enhancement = enhanceMarkdown(root, { behaviors: ['copy-snippet'] })
    await enhancement.ready

    const button = root.querySelector<HTMLButtonElement>('button')!
    button.click()
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('pnpm test')
      expect(button.dataset.dfCopied).toBe('true')
    })
    expect(button.classList.contains('cf-action-success')).toBe(true)
    expect(button.getAttribute('aria-label')).toBe('Copy ✓')
    expect(button.querySelector('[aria-live]')?.textContent).toBe('Copy ✓')
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('restores DOM state when the last enhancement is disposed', async () => {
    const root = document.createElement('div')
    root.innerHTML = `<details data-cf-behavior="details">
      <summary>More</summary><div data-cf-slot="content"><a href="#more">Content</a></div>
    </details>
    <div data-cf-behavior="tabs">
      <button role="tab" data-cf-tab="one" aria-selected="true" tabindex="0">One</button>
      <button role="tab" data-cf-tab="two" aria-selected="false" tabindex="-1">Two</button>
      <div role="tabpanel" data-cf-tab-panel="one">One</div>
      <div role="tabpanel" data-cf-tab-panel="two" hidden>Two</div>
    </div>
    <div data-cf-behavior="file-tree"><div data-cf-file-tree-branch data-cf-state="expanded">
      <button data-cf-action="toggle-file-tree" aria-expanded="true">docs</button>
      <div class="cf-file-tree-children" data-cf-state="expanded">README</div>
    </div></div>
    <div data-cf-behavior="code-toolbar" data-cf-language="ts" data-cf-source="const value = true"></div>`
    document.body.append(root)
    enhancement = enhanceMarkdown(root, {
      behaviors: ['details', 'tabs', 'file-tree', 'code-toolbar']
    })
    await enhancement.ready

    root.querySelector<HTMLButtonElement>('[data-cf-tab="two"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-cf-action="toggle-file-tree"]')!.click()
    enhancement.dispose()

    const details = root.querySelector('details')!
    const disclosure = details.querySelector<HTMLElement>('[data-cf-slot="content"]')!
    expect(details.dataset.dfEnhanced).toBeUndefined()
    expect(disclosure.hasAttribute('inert')).toBe(false)
    expect(root.querySelector('[data-cf-tab="one"]')?.getAttribute('aria-selected')).toBe('true')
    expect(root.querySelector<HTMLElement>('[data-cf-tab-panel="one"]')?.hidden).toBe(false)
    expect(root.querySelector<HTMLElement>('[data-cf-tab-panel="two"]')?.hidden).toBe(true)
    expect(root.querySelector('[data-cf-action="toggle-file-tree"]')?.getAttribute('aria-expanded')).toBe(
      'true'
    )
    expect(root.querySelector('.cf-file-tree-children')?.hasAttribute('inert')).toBe(false)
  })

  it('keeps shared root behavior active until its last owner disposes', async () => {
    const root = document.createElement('div')
    root.innerHTML = `<div data-cf-behavior="tabs">
      <button role="tab" data-cf-tab="one" aria-selected="true" tabindex="0">One</button>
      <button role="tab" data-cf-tab="two" aria-selected="false" tabindex="-1">Two</button>
      <div role="tabpanel" data-cf-tab-panel="one">One</div>
      <div role="tabpanel" data-cf-tab-panel="two" hidden>Two</div>
    </div>`
    document.body.append(root)
    const first = enhanceMarkdown(root, { behaviors: ['tabs'] })
    const second = enhanceMarkdown(root, { behaviors: ['tabs'] })
    await Promise.all([first.ready, second.ready])

    first.dispose()
    root.querySelector<HTMLButtonElement>('[data-cf-tab="two"]')!.click()
    expect(root.querySelector('[data-cf-tab="two"]')?.getAttribute('aria-selected')).toBe('true')

    second.dispose()
    expect(root.querySelector('[data-cf-tab="one"]')?.getAttribute('aria-selected')).toBe('true')
    root.querySelector<HTMLButtonElement>('[data-cf-tab="two"]')!.click()
    expect(root.querySelector('[data-cf-tab="one"]')?.getAttribute('aria-selected')).toBe('true')
  })

  it('releases only the behavior owned by each enhancement', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const root = document.createElement('div')
    root.innerHTML = `<div data-cf-behavior="tabs">
      <button role="tab" data-cf-tab="one" aria-selected="true">One</button>
      <button role="tab" data-cf-tab="two" aria-selected="false">Two</button>
      <div role="tabpanel" data-cf-tab-panel="one">One</div>
      <div role="tabpanel" data-cf-tab-panel="two" hidden>Two</div>
    </div>
    <span data-cf-behavior="copy-snippet" data-cf-value="pnpm test">
      <button data-cf-action="copy-snippet" aria-label="Copy">Copy</button>
    </span>`
    document.body.append(root)
    const tabs = enhanceMarkdown(root, { behaviors: ['tabs'] })
    const copy = enhanceMarkdown(root, { behaviors: ['copy-snippet'] })
    await Promise.all([tabs.ready, copy.ready])

    tabs.dispose()
    root.querySelector<HTMLButtonElement>('[data-cf-tab="two"]')!.click()
    expect(root.querySelector('[data-cf-tab="one"]')?.getAttribute('aria-selected')).toBe('true')

    root.querySelector<HTMLButtonElement>('[data-cf-action="copy-snippet"]')!.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('pnpm test'))
    copy.dispose()
  })

  it('restores direct-listener behavior state as soon as its owner is released', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const root = document.createElement('div')
    root.innerHTML = `<details data-cf-behavior="details">
      <summary>Details</summary>
      <div data-cf-slot="content">Content</div>
    </details>
    <span data-cf-behavior="copy-snippet" data-cf-value="pnpm test">
      <button data-cf-action="copy-snippet" aria-label="Copy">Copy</button>
    </span>`
    document.body.append(root)
    const detailsEnhancement = enhanceMarkdown(root, { behaviors: ['details'] })
    const copyEnhancement = enhanceMarkdown(root, { behaviors: ['copy-snippet'] })
    await Promise.all([detailsEnhancement.ready, copyEnhancement.ready])

    const details = root.querySelector<HTMLDetailsElement>('details')!
    const content = root.querySelector<HTMLElement>('[data-cf-slot="content"]')!
    expect(details.dataset.dfEnhanced).toBe('true')
    expect(content.hasAttribute('inert')).toBe(true)

    detailsEnhancement.dispose()
    expect(details.dataset.dfEnhanced).toBeUndefined()
    expect(content.hasAttribute('inert')).toBe(false)
    details.open = true
    details.dispatchEvent(new Event('toggle'))
    expect(details.dataset.dfEnhanced).toBeUndefined()

    root.querySelector<HTMLButtonElement>('[data-cf-action="copy-snippet"]')!.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('pnpm test'))
    copyEnhancement.dispose()
  })

  it('clears pending copy feedback when disposed', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const root = document.createElement('div')
    root.innerHTML = `<span data-cf-behavior="copy-snippet" data-cf-value="pnpm test">
      <button data-cf-action="copy-snippet" aria-label="Copy" title="Copy"><span aria-live="polite"></span></button>
    </span>`
    document.body.append(root)
    enhancement = enhanceMarkdown(root, { behaviors: ['copy-snippet'] })
    await enhancement.ready

    const button = root.querySelector<HTMLButtonElement>('button')!
    button.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(button.dataset.dfCopied).toBe('true')

    enhancement.dispose()

    expect(button.dataset.dfCopied).toBeUndefined()
    expect(button.getAttribute('aria-label')).toBe('Copy')
    expect(button.querySelector('[aria-live]')?.textContent).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not apply async copy feedback after disposal', async () => {
    vi.useFakeTimers()
    let finishCopy: (() => void) | undefined
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve) => {
            finishCopy = resolve
          })
      }
    })
    const root = document.createElement('div')
    root.innerHTML = `<span data-cf-behavior="copy-snippet" data-cf-value="pnpm test">
      <button data-cf-action="copy-snippet" aria-label="Copy"><span aria-live="polite"></span></button>
    </span>`
    document.body.append(root)
    enhancement = enhanceMarkdown(root, { behaviors: ['copy-snippet'] })
    await enhancement.ready

    const button = root.querySelector<HTMLButtonElement>('button')!
    button.click()
    enhancement.dispose()
    finishCopy?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(button.dataset.dfCopied).toBeUndefined()
    expect(button.getAttribute('aria-label')).toBe('Copy')
    expect(vi.getTimerCount()).toBe(0)
  })
})
