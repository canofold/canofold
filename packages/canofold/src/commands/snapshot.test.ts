import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { runSnapshot } from './snapshot'
import { loadConfig } from '../config/load'
import { buildContentGraph } from '../content/graph'
import { prepareDemoManifest } from '../demos/prepare'

describe('runSnapshot', () => {
  it('copies bilingual content without rewriting TypeScript config and preserves historical routes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-snapshot-'))
    await mkdir(join(cwd, 'docs/en'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# 当前')
    await writeFile(join(cwd, 'docs/en/index.md'), '# Current')
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { i18n: { locales: ['zh', 'en'] } }`)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runSnapshot({ cwd, id: 'v1' })
    expect(await readFile(join(cwd, 'versions/v1/en/index.md'), 'utf8')).toBe('# Current')
    expect(await readFile(join(cwd, 'canofold.config.ts'), 'utf8')).not.toContain('versions:')

    await writeFile(join(cwd, 'docs/index.md'), '# 新版')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        i18n: { locales: ['zh', 'en'] },
        versions: { current: 'v2', items: [
          { id: 'v2', label: 'v2', docsDir: 'docs', base: '/' },
          { id: 'v1', label: 'v1', docsDir: 'versions/v1', base: '/v1/' }
        ] }
      }`
    )
    const graph = await buildContentGraph(cwd, await loadConfig(cwd))
    expect(graph.pages.map((page) => [page.routePath, page.title]).sort()).toEqual([
      ['/', '新版'],
      ['/en/', 'Current'],
      ['/v1/', '当前'],
      ['/v1/en/', 'Current']
    ])
    vi.restoreAllMocks()
  })

  it('refuses drafts and does not create a partial snapshot', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-snapshot-draft-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/draft.md'), '---\nstatus: draft\n---\n# Draft')

    await expect(runSnapshot({ cwd, id: 'v1' })).rejects.toThrow('Publish or remove drafts')
    await expect(readFile(join(cwd, 'versions/v1/index.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps a version-local Demo source independent of later current edits', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-snapshot-local-demo-'))
    await mkdir(join(cwd, 'docs/demo'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n::demo[Example]{src="./demo/basic.tsx"}')
    await writeFile(join(cwd, 'docs/demo/basic.tsx'), 'export default function Demo() { return "old" }')
    const engine = `import { readFile } from 'node:fs/promises'
      import { dirname, resolve } from 'node:path'
      const engine = { id: 'fixture', async prepare(context) {
        const demos = Object.fromEntries(await Promise.all(context.demos.map(async (demo) => {
          const modulePath = resolve(dirname(demo.pageSourcePath), demo.specifier)
          return [demo.id, { ...demo, modulePath, dependencyPaths: [modulePath],
            source: await readFile(modulePath, 'utf8'), language: 'tsx' }]
        })))
        return { clientUrl: '/demo.js', demos }
      } }
      export default { demos: { engine }`
    await writeFile(join(cwd, 'canofold.config.ts'), `${engine} }`)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runSnapshot({ cwd, id: 'v1' })
    await writeFile(join(cwd, 'docs/demo/basic.tsx'), 'export default function Demo() { return "new" }')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `${engine}, versions: { current: 'v2', items: [
        { id: 'v2', label: 'v2', docsDir: 'docs', base: '/' },
        { id: 'v1', label: 'v1', docsDir: 'versions/v1', base: '/v1/' }
      ] } }`
    )
    const config = await loadConfig(cwd)
    const graph = await buildContentGraph(cwd, config)
    const manifest = await prepareDemoManifest({ cwd, config, graph, mode: 'analyze' })
    const sources = Object.values(manifest?.demos ?? {}).map((demo) => [demo.routePath, demo.source])
    expect(sources).toContainEqual(['/', 'export default function Demo() { return "new" }'])
    expect(sources).toContainEqual(['/v1/', 'export default function Demo() { return "old" }'])
    vi.restoreAllMocks()
  })

  it('refuses a Demo outside the versioned docs tree', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-snapshot-demo-'))
    await mkdir(join(cwd, 'docs'))
    await mkdir(join(cwd, 'src'))
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n::demo[Test]{src="../src/demo.tsx"}')
    await writeFile(join(cwd, 'src/demo.tsx'), 'export default function Demo() { return null }')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `import { resolve } from 'node:path'
       export default { demos: { engine: { id: 'fixture', async prepare(context) {
         return { clientUrl: '/demo.js', demos: Object.fromEntries(context.demos.map((demo) => [demo.id,
           { ...demo, modulePath: resolve(context.cwd, 'src/demo.tsx'), dependencyPaths: [resolve(context.cwd, 'src/demo.tsx')], source: 'export default null', language: 'tsx' }
         ])) }
       } } } }`
    )

    await expect(runSnapshot({ cwd, id: 'v1' })).rejects.toThrow('Historical page depends on a file outside')
  })
})
