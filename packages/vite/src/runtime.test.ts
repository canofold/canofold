import { describe, expect, it } from 'vitest'
import { demoRuntimeSource } from './runtime'

describe('demoRuntimeSource', () => {
  it('keeps source disclosure state on the button and source panel', () => {
    const source = demoRuntimeSource([])

    expect(source).toContain("button.setAttribute('aria-expanded', String(expanded))")
    expect(source).toContain("button.querySelector('[data-cf-demo-tooltip]')")
    expect(source).toContain('source.hidden = !expanded')
    expect(source).toContain('eventController = new AbortController()')
    expect(source).not.toContain('const controllers = new Set()')
  })

  it('mounts a requested demo in a standalone new-window view', () => {
    const source = demoRuntimeSource([])

    expect(source).toContain("searchParams.get('canofold-demo')")
    expect(source).toContain("root.className = 'cf-demo-standalone'")
    expect(source).toContain('document.body.replaceChildren(root)')
    expect(source).toContain('if (standaloneDemo())')
  })

  it('creates a restricted, responsive iframe and reports module failures inside it', () => {
    const source = demoRuntimeSource([], undefined, ['/assets/demos.css'])

    expect(source).toContain("frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')")
    expect(source).toContain("frame.referrerPolicy = 'no-referrer'")
    expect(source).toContain("frame.addEventListener('load', () => fitFrame(frame)")
    expect(source).toContain('new ResizeObserver(update)')
    expect(source).toContain("console.error('[Canofold demo iframe]', error)")
    expect(source).toContain('/assets/demos.css')
  })
})
