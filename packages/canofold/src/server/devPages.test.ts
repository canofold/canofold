import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMarkdownRenderer } from '@canofold/markdown/server'
import type { BuildResult } from '../commands/build'
import { randomBytes } from 'node:crypto'
import { createMockConfig, createMockGraph, createMockPage } from '../../test/fixtures'
const mocks = vi.hoisted(() => ({ render: vi.fn(), assets: vi.fn() }))
vi.mock('../render/renderSite', () => ({ renderPage: mocks.render }))
vi.mock('../render/siteAssets', () => ({ collectPageAssets: mocks.assets }))
import { createDevPages } from './devPages'

function state() {
  return {
    renderHtml: false,
    config: createMockConfig(),
    graph: createMockGraph({
      pages: [createMockPage({ routePath: '/guide/', outputPath: 'guide/index.html' })]
    })
  } as BuildResult
}
beforeEach(() => {
  mocks.render.mockReset()
  mocks.render.mockResolvedValue({ html: '<p>Current</p>' })
  mocks.assets.mockReset().mockResolvedValue([])
})

describe('Development document requests', () => {
  it('does not rejoin its own decoding task when an unrelated page is rebuilt', async () => {
    let current: BuildResult = { ...state(), mode: 'clean', changedPages: [] }
    const pages = createDevPages('/project', createMarkdownRenderer(), () => current)
    await pages.resolveDocument('/guide/')
    const pending = pages.resolveDocument('/guide/')
    current = { ...current, mode: 'incremental', changedPages: ['docs/other.md'] }
    expect(await pending).toBe('<p>Current</p>')
    expect(mocks.render).toHaveBeenCalledTimes(1)
    await pages.close()
  })
  it('reuses highly expanded long documents within the existing retained-byte limit', async () => {
    const current = state()
    const html = `<article>${'<span style="color:red">Code token</span>'.repeat(300_000)}</article>`
    mocks.render.mockResolvedValue({ html })
    const pages = createDevPages('/project', createMarkdownRenderer(), () => current)
    expect(await pages.resolveDocument('/guide/')).toBe(html)
    expect(await pages.resolveDocument('/guide/')).toBe(html)
    expect(mocks.render).toHaveBeenCalledTimes(1)
    await pages.close()
  })
  it('recognizes equivalent encoded Unicode routes and index aliases', async () => {
    const current = state()
    current.graph.pages[0]!.routePath = '/%E6%B5%8B%E8%AF%95%3F/'
    current.graph.pages[0]!.outputPath = '测试?/index.html'
    const pages = createDevPages('/project', createMarkdownRenderer(), () => current)
    expect(await pages.resolveDocument('/%e6%b5%8b%e8%af%95%3f/')).toBe('<p>Current</p>')
    expect(await pages.resolveDocument('/%E6%B5%8B%E8%AF%95%3F/index.html')).toBe('<p>Current</p>')
    expect(mocks.render).toHaveBeenCalledTimes(1)
    await pages.close()
  })
  it('does not start rendering after closing while resource resolution is pending', async () => {
    let release!: () => void
    mocks.assets.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve([])
        })
    )
    const current = state()
    const pages = createDevPages('/project', createMarkdownRenderer(), () => current)
    const pending = pages.resolveDocument('/guide/')
    const closing = pages.close()
    release()
    await closing
    expect(await pending).toBeUndefined()
    expect(mocks.render).not.toHaveBeenCalled()
  })
  it('reuses unchanged HTML after incremental builds but not changed pages or delivery modes', async () => {
    let current: BuildResult = { ...state(), mode: 'clean', changedPages: [] }
    const pages = createDevPages('/project', createMarkdownRenderer(), () => current)
    await pages.resolveDocument('/guide/')
    current = { ...current, mode: 'incremental', changedPages: ['docs/other.md'] }
    await pages.resolveDocument('/guide/')
    expect(mocks.render).toHaveBeenCalledTimes(1)
    current = { ...current, changedPages: [current.graph.pages[0]!.sourceRelativePath] }
    await pages.resolveDocument('/guide/')
    expect(mocks.render).toHaveBeenCalledTimes(2)
    current = { ...current, renderHtml: true }
    expect(await pages.resolveDocument('/guide/')).toBeUndefined()
    current = { ...current, renderHtml: false }
    await pages.resolveDocument('/guide/')
    expect(mocks.render).toHaveBeenCalledTimes(3)
    await pages.close()
  })
  it('deduplicates route aliases without rendering unknown routes, and refreshes on the next revision', async () => {
    let current: BuildResult | undefined
    const pages = createDevPages('/project', createMarkdownRenderer(), () => current)
    expect(await pages.resolveDocument('/guide/')).toBeUndefined()
    current = state()
    expect(await pages.resolveDocument('/missing/')).toBeUndefined()
    expect(await Promise.all(['/guide/', '/guide', '/guide/index.html'].map(pages.resolveDocument))).toEqual(
      Array(3).fill('<p>Current</p>')
    )
    expect(mocks.render).toHaveBeenCalledTimes(1)
    current = state()
    await pages.resolveDocument('/guide/')
    expect(mocks.render).toHaveBeenCalledTimes(2)
    await pages.close()
    expect(await pages.resolveDocument('/guide/')).toBeUndefined()
  })

  it('never publishes old HTML if a build completes during rendering', async () => {
    let release!: (value: { html: string }) => void
    mocks.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    let current = state()
    const pages = createDevPages('/project', createMarkdownRenderer(), () => current)
    const pending = pages.resolveDocument('/guide/')
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1))
    current = state()
    mocks.render.mockResolvedValue({ html: '<p>Latest</p>' })
    release({ html: '<p>Stale</p>' })
    expect(await pending).toBe('<p>Latest</p>')
    expect(await pages.resolveDocument('/guide/')).toBe('<p>Latest</p>')
    expect(mocks.render).toHaveBeenCalledTimes(2)
    await pages.close()
  })

  it('evicts oversized output and rejects failures without poisoning retries', async () => {
    const current = state()
    const pages = createDevPages('/project', createMarkdownRenderer(), () => current)
    mocks.render.mockRejectedValueOnce(new Error('render failed'))
    await expect(pages.resolveDocument('/guide/')).rejects.toThrow('render failed')
    mocks.render.mockResolvedValueOnce({ html: randomBytes(9 * 1024 * 1024).toString('base64') })
    await pages.resolveDocument('/guide/')
    expect(await pages.resolveDocument('/guide/')).toBe('<p>Current</p>')
    expect(mocks.render).toHaveBeenCalledTimes(3)
    await pages.close()
  })
})
