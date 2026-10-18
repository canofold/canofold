import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { trackedMkdtemp } from '../../test/fixtures'
import { runBuild } from './build'
import { runCheck } from './check'
import { runSnapshot } from './snapshot'
import { queryCompactIndex } from '../search/queryCompact'

const adapterUrl = new URL('../../../plugins/dist/openapi.js', import.meta.url).href
const input = {
  id: 'pets',
  root: 'docs/api',
  entry: 'docs/api/openapi.json',
  version: 'current',
  locale: 'zh',
  base: '/api/'
}
const spec = () => ({
  openapi: '3.1.0',
  info: { title: 'Pet API', version: '1' },
  paths: {
    '/pets': {
      get: {
        summary: 'List pets',
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': { schema: { $ref: './pet.yaml' } }
            }
          }
        }
      }
    }
  }
})

async function fixture() {
  const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-source-lifecycle-'))
  await mkdir(join(cwd, 'docs/api'), { recursive: true })
  await writeFile(join(cwd, 'docs/index.md'), '---\ntitle: Home\ndescription: Documentation.\n---\n# Home\n')
  await writeFile(join(cwd, 'docs/api/openapi.json'), JSON.stringify(spec()))
  await writeFile(join(cwd, 'docs/api/pet.yaml'), 'type: object\nproperties:\n  id:\n    type: string\n')
  async function configure(options: { sources?: Array<typeof input>; versions?: unknown[] } = {}) {
    await writeFile(
      join(cwd, 'canofold.config.mjs'),
      `
      const { openapi } = await import(new URL(${JSON.stringify(adapterUrl)}).href)
      export default { sources: ${JSON.stringify(options.sources ?? [input])}.map(openapi),
        ${options.versions ? `versions: ${JSON.stringify(options.versions)},` : ''}
        ai: { contentSpace: 'source-lifecycle', versions: 'all' }
      }`
    )
  }
  await configure()
  const dist = join(cwd, '.canofold/dist')
  const collection = async () => JSON.parse(await readFile(join(dist, 'ai/pages.json'), 'utf8'))
  return { cwd, dist, configure, collection }
}

describe('OpenAPI build lifecycle', () => {
  it('distinguishes generated diagnostic positions from entry-document pointers', async () => {
    const { cwd } = await fixture()
    await writeFile(
      join(cwd, 'canofold.config.mjs'),
      `export default { sources: [{ ...${JSON.stringify(input)}, kind: 'example', revision: '1', cacheKey: {},
        async load() { return [{ key: 'operation', path: '', pointer: '/paths/~1pets/get', title: 'Example',
          description: 'Example.', body: '# Example\\n\\n[Broken](/missing/)' }] }
      }] }`
    )
    const previousExitCode = process.exitCode
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const issues = await runCheck({ cwd, format: 'json' })
      expect(issues).toContainEqual(
        expect.objectContaining({
          page: 'docs/api/openapi.json',
          sourcePointer: '/paths/~1pets/get',
          ruleId: 'broken-link',
          message: expect.stringContaining('Generated Markdown at 3')
        })
      )
      expect(issues.find((issue) => issue.sourcePointer)?.line).toBeUndefined()
    } finally {
      process.exitCode = previousExitCode
      vi.restoreAllMocks()
    }
  })
  it('keeps Markdown and entry-byte identity, invalidates referenced changes and removes all departed artifacts', async () => {
    const { cwd, dist, collection, configure } = await fixture()
    const first = await runBuild({ cwd })
    const before = await collection()
    const operation = before.pages.find(
      (page: { source: { key?: string } }) => page.source.key === 'GET /pets'
    )
    expect(first.graph.pages).toHaveLength(3)
    const search = JSON.parse(await readFile(join(dist, 'search/zh.json'), 'utf8'))
    expect(queryCompactIndex('GET pets', search).some((page) => page.routePath === operation.routePath)).toBe(
      true
    )
    expect((await runBuild({ cwd })).cached).toBe(true)
    expect((await runCheck({ cwd })).filter((issue) => issue.severity === 'error')).toEqual([])
    await writeFile(join(cwd, 'docs/api/pet.yaml'), 'type: object\nproperties:\n  id:\n    type: integer\n')
    const updated = await runBuild({ cwd })
    const after = await collection()
    const changed = after.pages.find((page: { id: string }) => page.id === operation.id)
    expect(changed.source.revision).toBe(operation.source.revision)
    expect(changed.source.dependenciesRevision).not.toBe(operation.source.dependenciesRevision)
    expect(changed.representation.fingerprint).not.toBe(operation.representation.fingerprint)
    expect(updated.changedPages).not.toContain('docs/index.md')
    expect(after.pages.find((page: { source: { kind: string } }) => page.source.kind === 'markdown')).toEqual(
      before.pages.find((page: { source: { kind: string } }) => page.source.kind === 'markdown')
    )
    const htmlPath = join(dist, operation.routePath, 'index.html')
    expect(await readFile(htmlPath, 'utf8')).toContain('integer')
    await writeFile(join(cwd, 'docs/api/openapi.json'), JSON.stringify({ ...spec(), paths: {} }))
    await runBuild({ cwd })
    expect((await collection()).pages).toHaveLength(2)
    await expect(readFile(htmlPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(dist, operation.routePath, 'index.md'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await configure({ sources: [] })
    await runBuild({ cwd })
    expect((await collection()).pages).toHaveLength(1)
    await expect(readFile(join(dist, 'api/index.html'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves the complete published output and trusted manifest through failure, then recovers', async () => {
    const { cwd, dist, collection } = await fixture()
    await runBuild({ cwd })
    const before = await collection()
    const manifest = await readFile(join(dist, 'ai/manifest.json'))
    const cache = await readFile(join(cwd, '.canofold/cache/build-manifest.json'))
    await unlink(join(cwd, 'docs/api/pet.yaml'))
    await expect(runBuild({ cwd })).rejects.toThrow()
    expect(await collection()).toEqual(before)
    expect(await readFile(join(dist, 'ai/manifest.json'))).toEqual(manifest)
    expect(await readFile(join(cwd, '.canofold/cache/build-manifest.json'))).toEqual(cache)
    await writeFile(join(cwd, 'docs/api/pet.yaml'), 'type: boolean\n')
    await expect(runBuild({ cwd })).resolves.toMatchObject({ cached: false })
    expect((await collection()).snapshotRevision).not.toBe(before.snapshotRevision)
  })

  it('freezes source inputs and refs in a snapshot, isolates versions and rejects borrowed current refs', async () => {
    const { cwd, configure, collection } = await fixture()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      await runSnapshot({ cwd, id: 'v0.8' })
      const historical = {
        ...input,
        root: 'versions/v0.8/api',
        entry: 'versions/v0.8/api/openapi.json',
        version: 'v0.8'
      }
      const versions = [
        { id: 'current', label: 'Current', docsDir: 'docs', base: '/' },
        { id: 'v0.8', label: '0.8', docsDir: 'versions/v0.8', base: '/v0.8/' }
      ]
      await configure({ versions, sources: [input, historical] })
      await runBuild({ cwd })
      const before = (await collection()).pages.filter((page: { version: string }) => page.version === 'v0.8')
      await writeFile(join(cwd, 'docs/api/pet.yaml'), 'type: integer\n')
      await runBuild({ cwd })
      expect(
        (await collection()).pages.filter((page: { version: string }) => page.version === 'v0.8')
      ).toEqual(before)
      await configure({ versions, sources: [input, { ...input, version: 'v0.8' }] })
      await expect(runBuild({ cwd })).rejects.toThrow('Historical source dependencies')
    } finally {
      vi.restoreAllMocks()
    }
  })
})
