// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { defineMarkdownPlugin } from '../compiler/plugins'
import { Markdown } from './Markdown'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function waitForMarkdown(container: HTMLElement) {
  const deadline = Date.now() + 6_000

  while (!container.querySelector('[data-df-root="markdown"]') && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
  }
}

async function waitForHeading(container: HTMLElement, value: string) {
  const deadline = Date.now() + 6_000
  while (container.querySelector('h1')?.textContent !== value && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
  }
}

describe('Markdown browser component', () => {
  it('renders through createRoot without exposing a compile API', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<Markdown source="# Browser Markdown" fallback={<span>Loading</span>} />)
    })

    await waitForMarkdown(container)

    expect(container.querySelector('[data-df-root="markdown"]')).not.toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe('Browser Markdown')
    await act(async () => root.unmount())
  }, 10_000)

  it('accepts non-serializable compiler options without crashing', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const options: Record<string, unknown> = {}
    options.circular = options

    await act(async () => {
      root.render(<Markdown source="# Circular options" options={options} fallback={<span>Loading</span>} />)
    })

    await waitForMarkdown(container)
    expect(container.querySelector('h1')?.textContent).toBe('Circular options')
    await act(async () => root.unmount())
  }, 10_000)

  it('keeps the previous document visible while updated source is prepared', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    let holdPreparation = false
    let releasePreparation: (() => void) | undefined
    const options = {
      plugins: [
        defineMarkdownPlugin({
          name: 'retained-preview-test',
          rehypePlugins: [
            () => async () => {
              if (holdPreparation) {
                await new Promise<void>((resolve) => {
                  releasePreparation = resolve
                })
              }
            }
          ]
        })
      ]
    }

    await act(async () => {
      root.render(
        <Markdown source="# First" options={options} retainPrevious fallback={<span>Loading</span>} />
      )
    })
    await waitForHeading(container, 'First')

    holdPreparation = true
    await act(async () => {
      root.render(
        <Markdown source="# Second" options={options} retainPrevious fallback={<span>Loading</span>} />
      )
    })
    expect(container.querySelector('h1')?.textContent).toBe('First')
    expect(container.textContent).not.toContain('Loading')

    await act(async () => releasePreparation?.())
    await waitForHeading(container, 'Second')
    expect(container.querySelector('h1')?.textContent).toBe('Second')
    await act(async () => root.unmount())
  }, 10_000)
})
