// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  MarkdownFileTree,
  MarkdownGallery,
  MarkdownImage,
  MarkdownTabs,
  MarkdownCodeBlock,
  MarkdownCopySnippet,
  MarkdownDetails,
  MarkdownTable
} from './MarkdownComposite'
import { MarkdownSlotsProvider } from '../../react/slots'
import type { MarkdownCopySnippetProps } from '../blocks/MarkdownCopySnippet'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('React Markdown composite interactions', () => {
  it('copies inline snippets through React state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () =>
      root.render(<MarkdownCopySnippet value="pnpm add @canofold/markdown" copyLabel="复制命令" />)
    )
    const button = container.querySelector('[data-cf-action="copy-snippet"]') as HTMLButtonElement
    await act(async () => button.click())

    expect(writeText).toHaveBeenCalledWith('pnpm add @canofold/markdown')
    expect(button.dataset.dfCopied).toBe('true')
    expect(button.getAttribute('aria-label')).toContain('复制命令')
    expect(button.querySelector('[aria-live="polite"]')?.textContent).toContain('复制命令')

    await act(async () => root.unmount())
    container.remove()
  })

  it('shows copy failure feedback when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<MarkdownCopySnippet value="copy me" />))

    const button = container.querySelector('[data-cf-action="copy-snippet"]') as HTMLButtonElement
    await act(async () => button.click())

    expect(button.dataset.dfCopyError).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Copy failed')
    expect(button.querySelector('[aria-live="polite"]')?.textContent).toBe('Copy failed')
    await act(async () => root.unmount())
  })

  it('filters compiler-only and unknown Copy Snippet props from the DOM', () => {
    const html = renderToStaticMarkup(
      <MarkdownCopySnippet
        {...({
          value: 'pnpm test',
          node: { type: 'element' },
          dataCfFoo: 'internal',
          customThing: 'invalid'
        } as MarkdownCopySnippetProps)}
      />
    )

    expect(html).not.toMatch(/\snode=/)
    expect(html).not.toMatch(/\sdataCfFoo=/)
    expect(html).not.toMatch(/\scustomThing=/)
  })

  it('resolves icon slots inside React block controls', () => {
    const html = renderToStaticMarkup(
      <MarkdownSlotsProvider
        slots={{
          CopyIcon: ({ name }) => <span data-test-icon={name}>copy</span>,
          FolderIcon: ({ name }) => <span data-test-icon={name}>folder</span>,
          FileIcon: ({ name }) => <span data-test-icon={name}>file</span>
        }}
      >
        <MarkdownCodeBlock language="ts" source="const value = true">
          <pre>
            <code>const value = true</code>
          </pre>
        </MarkdownCodeBlock>
        <MarkdownFileTree>
          <ul>
            <li data-cf-file-tree-branch>
              <button type="button">docs</button>
              <ul>
                <li data-cf-file-tree-file>README.md</li>
              </ul>
            </li>
            <li data-cf-file-tree-file>README.md</li>
          </ul>
        </MarkdownFileTree>
      </MarkdownSlotsProvider>
    )
    expect(html).toContain('data-test-icon="copy"')
    expect(html).toContain('data-test-icon="folder"')
    expect(html).toContain('data-test-icon="file"')
  })

  it('owns Tabs click and keyboard state after React mounts', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MarkdownTabs>
          <div role="tablist">
            <button role="tab" data-cf-tab="pnpm" aria-selected="true" tabIndex={0}>
              pnpm
            </button>
            <button role="tab" data-cf-tab="npm" aria-selected="false" tabIndex={-1}>
              npm
            </button>
          </div>
          <div role="tabpanel" data-cf-tab-panel="pnpm">
            pnpm content
          </div>
          <div role="tabpanel" data-cf-tab-panel="npm" hidden>
            npm content
          </div>
        </MarkdownTabs>
      )
    })

    const pnpm = container.querySelector('[data-cf-tab="pnpm"]') as HTMLButtonElement
    const npm = container.querySelector('[data-cf-tab="npm"]') as HTMLButtonElement

    await act(async () => {
      npm.click()
    })
    expect(npm.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-cf-tab-panel="pnpm"]')?.hasAttribute('hidden')).toBe(true)
    expect(container.querySelector('[data-cf-tab-panel="npm"]')?.hasAttribute('hidden')).toBe(false)

    await act(async () => {
      npm.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(pnpm.getAttribute('aria-selected')).toBe('true')

    await act(async () => {
      pnpm.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    expect(npm.getAttribute('aria-selected')).toBe('true')

    await act(async () => {
      npm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(pnpm.getAttribute('aria-selected')).toBe('true')

    await act(async () => root.unmount())
    container.remove()
  })

  it('honors an authored active tab and skips disabled tabs during keyboard navigation', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MarkdownTabs>
          <div role="tablist">
            <button role="tab" data-cf-tab="first" aria-selected="false">
              First
            </button>
            <button role="tab" data-cf-tab="disabled" disabled>
              Disabled
            </button>
            <button role="tab" data-cf-tab="third" aria-selected="true">
              Third
            </button>
          </div>
          <div role="tabpanel" data-cf-tab-panel="first">
            First content
          </div>
          <div role="tabpanel" data-cf-tab-panel="disabled">
            Disabled content
          </div>
          <div role="tabpanel" data-cf-tab-panel="third">
            Third content
          </div>
        </MarkdownTabs>
      )
    })

    const first = container.querySelector('[data-cf-tab="first"]') as HTMLButtonElement
    const disabled = container.querySelector('[data-cf-tab="disabled"]') as HTMLButtonElement
    const third = container.querySelector('[data-cf-tab="third"]') as HTMLButtonElement
    expect(third.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-cf-tab-panel="third"]')?.hasAttribute('hidden')).toBe(false)

    await act(async () => {
      third.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(disabled.getAttribute('aria-selected')).toBe('false')

    await act(async () => root.unmount())
    container.remove()
  })

  it('preserves trigger refs without React 19 element.ref warnings', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const triggerRef = createRef<HTMLButtonElement>()
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await act(async () => {
      root.render(
        <MarkdownTabs>
          <div role="tablist">
            <button ref={triggerRef} role="tab" data-cf-tab="pnpm">
              pnpm
            </button>
          </div>
          <div role="tabpanel" data-cf-tab-panel="pnpm">
            pnpm content
          </div>
        </MarkdownTabs>
      )
    })

    expect(triggerRef.current).toBe(container.querySelector('[data-cf-tab="pnpm"]'))
    expect(warning).not.toHaveBeenCalled()

    warning.mockRestore()
    await act(async () => root.unmount())
    container.remove()
  })

  it('gives every Tabs instance unique tab and panel relationships', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const tabs = (
      <MarkdownTabs>
        <div role="tablist">
          <button role="tab" data-cf-tab="first">
            First
          </button>
        </div>
        <div role="tabpanel" data-cf-tab-panel="first">
          Content
        </div>
      </MarkdownTabs>
    )

    await act(async () =>
      root.render(
        <>
          {tabs}
          {tabs}
        </>
      )
    )

    const triggers = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
    const panels = Array.from(container.querySelectorAll<HTMLElement>('[role="tabpanel"]'))
    const [firstTrigger, secondTrigger] = triggers
    const [firstPanel, secondPanel] = panels
    expect(firstTrigger).toBeDefined()
    expect(secondTrigger).toBeDefined()
    expect(firstPanel).toBeDefined()
    expect(secondPanel).toBeDefined()
    if (!firstTrigger || !secondTrigger || !firstPanel || !secondPanel) return
    expect(firstTrigger.id).not.toBe(secondTrigger.id)
    expect(firstPanel.id).not.toBe(secondPanel.id)
    expect(firstTrigger.getAttribute('aria-controls')).toBe(firstPanel.id)
    expect(secondPanel.getAttribute('aria-labelledby')).toBe(secondTrigger.id)

    await act(async () => root.unmount())
    container.remove()
  })

  it('keeps File Tree and Gallery behavior inside React components', async () => {
    const container = document.createElement('div')
    container.className = 'cf-content'
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <>
          <MarkdownFileTree>
            <ul>
              <li data-cf-file-tree-branch>
                <button type="button" aria-expanded="true">
                  docs
                </button>
                <ul>
                  <li data-cf-file-tree-file aria-current="page">
                    README.md
                  </li>
                </ul>
              </li>
            </ul>
          </MarkdownFileTree>
          <MarkdownGallery>
            <figure>
              <img src="one.png" alt="One" />
            </figure>
            <figure>
              <img src="two.png" alt="Two" />
            </figure>
          </MarkdownGallery>
        </>
      )
    })

    const toggle = container.querySelector('[data-cf-file-tree-toggle]') as HTMLButtonElement
    expect(container.querySelectorAll('[data-cf-slot="folder-icon"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-cf-slot="folder-icon"] svg')).toHaveLength(1)
    expect(container.querySelectorAll('[data-cf-slot="file-icon"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-cf-slot="file-icon"] svg')).toHaveLength(1)
    expect(toggle.classList.contains('cf-file-tree-folder')).toBe(true)
    expect(container.querySelector('[data-cf-file-tree-file]')?.classList).toContain('cf-file-tree-current')
    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const fileTreeChildren = container.querySelector('.cf-file-tree-children')
    expect(fileTreeChildren?.getAttribute('data-cf-state')).toBe('collapsed')
    expect(fileTreeChildren?.getAttribute('aria-hidden')).toBe('true')
    expect(fileTreeChildren?.hasAttribute('inert')).toBe(true)

    const galleryTrigger = container.querySelector('[data-cf-action="open-gallery"]') as HTMLButtonElement
    await act(async () => galleryTrigger.click())
    expect(document.body.querySelector('[data-cf-slot="lightbox"]')).not.toBeNull()
    expect(document.body.querySelector('[aria-label="Next image"]')).not.toBeNull()

    const next = document.body.querySelector('[data-cf-action="next-gallery-image"]') as HTMLButtonElement
    await act(async () => next.click())
    expect(document.body.querySelector('[data-cf-gallery-count]')?.textContent).toBe('2 / 2')

    const close = document.body.querySelector('[data-cf-action="close-gallery"]') as HTMLButtonElement
    await act(async () => close.click())
    expect(document.body.querySelector('[data-cf-slot="lightbox"]')).toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })

  it('honors a boolean collapsed state in File Tree input', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () =>
      root.render(
        <MarkdownFileTree>
          <ul>
            <li data-cf-file-tree-branch>
              <button type="button" aria-expanded={false}>
                docs
              </button>
              <ul>
                <li data-cf-file-tree-file>README.md</li>
              </ul>
            </li>
          </ul>
        </MarkdownFileTree>
      )
    )

    expect(container.querySelector('[data-cf-file-tree-toggle]')?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.cf-file-tree-children')?.getAttribute('data-cf-state')).toBe('collapsed')
    await act(async () => root.unmount())
  })

  it('upgrades Details with a reversible disclosure transition while keeping native semantics', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MarkdownDetails open>
          <summary>More</summary>
          <p>Details content</p>
        </MarkdownDetails>
      )
    })

    const details = container.querySelector('details') as HTMLDetailsElement
    const content = container.querySelector('.cf-details-content') as HTMLElement
    expect(details.dataset.dfBehavior).toBe('details')
    expect(details.dataset.dfEnhanced).toBe('true')
    expect(content.hasAttribute('inert')).toBe(false)
    expect(content.querySelector('summary')).toBeNull()

    await act(async () => {
      details.open = false
      details.dispatchEvent(new Event('toggle', { bubbles: true }))
    })
    expect(content.hasAttribute('inert')).toBe(true)

    await act(async () => {
      details.open = true
      details.dispatchEvent(new Event('toggle', { bubbles: true }))
    })
    expect(content.hasAttribute('inert')).toBe(false)

    await act(async () => root.unmount())
    container.remove()
  })

  it('closes a Gallery dialog when a reactive item update removes the active image', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const first = { src: 'one.png', alt: 'One' }
    const second = { src: 'two.png', alt: 'Two' }

    await act(async () => root.render(<MarkdownGallery items={[first, second]} />))
    const triggers = container.querySelectorAll<HTMLButtonElement>('[data-cf-action="open-gallery"]')
    await act(async () => triggers[1]?.click())
    expect(document.body.querySelector('[data-cf-slot="lightbox"]')).not.toBeNull()

    await act(async () => root.render(<MarkdownGallery items={[first]} />))
    expect(document.body.querySelector('[data-cf-slot="lightbox"]')).toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })

  it('opens image preview and restores focus after Escape', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MarkdownImage
          src="image.png"
          alt="Architecture"
          caption="Architecture overview"
          zoomLabel="Preview image"
        />
      )
    })

    const trigger = container.querySelector('[data-cf-action="zoom-image"]') as HTMLButtonElement
    const previousOverflow = document.body.style.overflow
    await act(async () => trigger.click())

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const close = document.body.querySelector(
      '[data-cf-action="close-image"][data-cf-slot="close"]'
    ) as HTMLButtonElement
    expect(dialog.getAttribute('aria-label')).toBe('Preview image')
    expect(document.activeElement).toBe(close)
    expect(document.body.style.overflow).toBe('hidden')

    await act(async () => {
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(document.activeElement).toBe(close)

    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe(previousOverflow)

    await act(async () => root.unmount())
    container.remove()
  })

  it('localizes table preview controls and restores trigger focus', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MarkdownTable closeLabel="关闭表格预览">
          <table>
            <thead>
              <tr>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>One</td>
              </tr>
            </tbody>
          </table>
        </MarkdownTable>
      )
    })

    const trigger = container.querySelector('[data-cf-action="zoom-table"]') as HTMLButtonElement
    await act(async () => trigger.click())
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const close = document.body.querySelector(
      '[data-cf-slot="preview"] [data-cf-action="close-table"][data-cf-slot="close"]'
    ) as HTMLButtonElement
    expect(
      document.body.querySelector('[data-cf-slot="preview"] .cf-table-window > .cf-data-table > table')
    ).not.toBeNull()
    expect(close.getAttribute('aria-label')).toBe('关闭表格预览')
    expect(document.activeElement).toBe(dialog)
    expect(
      document.body
        .querySelector('[data-cf-slot="preview"] .cf-table-preview-backdrop')
        ?.getAttribute('aria-hidden')
    ).toBe('true')

    await act(async () =>
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    )
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    await act(async () => root.unmount())
    container.remove()
  })

  it('preserves additional table header rows', () => {
    const html = renderToStaticMarkup(
      <MarkdownTable>
        <table>
          <thead>
            <tr>
              <th>Primary</th>
            </tr>
            <tr>
              <th>Secondary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Value</td>
            </tr>
          </tbody>
        </table>
      </MarkdownTable>
    )

    expect(html).toContain('Primary')
    expect(html).toContain('Secondary')
  })

  it('shows the current table sort direction without changing the button geometry', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MarkdownTable>
          <table>
            <thead>
              <tr>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Beta</td>
              </tr>
              <tr>
                <td>Alpha</td>
              </tr>
            </tbody>
          </table>
        </MarkdownTable>
      )
    })

    const button = container.querySelector('[data-cf-action="sort-table"]') as HTMLButtonElement
    expect(button.querySelector('.lucide-chevrons-up-down')).not.toBeNull()

    await act(async () => button.click())
    expect(button.dataset.sort).toBe('asc')
    expect(button.querySelector('.lucide-chevrons-up-down')).not.toBeNull()

    await act(async () => button.click())
    expect(button.dataset.sort).toBe('desc')
    expect(button.querySelector('.lucide-chevrons-up-down')).not.toBeNull()

    await act(async () => button.click())
    expect(button.dataset.sort).toBeUndefined()
    expect(button.querySelector('.lucide-chevrons-up-down')).not.toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })
})
