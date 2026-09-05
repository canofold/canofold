// @vitest-environment jsdom

import { act, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enhanceMarkdown, type MarkdownBehaviorName, type MarkdownEnhancement } from '../client'
import { NATIVE_MARKDOWN_BEHAVIOR_NAMES } from '../client/nativeBehaviors'
import { MARKDOWN_BEHAVIOR_NAMES } from '../compiler/assets'
import { MarkdownDocument, type MarkdownProps } from '../react/Markdown'
import { prepareMarkdown } from '../compiler/prepareMarkdown'
import { createMarkdownRenderer } from '../server/createMarkdownRenderer'
import { RICH_MARKDOWN_BEHAVIOR_NAMES } from '../islands'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const activeEnhancements: MarkdownEnhancement[] = []

async function enhance(root: ParentNode, behaviors?: readonly MarkdownBehaviorName[]) {
  const enhancement = behaviors ? enhanceMarkdown(root, { behaviors: [...behaviors] }) : enhanceMarkdown(root)
  activeEnhancements.push(enhancement)
  await enhancement.ready
  return enhancement
}

afterEach(async () => {
  await act(async () => {
    activeEnhancements.splice(0).forEach((enhancement) => enhancement.dispose())
  })
  document.body.innerHTML = ''
})

async function Markdown({
  source,
  options,
  onError: _onError,
  onReady: _onReady,
  fallback: _fallback,
  retainPrevious: _retainPrevious,
  ...props
}: MarkdownProps) {
  const prepared = await prepareMarkdown(source, options)
  return <MarkdownDocument document={prepared.document} data-cf-runtime="static" {...props} />
}

describe('Markdown React Islands', () => {
  it('assigns every compiler behavior fact to exactly one browser runtime', () => {
    const native = new Set<MarkdownBehaviorName>(NATIVE_MARKDOWN_BEHAVIOR_NAMES)
    const rich = new Set<MarkdownBehaviorName>(RICH_MARKDOWN_BEHAVIOR_NAMES)
    const assigned = [...native, ...rich]

    expect([...native].filter((name) => rich.has(name))).toEqual([])
    expect([...new Set(assigned)].sort()).toEqual([...MARKDOWN_BEHAVIOR_NAMES].sort())
  })

  it('hydrates table state from semantic HAST data without reparsing Markdown', async () => {
    const element = await Markdown({ source: '| Value | Name |\n| --- | --- |\n| 10 | Ten |\n| 2 | Two |' })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    await act(async () => enhance(container))
    const table = container.querySelector('[data-cf-island="table"]') as HTMLElement
    expect(table.dataset.cfTable).toBeTruthy()

    await act(async () => {
      ;(table.querySelector('[data-cf-action="sort-table"]') as HTMLButtonElement).click()
    })
    expect(
      Array.from(table.querySelectorAll('[data-cf-slot="content"] tbody tr td:first-child')).map(
        (cell) => cell.textContent
      )
    ).toEqual(['2', '10'])
  })

  it('hydrates the gallery lightbox and keeps navigation inside one gallery', async () => {
    const element = await Markdown({
      source:
        '<div class="cf-image-gallery" data-cf-component="gallery"><figure><img src="one.png" alt="One" /></figure><figure><img src="two.png" alt="Two" /></figure></div>',
      options: { html: 'trusted' }
    })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    await act(async () => enhance(container))
    const gallery = container.querySelector('[data-cf-island="gallery"]') as HTMLElement
    await act(async () =>
      (gallery.querySelector('[data-cf-action="open-gallery"]') as HTMLButtonElement).click()
    )
    expect(document.body.querySelector('[data-cf-slot="lightbox"]')).not.toBeNull()

    await act(async () =>
      (document.body.querySelector('[data-cf-action="next-gallery-image"]') as HTMLButtonElement).click()
    )
    expect(document.body.querySelector('[data-cf-gallery-count]')?.textContent).toBe('2 / 2')
  })

  it('hydrates Tabs, Details, and File Tree React components from semantic island data', async () => {
    const element = await Markdown({
      source: [
        '::::tabs[安装方式]',
        ':::tab[pnpm]',
        'pnpm',
        ':::',
        ':::tab[npm]',
        'npm',
        ':::',
        '::::',
        '',
        '<details open><summary>More</summary><p>Details content</p></details>',
        '',
        '<div class="cf-file-tree" data-cf-component="file-tree"><ul><li class="cf-file-tree-branch" data-cf-file-tree-branch><button type="button" data-cf-action="toggle-file-tree" data-cf-file-tree-toggle aria-expanded="true">docs</button><ul><li>README.md</li></ul></li></ul></div>'
      ].join('\n'),
      options: { html: 'trusted' }
    })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    await act(async () => enhance(container))
    const npm = container.querySelector('[data-cf-tab^="npm-"]') as HTMLButtonElement
    await act(async () => npm.click())
    expect(npm.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-cf-tab-panel^="pnpm-"]')?.hasAttribute('hidden')).toBe(true)

    const folder = container.querySelector('[data-cf-file-tree-toggle]') as HTMLButtonElement
    await act(async () => folder.click())
    expect(folder.getAttribute('aria-expanded')).toBe('false')
    const children = container.querySelector('[data-cf-file-tree-branch] > .cf-file-tree-children')
    expect(children?.getAttribute('data-cf-state')).toBe('collapsed')
    expect(children?.getAttribute('aria-hidden')).toBe('true')
    expect(children?.hasAttribute('inert')).toBe(true)

    const details = container.querySelector('details') as HTMLDetailsElement
    const summary = details.querySelector('summary') as HTMLElement
    const disclosure = details.querySelector('.cf-details-content') as HTMLElement
    expect(details.dataset.cfEnhanced).toBe('true')
    expect(disclosure.hasAttribute('inert')).toBe(false)
    await act(async () => summary.click())
    expect(details.open).toBe(false)
    expect(disclosure.hasAttribute('inert')).toBe(true)

    await act(async () => {
      details.open = true
      details.dispatchEvent(new Event('toggle'))
    })
    expect(disclosure.hasAttribute('inert')).toBe(false)
  })

  it('hydrates whitespace-rich Details and Tabs without React recovery warnings', async () => {
    const element = await Markdown({
      source: [
        '<details open>',
        '  <summary>More</summary>',
        '  <p>Details content</p>',
        '</details>',
        '',
        '::::tabs[Install]',
        ':::tab[pnpm]',
        'pnpm content',
        ':::',
        ':::tab[npm]',
        'npm content',
        ':::',
        '::::'
      ].join('\n'),
      options: { html: 'trusted' }
    })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await act(async () => enhance(container, ['details', 'tabs']))

    expect(warning).not.toHaveBeenCalled()
    expect(container.querySelector('details')?.dataset.cfEnhanced).toBe('true')
    expect(container.querySelector('[role="tab"]')?.getAttribute('aria-selected')).toBe('true')
    warning.mockRestore()
  })

  it('hydrates direct MDX Tabs and File Tree components without DOM reparsing', async () => {
    const renderer = createMarkdownRenderer()
    const rendered = await renderer.renderMdx(`<MarkdownTabs>
  <div role="tablist">
    <button role="tab" data-cf-tab="one">One</button>
    <button role="tab" data-cf-tab="two">Two</button>
  </div>
  <div role="tabpanel" data-cf-tab-panel="one">First</div>
  <div role="tabpanel" data-cf-tab-panel="two">Second</div>
</MarkdownTabs>
<MarkdownFileTree>
  <ul><li data-cf-file-tree-branch=""><button type="button">docs</button><ul><li data-cf-file-tree-file="">README.md</li></ul></li></ul>
</MarkdownFileTree>`)
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(rendered.content)
    document.body.append(container)
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await act(async () => enhance(container, ['tabs', 'file-tree']))
    await act(async () => {
      ;(container.querySelector('[data-cf-tab="two"]') as HTMLButtonElement).click()
      ;(container.querySelector('[data-cf-file-tree-branch] > button') as HTMLButtonElement).click()
    })

    expect(container.querySelector('[data-cf-tab-panel="two"]')?.hasAttribute('hidden')).toBe(false)
    const children = container.querySelector('[data-cf-file-tree-branch] > .cf-file-tree-children')
    expect(children?.getAttribute('data-cf-state')).toBe('collapsed')
    expect(children?.getAttribute('aria-hidden')).toBe('true')
    expect(children?.hasAttribute('inert')).toBe(true)
    expect(warning).not.toHaveBeenCalled()
    warning.mockRestore()
  })

  it('hydrates only the interaction types requested by the static host', async () => {
    const element = await Markdown({
      source: [
        '<div data-cf-component="gallery"><figure><img src="one.png" alt="One" /></figure></div>',
        '',
        '| Value |',
        '| --- |',
        '| One |'
      ].join('\n'),
      options: { html: 'trusted' }
    })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    await act(async () => enhance(container, ['gallery']))

    const gallery = container.querySelector('[data-cf-island="gallery"]') as HTMLElement
    await act(async () =>
      (gallery.querySelector('[data-cf-action="open-gallery"]') as HTMLButtonElement).click()
    )
    expect(document.body.querySelector('[data-cf-slot="lightbox"]')).not.toBeNull()

    const table = container.querySelector('[data-cf-island="table"]') as HTMLElement
    ;(table.querySelector('[data-cf-action="sort-table"]') as HTMLButtonElement).click()
    expect(table.querySelector('tbody td')?.textContent).toBe('One')
  })

  it('preserves custom server-rendered slots when native behavior is attached', async () => {
    function StatefulCopyIcon() {
      const [state] = useState('host-react')
      return <span data-react-runtime={state}>copy</span>
    }
    const element = await Markdown({
      source: '```ts\nconst value = true\n```',
      slots: { CopyIcon: StatefulCopyIcon }
    })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    await act(async () => enhance(container, ['code-toolbar']))

    expect(container.querySelector('[data-react-runtime="host-react"]')).not.toBeNull()
  })

  it('unmounts and can hydrate the same island again after host navigation', async () => {
    const element = await Markdown({
      source: ['| Value |', '| --- |', '| One |'].join('\n')
    })
    const container = document.createElement('div')
    const staticHtml = renderToStaticMarkup(element)
    container.innerHTML = staticHtml
    document.body.append(container)

    const first = await act(async () => enhance(container, ['table']))
    await act(async () => first.dispose())
    container.innerHTML = staticHtml
    await act(async () => enhance(container, ['table']))

    const table = container.querySelector('[data-cf-island="table"]') as HTMLElement
    expect(table.querySelector('[data-cf-action="sort-table"]')).not.toBeNull()
  })

  it('hydrates heading, image, terminal, and copy-snippet interactions', async () => {
    const copied: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => copied.push(value) }
    })
    const element = await Markdown({
      source: [
        '## Install',
        '',
        '![Architecture](architecture.png "Architecture")',
        '',
        '~~~terminal title="Shell"',
        '$ pnpm build',
        '~~~',
        '',
        '<span data-cf-component="copy-snippet" data-cf-value="pnpm install">pnpm install</span>'
      ].join('\n'),
      options: { html: 'trusted' }
    })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    await act(async () => enhance(container, ['heading', 'image', 'terminal-toolbar', 'copy-snippet']))

    await act(async () => {
      ;(container.querySelector('[data-cf-action="copy-section-link"]') as HTMLButtonElement).click()
      ;(container.querySelector('[data-cf-action="copy-terminal"]') as HTMLButtonElement).click()
      ;(container.querySelector('[data-cf-action="copy-snippet"]') as HTMLButtonElement).click()
    })
    expect(copied[0]).toContain('#install')
    expect(copied).toContain('$ pnpm build')
    expect(copied).toContain('pnpm install')

    await act(async () => {
      ;(container.querySelector('[data-cf-action="zoom-image"]') as HTMLButtonElement).click()
    })
    expect(document.body.querySelector('.cf-image-lightbox[role="dialog"]')).not.toBeNull()
  })

  it('preserves rich image captions during hydration', async () => {
    const element = await Markdown({
      source:
        '<figure><img src="architecture.png" alt="Architecture"><figcaption><strong>Architecture</strong> overview</figcaption></figure>',
      options: { html: 'trusted' }
    })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    expect(container.querySelector('figcaption strong')?.textContent).toBe('Architecture')
    await act(async () => enhance(container, ['image']))
    expect(container.querySelector('figcaption strong')?.textContent).toBe('Architecture')
  })

  it('deduplicates concurrent hydration requests for the same island root', async () => {
    const element = await Markdown({ source: '| Value |\n| --- |\n| One |' })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await act(async () => Promise.all([enhance(container, ['table']), enhance(container, ['table'])]))

    expect(container.querySelectorAll('[data-cf-action="sort-table"]')).toHaveLength(1)
    expect(warning).not.toHaveBeenCalled()
    warning.mockRestore()
  })

  it('keeps a rich island mounted until the last enhancement owner disposes', async () => {
    const element = await Markdown({ source: '| Value |\n| --- |\n| Two |\n| One |' })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    const first = await act(async () => enhance(container, ['table']))
    const second = await act(async () => enhance(container, ['table']))
    await act(async () => first.dispose())

    const table = container.querySelector('[data-cf-island="table"]') as HTMLElement
    await act(async () => {
      ;(table.querySelector('[data-cf-action="sort-table"]') as HTMLButtonElement).click()
    })
    expect(table.querySelector('tbody td')?.textContent).toBe('One')

    await act(async () => second.dispose())
    expect(table.querySelector('[data-cf-action="sort-table"]')).toBeNull()
  })

  it('does not hydrate an island after its pending navigation boundary was unmounted', async () => {
    const element = await Markdown({ source: '| Value |\n| --- |\n| Two |\n| One |' })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    await act(async () => {
      const enhancement = enhanceMarkdown(container, { behaviors: ['table'] })
      enhancement.dispose()
      await enhancement.ready
    })

    ;(container.querySelector('[data-cf-action="sort-table"]') as HTMLButtonElement).click()
    expect(container.querySelector('tbody td')?.textContent).toBe('Two')
  })

  it('exposes one client entry for static hosts', async () => {
    const element = await Markdown({ source: '| Value |\n| --- |\n| Two |\n| One |' })
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(element)
    document.body.append(container)

    const enhancement = enhanceMarkdown(container, { behaviors: ['table'] })
    await act(async () => enhancement.ready)
    expect(container.querySelector('[data-cf-action="sort-table"]')).not.toBeNull()
    await act(async () => enhancement.dispose())
  })
})
