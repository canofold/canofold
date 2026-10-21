import { mkdir, symlink, truncate, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMockConfig, trackedMkdtemp } from '../../test/fixtures'
import { buildContentGraph } from './graph'
import { createContentCollection } from '../ai/contentContract'
import { buildPageKey } from '../build/state'
import type { ContentSource } from './source'

async function fixture() {
  const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-source-'))
  await mkdir(join(cwd, 'docs/api'), { recursive: true })
  await writeFile(join(cwd, 'docs/index.md'), '# Home')
  await writeFile(join(cwd, 'docs/api/schema.json'), '{"version":1}')
  const source: ContentSource = {
    id: 'test-api',
    kind: 'openapi',
    revision: '1',
    root: 'docs/api',
    entry: 'docs/api/schema.json',
    version: 'current',
    locale: 'zh',
    base: '/api/',
    cacheKey: {},
    async load(context) {
      await context.read(context.entry)
      return [
        { key: 'overview', path: '', pointer: '', title: 'API', description: 'API reference', body: '# API' },
        {
          key: 'get /pets',
          path: 'get-pets/',
          pointer: '/paths/~1pets/get',
          title: 'GET /pets',
          description: 'List pets',
          body: '# GET /pets'
        }
      ]
    }
  }
  return { cwd, source, config: createMockConfig({ sources: [source] }) }
}

describe('build-time content sources', () => {
  it('only collects explicit input diagnostics and rejects forged paths or positions', async () => {
    const { cwd, config, source } = await fixture()
    const diagnostics: import('../check/diagnostics').CheckDiagnostic[] = []
    source.load = async (context) =>
      context.fail({ message: 'Repair input', pointer: '/version', line: 1, column: 2 })
    const graph = await buildContentGraph(cwd, config, undefined, { diagnostics })
    expect(graph.pages).toHaveLength(1)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ page: source.entry, sourcePointer: '/version', line: 1, column: 2 })
    )
    source.load = async (context) => context.fail({ message: 'Invalid', file: '../index.md' })
    await expect(buildContentGraph(cwd, config, undefined, { diagnostics: [] })).rejects.toThrow(
      'tracked input'
    )
    source.load = async (context) => context.fail({ message: 'Invalid', column: 1 })
    await expect(buildContentGraph(cwd, config, undefined, { diagnostics: [] })).rejects.toThrow(
      'invalid position'
    )
    source.load = async () => {
      throw new Error('Adapter bug')
    }
    await expect(buildContentGraph(cwd, config, undefined, { diagnostics: [] })).rejects.toThrow(
      'Adapter bug'
    )
  })

  it('projects multiple documents without inventing physical files or changing Markdown identity', async () => {
    const { cwd, config } = await fixture()
    const graph = await buildContentGraph(cwd, config)
    expect(graph.pages.map((page) => page.routePath)).toEqual(['/', '/api/', '/api/get-pets/'])
    const [home, overview, operation] = graph.pages
    expect(overview!.sourcePath).toBe(operation!.sourcePath)
    expect(new Set(graph.pages.map(buildPageKey)).size).toBe(3)
    const collection = createContentCollection(config, graph)
    expect(collection.schemaVersion).toBe(3)
    expect(collection.pages[2]!.source).toMatchObject({ kind: 'openapi', pointer: '/paths/~1pets/get' })
    expect(collection.pages[2]!.representation.body).toBe('source-derived-markdown')
    expect(collection.pages[0]!.id).toBe(
      createContentCollection(config, { ...graph, pages: [home!] }).pages[0]!.id
    )
  })

  it('keeps identity stable across titles and routes while tracking dependencies independently', async () => {
    const { cwd, config, source } = await fixture()
    const before = createContentCollection(config, await buildContentGraph(cwd, config))
    source.base = '/reference/'
    await writeFile(join(cwd, source.entry), '{"version":2}')
    const after = createContentCollection(config, await buildContentGraph(cwd, config))
    expect(after.pages[1]!.id).toBe(before.pages[1]!.id)
    expect(after.pages[1]!.source.revision).not.toBe(before.pages[1]!.source.revision)
    expect(after.pages[1]!.representation.fingerprint).toBe(before.pages[1]!.representation.fingerprint)
  })

  it('rejects traversal, symlinks, unknown bindings, duplicate identities and collisions', async () => {
    const { cwd, config, source } = await fixture()
    source.entry = 'docs/index.md'
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('escapes root')
    source.entry = 'docs/api/link.json'
    await symlink(join(cwd, 'docs/api/schema.json'), join(cwd, source.entry))
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('symbolic links')
    await unlink(join(cwd, source.entry))
    source.entry = 'docs/api/schema.json'
    source.locale = 'unknown'
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('Unknown locale')
    source.locale = 'zh'
    config.sources.push(source)
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('Duplicate content source')
    config.sources.pop()
    source.base = '/'
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('Duplicate route')
  })

  it('rejects historical sources borrowing current dependencies', async () => {
    const { cwd, config, source } = await fixture()
    await mkdir(join(cwd, 'versions/old'), { recursive: true })
    await writeFile(join(cwd, 'versions/old/index.md'), '# Old')
    config.versions = [
      { id: 'current', label: 'Current', docsDir: 'docs', base: '/' },
      { id: 'old', label: 'Old', docsDir: 'versions/old', base: '/old/' }
    ]
    source.version = 'old'
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('Historical source dependencies')
  })

  it.each(['markdown', 'mdx'])('does not let a derived source masquerade as authored %s', async (kind) => {
    const { cwd, source, config } = await fixture()
    source.kind = kind
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('reserved for authored documents')
  })

  it('canonicalizes a Unicode/literal-percent base once, independently of navigation grouping', async () => {
    const { cwd, source, config } = await fixture()
    source.base = '/接口 100%25/'
    const graph = await buildContentGraph(cwd, config)
    expect(graph.pages[1]!.routePath).toBe('/%E6%8E%A5%E5%8F%A3%20100%25/')
    expect(graph.pages[1]!.outputPath).toBe('接口 100%/index.html')
    expect(graph.sidebar.current!.zh![0]!.segment).toBe('接口 100%')
  })

  it('rejects oversized files, invalid UTF-8 and non-file inputs before adapting content', async () => {
    const { cwd, source, config } = await fixture()
    const entry = join(cwd, source.entry)
    await truncate(entry, 16 * 1024 * 1024 + 1)
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('file limit')
    await writeFile(entry, Buffer.from([0xff]))
    await expect(buildContentGraph(cwd, config)).rejects.toThrow(/encoded data/)
    source.entry = 'docs/api'
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('regular file')
  })

  it('deduplicates concurrent input reads and enforces the distinct-file budget', async () => {
    const { cwd, source, config } = await fixture()
    const load = source.load
    source.load = async (context) => {
      const copies = await Promise.all(Array.from({ length: 600 }, () => context.read(context.entry)))
      expect(new Set(copies).size).toBe(1)
      return load(context)
    }
    expect((await buildContentGraph(cwd, config)).pages[1]!.origin!.dependencies).toHaveLength(1)
    await Promise.all(
      Array.from({ length: 512 }, (_, index) => writeFile(join(cwd, `docs/api/${index}.json`), '{}'))
    )
    source.load = async (context) => {
      for (let index = 0; index < 512; index++) await context.read(`${index}.json`)
      return load(context)
    }
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('file count limit')
  })

  it('enforces the aggregate source-byte budget, including concurrent reads', async () => {
    const { cwd, source, config } = await fixture()
    const files = Array.from({ length: 4 }, (_, index) => `${index}.txt`)
    for (const file of files) {
      const path = join(cwd, 'docs/api', file)
      await writeFile(path, '')
      await truncate(path, 16 * 1024 * 1024)
    }
    source.load = async (context) => {
      // Four maximum-sized files plus the entry exceed the source budget.
      await Promise.all(files.map((file) => context.read(file)))
      return []
    }
    await expect(buildContentGraph(cwd, config)).rejects.toThrow('Source inputs exceed')
  })
})
