// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSearchBundle } from './searchBundle'

let outputRoot = ''
let searchBundle = ''

beforeAll(async () => {
  outputRoot = await mkdtemp(join(tmpdir(), 'canofold-search-bundle-'))
  // esbuild validates Node's TextEncoder and Uint8Array constructors. jsdom uses
  // a separate realm, so temporarily align the constructor while loading it.
  const jsdomUint8Array = globalThis.Uint8Array
  const nodeUint8Array = Object.getPrototypeOf(Object.getPrototypeOf(Buffer.alloc(0)))
    .constructor as Uint8ArrayConstructor
  Object.defineProperty(globalThis, 'Uint8Array', {
    configurable: true,
    writable: true,
    value: nodeUint8Array
  })
  try {
    await buildSearchBundle(outputRoot)
  } finally {
    Object.defineProperty(globalThis, 'Uint8Array', {
      configurable: true,
      writable: true,
      value: jsdomUint8Array
    })
  }
  searchBundle = await readFile(join(outputRoot, 'assets/canofold-search.js'), 'utf8')
})

afterEach(() => {
  ;(
    window as typeof window & {
      __canofoldSearchDispose?: () => void
    }
  ).__canofoldSearchDispose?.()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.documentElement.className = ''
})

afterAll(async () => {
  await rm(outputRoot, { recursive: true, force: true })
})

describe('built search client', () => {
  it('executes the minified artifact and renders compact search results', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        docs: [
          {
            title: 'Official plugins',
            description: 'Enable plugins from one entry point',
            routePath: '/plugins/',
            excerpt: 'Plugin guide',
            tags: []
          }
        ],
        postings: { plugin: [0] }
      })
    }))
    vi.stubGlobal('fetch', fetch)
    document.body.innerHTML = `
      <div data-canofold-search data-locale="en" data-search-index-url="/search/en.json">
        <div role="dialog">
          <input aria-label="Search">
          <div data-canofold-search-default></div>
          <div data-canofold-search-results hidden></div>
        </div>
      </div>`

    expect(() => new Function(searchBundle)()).not.toThrow()
    const input = document.querySelector<HTMLInputElement>('input')!
    input.value = 'plugin'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(150)

    expect(fetch).toHaveBeenCalledWith('/search/en.json')
    expect(document.querySelector('[data-canofold-search-results]')?.innerHTML).toContain(
      '<mark>plugin</mark>'
    )
  })
})
