import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMockConfig, trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { resolveSafeOutputRoot } from './safety'

describe('build path safety', () => {
  it('accepts disjoint document, style, cache, and output paths', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-safe-paths-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })

    await expect(
      resolveSafeOutputRoot(
        cwd,
        createMockConfig({ styles: ['styles/theme.css'] }),
        join(cwd, '.docfuse/cache')
      )
    ).resolves.toBe(join(cwd, '.docfuse/dist'))
  })

  it('rejects style entries that overlap generated output or build cache', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-style-safety-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const cacheRoot = join(cwd, '.docfuse/cache')

    await expect(
      resolveSafeOutputRoot(cwd, createMockConfig({ styles: ['.docfuse/dist/theme.css'] }), cacheRoot)
    ).rejects.toThrow('styles[0] must not overlap outputDir')
    await expect(
      resolveSafeOutputRoot(cwd, createMockConfig({ styles: ['.docfuse/cache/theme.css'] }), cacheRoot)
    ).rejects.toThrow('styles[0] must not overlap build cache')
  })

  it('rejects style entries outside the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-style-escape-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })

    await expect(
      resolveSafeOutputRoot(
        cwd,
        createMockConfig({ styles: ['../outside.css'] }),
        join(cwd, '.docfuse/cache')
      )
    ).rejects.toThrow('styles[0] must resolve to a path inside the project root')
  })
})
