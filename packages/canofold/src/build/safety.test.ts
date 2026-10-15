import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMockConfig, trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { resolveSafeOutputRoot } from './safety'

describe('build path safety', () => {
  it.each(['.canofold/tmp', '.canofold/.dist.backup'])(
    'rejects source documents placed in generated work directories: %s',
    async (docsDir) => {
      const cwd = await mkdtemp(join(tmpdir(), 'canofold-work-paths-'))
      const config = createMockConfig({
        versions: {
          current: 'current',
          items: [{ id: 'current', label: 'Current', docsDir, base: '/' }]
        }
      })
      await expect(resolveSafeOutputRoot(cwd, config, join(cwd, '.canofold/cache'))).rejects.toThrow(
        'must not overlap'
      )
    }
  )

  it('rejects output and styles overlapping temporary build files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-work-output-'))
    const cacheRoot = join(cwd, '.canofold/cache')
    await expect(
      resolveSafeOutputRoot(cwd, createMockConfig({ outputDir: '.canofold/tmp/site' }), cacheRoot)
    ).rejects.toThrow('must not overlap')
    await expect(
      resolveSafeOutputRoot(cwd, createMockConfig({ styles: ['.canofold/tmp/theme.css'] }), cacheRoot)
    ).rejects.toThrow('must not overlap')
  })

  it('accepts disjoint document, style, cache, and output paths', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-safe-paths-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })

    await expect(
      resolveSafeOutputRoot(
        cwd,
        createMockConfig({ styles: ['styles/theme.css'] }),
        join(cwd, '.canofold/cache')
      )
    ).resolves.toBe(join(cwd, '.canofold/dist'))
  })

  it('rejects style entries that overlap generated output or build cache', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-style-safety-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const cacheRoot = join(cwd, '.canofold/cache')

    await expect(
      resolveSafeOutputRoot(cwd, createMockConfig({ styles: ['.canofold/dist/theme.css'] }), cacheRoot)
    ).rejects.toThrow('styles[0] must not overlap outputDir')
    await expect(
      resolveSafeOutputRoot(cwd, createMockConfig({ styles: ['.canofold/cache/theme.css'] }), cacheRoot)
    ).rejects.toThrow('styles[0] must not overlap build cache')
  })

  it('rejects style entries outside the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-style-escape-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })

    await expect(
      resolveSafeOutputRoot(
        cwd,
        createMockConfig({ styles: ['../outside.css'] }),
        join(cwd, '.canofold/cache')
      )
    ).rejects.toThrow('styles[0] must resolve to a path inside the project root')
  })
})
