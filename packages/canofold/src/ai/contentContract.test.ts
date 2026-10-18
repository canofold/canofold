import { describe, expect, it } from 'vitest'
import { createMockGraph, createMockPage } from '../../test/fixtures'
import { defaultConfig } from '../config/defaults'
import { createContentCollection } from './contentContract'

describe('document consumption contract', () => {
  const page = createMockPage({ relativePath: 'zh/guide.md', body: '# Guide' })
  const collect = (pages = [page], config = defaultConfig) =>
    createContentCollection(config, createMockGraph({ pages }))

  it('keeps identity independent of deployment, title, shard budgets and rebuilds', () => {
    const original = collect().pages[0]!
    const moved = collect([{ ...page, title: 'Changed', body: '# Changed' }], {
      ...defaultConfig,
      basePath: '/new/',
      ai: { ...defaultConfig.ai, chunkSizeBytes: 16384 }
    }).pages[0]!
    expect(moved.id).toBe(original.id)
    expect(moved.revision).not.toBe(original.revision)
    expect(collect().pages[0]).toEqual(original)
    expect(collect([{ ...page, relativePath: 'zh/renamed.md' }]).pages[0]!.id).not.toBe(original.id)
    expect(collect([{ ...page, locale: 'en' }]).pages[0]!.id).not.toBe(original.id)
  })

  it('separates authored source, transformed source and observed content changes', () => {
    const original = collect().pages[0]!
    const transformed = collect([{ ...page, transformedSource: '# Transformed', body: '# Transformed' }])
      .pages[0]!
    expect(transformed.source.revision).toBe(original.source.revision)
    if (!('transformedRevision' in transformed.source) || !('transformedRevision' in original.source)) {
      throw new Error('Authored Markdown must retain its transformed source revision')
    }
    expect(transformed.source.transformedRevision).not.toBe(original.source.transformedRevision)
    expect(transformed.representation.fingerprint).not.toBe(original.representation.fingerprint)
    expect(transformed.revision).not.toBe(original.revision)
  })

  it('keeps a Unicode source identity stable across filesystem path representations', () => {
    const composed = collect([{ ...page, relativePath: 'zh/caf\u00e9 中文 100%.md' }]).pages[0]!
    const decomposed = collect([{ ...page, relativePath: 'zh\\cafe\u0301 中文 100%.md' }]).pages[0]!
    expect(decomposed.source.path).toBe('caf\u00e9 中文 100%.md')
    expect(decomposed.id).toBe(composed.id)
    expect(decomposed.revision).toBe(composed.revision)
    expect(() =>
      collect([
        { ...page, relativePath: 'zh/caf\u00e9.md' },
        { ...page, relativePath: 'zh/cafe\u0301.md', routePath: '/other/' }
      ])
    ).toThrow('Duplicate document identity')
  })

  it('publishes static coverage and safe provenance, not private metadata or absolute paths', () => {
    const record = collect([
      {
        ...page,
        relativePath: 'zh/example.mdx',
        sourcePath: '/private/secret/example.mdx',
        frontmatter: { title: 'Public', apiKey: 'hidden' }
      }
    ]).pages[0]!
    expect(record.source.path).toBe('example.mdx')
    expect(record.representation.analysis).toBe('mdx-static-only')
    expect(JSON.stringify(record)).not.toMatch(/hidden|\/private\/secret/)
  })

  it('excludes drafts and ai:false and makes selection and capabilities explicit', () => {
    const collection = collect([
      page,
      { ...page, relativePath: 'draft.md', status: 'draft' },
      { ...page, relativePath: 'excluded.md', ai: false }
    ])
    expect(collection.pages).toHaveLength(1)
    expect(collection.schemaVersion).toBe(3)
    expect(collection.scope).toMatchObject({ space: null, versions: ['current'], locales: ['zh'] })
    expect(collection.outputs.aiFullContent).toBe(true)
  })

  it('rejects duplicate logical identities instead of publishing ambiguous records', () => {
    expect(() => collect([page, { ...page, routePath: '/duplicate/' }])).toThrow(
      'Duplicate document identity'
    )
  })

  it('tracks declared plugin configuration without publishing its private inputs', () => {
    const original = collect().pages[0]!
    const changed = collect([page], {
      ...defaultConfig,
      extensions: [{ resolve: './private-extension.ts', options: { secret: 'not-public' } }]
    }).pages[0]!
    expect(changed.id).toBe(original.id)
    expect(changed.representation.declaredInputsRevision).not.toBe(
      original.representation.declaredInputsRevision
    )
    expect(JSON.stringify(changed)).not.toContain('not-public')
    expect(JSON.stringify(changed)).not.toContain('private-extension')
  })
})
