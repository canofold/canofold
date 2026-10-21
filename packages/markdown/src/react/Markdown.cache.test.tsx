// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { prepare } = vi.hoisted(() => ({ prepare: vi.fn() }))
vi.mock('../compiler/prepareMarkdown.js', () => ({ prepareMarkdown: prepare }))
import { Markdown } from './Markdown'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  prepare.mockReset()
})

describe('Browser Markdown retention', () => {
  it('retains compacted tokens instead of a second oversized highlighted tree', async () => {
    prepare.mockImplementation(async () => ({
      analysis: {},
      document: {
        type: 'root',
        children: [
          {
            type: 'element',
            tagName: 'pre',
            properties: { className: ['shiki'] },
            children: [
              {
                type: 'element',
                tagName: 'code',
                properties: {},
                children: Array.from({ length: 32768 }, () => ({
                  type: 'element',
                  tagName: 'span',
                  properties: {},
                  children: [{ type: 'text', value: 'x' }]
                }))
              }
            ]
          }
        ]
      }
    }))
    for (let index = 0; index < 2; index++) {
      const container = document.createElement('div')
      const root = createRoot(container)
      try {
        await act(async () => root.render(<Markdown source="Many inert tokens" />))
        expect(container.querySelectorAll('code span')).toHaveLength(32768)
        expect(container.querySelector('code')?.textContent).toBe('x'.repeat(32768))
      } finally {
        await act(async () => root.unmount())
      }
    }
    expect(prepare).toHaveBeenCalledOnce()
  })

  it('restores full nodes when host overrides are enabled and reuses compact output when removed', async () => {
    prepare.mockImplementation(async () => ({
      analysis: {},
      document: {
        type: 'root',
        children: [
          {
            type: 'element',
            tagName: 'pre',
            properties: { className: ['shiki'] },
            children: [
              {
                type: 'element',
                tagName: 'code',
                properties: {},
                children: [
                  {
                    type: 'element',
                    tagName: 'span',
                    properties: {},
                    children: [{ type: 'text', value: 'token' }]
                  }
                ]
              }
            ]
          }
        ]
      }
    }))
    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      await act(async () => root.render(<Markdown source="Changing overrides" retainPrevious />))
      expect(container.querySelector('code')?.textContent).toBe('token')
      await act(async () =>
        root.render(
          <Markdown
            source="Changing overrides"
            retainPrevious
            components={{ span: (props) => <span {...props} data-host-token /> }}
          />
        )
      )
      expect(container.querySelectorAll('[data-host-token]')).toHaveLength(1)
      await act(async () => root.render(<Markdown source="Changing overrides" retainPrevious />))
      expect(container.querySelector('[data-host-token]')).toBeNull()
      expect(container.querySelector('code')?.textContent).toBe('token')
      expect(prepare).toHaveBeenCalledTimes(2)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('cancels an unobserved pending source without poisoning a subsequent retry', async () => {
    const signals: AbortSignal[] = []
    prepare.mockImplementation((_source, _options, context) => {
      signals.push(context.signal)
      return new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
      })
    })
    for (let index = 0; index < 2; index++) {
      const root = createRoot(document.createElement('div'))
      await act(async () => root.render(<Markdown source="Superseded pending source" />))
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
      await act(async () => root.unmount())
    }
    expect(prepare).toHaveBeenCalledTimes(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('keeps shared pending work alive until its last consumer unmounts', async () => {
    let signal: AbortSignal | undefined
    prepare.mockImplementation((_source, _options, context) => {
      signal = context.signal
      return new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
      })
    })
    const first = createRoot(document.createElement('div'))
    const second = createRoot(document.createElement('div'))
    await act(async () => {
      first.render(<Markdown source="Shared pending source" />)
      second.render(<Markdown source="Shared pending source" />)
    })
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(prepare).toHaveBeenCalledOnce()
    await act(async () => first.unmount())
    expect(signal?.aborted).toBe(false)
    await act(async () => second.unmount())
    expect(signal?.aborted).toBe(true)
  })

  it('does not retain completed oversized documents', async () => {
    prepare.mockResolvedValue({
      analysis: {},
      document: { type: 'root', children: [{ type: 'text', value: 'x'.repeat(9 * 1024 * 1024) }] }
    })
    for (let index = 0; index < 2; index++) {
      const container = document.createElement('div')
      const root = createRoot(container)
      const ready = vi.fn()
      await act(async () => {
        root.render(<Markdown source="Oversized browser document" onReady={ready} />)
      })
      await vi.waitFor(async () => {
        await act(async () => {})
        expect(ready).toHaveBeenCalledOnce()
      })
      await act(async () => root.unmount())
    }
    expect(prepare).toHaveBeenCalledTimes(2)
  })
})
