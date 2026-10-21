// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { useInteractionReady } from './useInteractionReady'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('Markdown interaction readiness', () => {
  it('does not render client-only controls twice just to enable their handlers', async () => {
    const renders: boolean[] = []
    const click = vi.fn()
    function Control() {
      const ready = useInteractionReady()
      renders.push(ready)
      return (
        <button disabled={!ready} onClick={click}>
          Open
        </button>
      )
    }
    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      await act(async () => root.render(<Control />))
      expect(renders).toEqual([true])
      await act(async () => container.querySelector('button')!.click())
      expect(click).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('keeps server and hydration markup disabled until the handlers are mounted', async () => {
    const renders: boolean[] = []
    const click = vi.fn()
    function Control() {
      const ready = useInteractionReady()
      renders.push(ready)
      return (
        <button disabled={!ready} onClick={click}>
          Open
        </button>
      )
    }
    const container = document.createElement('div')
    container.innerHTML = renderToString(<Control />)
    expect(renders).toEqual([false])
    container.querySelector('button')!.click()
    expect(click).not.toHaveBeenCalled()
    renders.length = 0
    const errors = vi.fn()
    const root = hydrateRoot(container, <Control />, { onRecoverableError: errors })
    try {
      await act(async () => {})
      expect(renders).toEqual([false, true])
      await act(async () => container.querySelector('button')!.click())
      expect(click).toHaveBeenCalledOnce()
      expect(errors).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
    }
  })
})
