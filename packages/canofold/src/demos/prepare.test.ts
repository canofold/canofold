import { describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../config/defaults'
import type { ContentGraph } from '../content/types'
import { prepareDemoManifest } from './prepare'

const emptyGraph = { pages: [] } as unknown as ContentGraph

describe('prepareDemoManifest', () => {
  it('does nothing for a site without demos', async () => {
    await expect(
      prepareDemoManifest({ cwd: '/project', config: defaultConfig, graph: emptyGraph, mode: 'build' })
    ).resolves.toBeUndefined()
  })

  it('requires an engine when demo declarations exist', async () => {
    const graph = {
      pages: [{ demos: [{ id: 'demo' }] }]
    } as unknown as ContentGraph
    await expect(
      prepareDemoManifest({ cwd: '/project', config: defaultConfig, graph, mode: 'build' })
    ).rejects.toThrow('no demos.engine is configured')
  })

  it('delegates preparation to the configured engine', async () => {
    const prepare = vi.fn(async () => ({ clientUrl: '/client.js', demos: {} }))
    const config = { ...defaultConfig, demos: { engine: { id: 'test', prepare } } }
    await prepareDemoManifest({ cwd: '/project', config, graph: emptyGraph, mode: 'dev' })
    expect(prepare).not.toHaveBeenCalled()

    const graph = {
      pages: [{ demos: [{ id: 'demo', specifier: './demo.tsx' }] }]
    } as unknown as ContentGraph
    await prepareDemoManifest({ cwd: '/project', config, graph, mode: 'dev' })
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/project',
        mode: 'dev',
        demos: [expect.objectContaining({ id: 'demo' })]
      })
    )
  })
})
