import { describe, expect, it } from 'vitest'
import { planBuild } from './invalidation'
import { BUILD_MANIFEST_SCHEMA_VERSION, type BuildManifest } from './types'

function manifest({
  build = 'build-a',
  shared = 'shared-a',
  pages = { 'docs/index.md': 'page-a' }
}: {
  build?: string
  shared?: string
  pages?: Record<string, string>
} = {}): BuildManifest {
  return {
    schemaVersion: BUILD_MANIFEST_SCHEMA_VERSION,
    docfuseVersion: '0.1.0',
    buildFingerprint: build,
    sharedFingerprint: shared,
    pages: Object.fromEntries(
      Object.entries(pages).map(([path, fingerprint]) => [
        path,
        {
          fingerprint,
          outputPath: `${path}.html`,
          markdownOutputPath: `${path}.raw.md`,
          assetOutputPaths: []
        }
      ])
    ),
    outputs: { 'index.html': { fingerprint: 'output-a', size: 1 } }
  }
}

describe('planBuild', () => {
  it('selects clean builds for missing state, invalid output, forced builds, and shared changes', () => {
    const current = manifest()
    expect(planBuild({ current, outputExists: true }).mode).toBe('clean')
    expect(planBuild({ current, previous: current, outputExists: false }).reason).toBe('missing-output')
    expect(planBuild({ current, previous: current, outputExists: true, outputValid: false }).reason).toBe(
      'invalid-output'
    )
    expect(planBuild({ current, previous: current, outputExists: true, forceClean: true }).reason).toBe(
      'forced'
    )
    expect(
      planBuild({
        current: manifest({ build: 'build-b', shared: 'shared-b' }),
        previous: current,
        outputExists: true
      }).reason
    ).toBe('shared-inputs-changed')
  })

  it('selects cache hits and computes changed and removed page sets', () => {
    const previous = manifest({ pages: { 'docs/a.md': 'a', 'docs/removed.md': 'removed' } })
    expect(planBuild({ current: previous, previous, outputExists: true }).mode).toBe('cached')

    const plan = planBuild({
      current: manifest({ build: 'build-b', pages: { 'docs/a.md': 'changed', 'docs/new.md': 'new' } }),
      previous,
      outputExists: true
    })
    expect(plan).toMatchObject({
      mode: 'incremental',
      changedPageKeys: ['docs/a.md', 'docs/new.md'],
      removedPageKeys: ['docs/removed.md']
    })
  })

  it('falls back to a clean build when a changed build fingerprint has no classified page change', () => {
    const previous = manifest({ build: 'build-a' })
    const current = manifest({ build: 'build-b' })

    expect(planBuild({ current, previous, outputExists: true })).toMatchObject({
      mode: 'clean',
      changedPageKeys: ['docs/index.md'],
      removedPageKeys: [],
      reason: 'unclassified-inputs-changed'
    })
  })
})
