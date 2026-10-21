import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve as resolveModule } from 'import-meta-resolve'
import { describe, expect, it, vi } from 'vitest'
import {
  createMockConfig,
  createMockGraph,
  createMockPage,
  trackedMkdtemp as mkdtemp
} from '../../test/fixtures'
import { buildPageKey, createBuildManifest, fingerprintExistingFiles } from './state'

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

describe('build state support-file fingerprints', () => {
  it('resolves derived content dependencies from the project, not the caller working directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-source-paths-'))
    await mkdir(join(cwd, 'docs'))
    const page = createMockPage({
      sourcePath: join(cwd, 'api.json'),
      sourceRelativePath: 'api.json',
      origin: {
        id: 'api',
        kind: 'openapi',
        key: 'operation',
        pointer: '/paths',
        adapterRevision: '1',
        optionsRevision: 'options',
        dependencies: [
          { path: 'api.json', revision: 'entry' },
          { path: 'schemas/model.json', revision: 'model' }
        ],
        dependenciesRevision: 'dependencies',
        facts: {}
      }
    })
    const manifest = await createBuildManifest(
      cwd,
      createMockConfig(),
      createMockGraph({ pages: [page] }),
      undefined,
      undefined,
      'dev-request'
    )
    expect(manifest.contentDependencyPaths.filter((path) => path.endsWith('.json'))).toEqual([
      'api.json',
      'schemas/model.json'
    ])
  })
  it.each(['stylesheet', 'public'] as const)(
    'keeps Core %s inputs invalidated when imported by a hot Demo',
    async (kind) => {
      const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-overlap-'))
      await mkdir(join(cwd, 'docs/public'), { recursive: true })
      const entry = join(cwd, 'docs/demo.tsx')
      const asset = join(cwd, kind === 'stylesheet' ? 'docs/shared.css' : 'docs/public/shared.css')
      await writeFile(entry, 'export default () => null')
      await writeFile(asset, 'button { color: red }')
      const demo = {
        id: 'demo',
        specifier: './demo.tsx',
        sandbox: 'inline' as const,
        pageSourcePath: join(cwd, 'docs/index.md'),
        pageSourceRelativePath: 'docs/index.md',
        routePath: '/',
        locale: 'zh',
        modulePath: entry,
        dependencyPaths: [entry, asset],
        source: 'export default () => null',
        language: 'tsx' as const
      }
      const page = createMockPage({ sourcePath: join(cwd, 'docs/index.md'), demos: [demo] })
      const graph = createMockGraph({ pages: [page] })
      const config = createMockConfig({ styles: kind === 'stylesheet' ? ['docs/shared.css'] : [] })
      const manifest = { clientUrl: '/demo.js', hotReload: true as const, demos: { demo } }
      const first = await createBuildManifest(cwd, config, graph, undefined, manifest, 'dev-request')
      await writeFile(asset, 'button { color: blue }')
      const second = await createBuildManifest(cwd, config, graph, undefined, manifest, 'dev-request')
      expect(second.sharedFingerprint).not.toBe(first.sharedFingerprint)
      if (kind === 'stylesheet') expect(second.contentDependencyPaths).toContain('docs/shared.css')
    }
  )
  it('reads shared Demo dependencies once per manifest and refreshes them on the next build', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-shared-demo-'))
    await mkdir(join(cwd, 'docs'))
    const shared = join(cwd, 'shared.ts')
    await writeFile(shared, 'export const value = 1')
    const demos = Array.from({ length: 4 }, (_, index) => ({
      id: `demo-${index}`,
      specifier: '/shared.ts',
      sandbox: 'inline' as const,
      pageSourcePath: join(cwd, `docs/page-${index}.md`),
      pageSourceRelativePath: `docs/page-${index}.md`,
      routePath: `/page-${index}/`,
      locale: 'zh',
      modulePath: shared,
      moduleUrl: '/shared.ts',
      dependencyPaths: [shared, shared],
      source: '',
      language: 'ts' as const
    }))
    const pages = demos.map((demo) =>
      createMockPage({
        sourceRelativePath: demo.pageSourceRelativePath,
        demos: [demo, demo]
      })
    )
    const config = createMockConfig()
    const graph = createMockGraph({ pages })
    const manifest = {
      clientUrl: '/demo.js',
      demos: Object.fromEntries(demos.map((demo) => [demo.id, demo]))
    }
    const reads = vi.mocked(fs.readFile)
    reads.mockClear()
    const first = await createBuildManifest(cwd, config, graph, undefined, manifest)
    expect(reads.mock.calls.filter(([path]) => path === shared)).toHaveLength(1)
    await writeFile(shared, 'export const value = 2')
    reads.mockClear()
    const second = await createBuildManifest(cwd, config, graph, undefined, manifest)
    expect(reads.mock.calls.filter(([path]) => path === shared)).toHaveLength(1)
    for (const page of pages) {
      expect(second.pages[buildPageKey(page)]!.fingerprint).not.toBe(
        first.pages[buildPageKey(page)]!.fingerprint
      )
    }
  })
  it('recomputes navigation per version/locale without invalidating another locale', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-layout-'))
    await mkdir(join(cwd, 'docs'))
    const config = createMockConfig()
    const zh = createMockPage()
    const en = createMockPage({ locale: 'en', sourceRelativePath: 'docs/en/guide.md' })
    const graph = createMockGraph({
      pages: [zh, en],
      sidebar: { current: { zh: [{ segment: 'guide', title: 'Before', items: [] }], en: [] } }
    })
    const first = await createBuildManifest(cwd, config, graph)
    graph.sidebar.current!.zh![0]!.title = 'After'
    const second = await createBuildManifest(cwd, config, graph)
    expect(second.pages[buildPageKey(zh)]?.fingerprint).not.toBe(first.pages[buildPageKey(zh)]?.fingerprint)
    expect(second.pages[buildPageKey(en)]?.fingerprint).toBe(first.pages[buildPageKey(en)]?.fingerprint)
  })
  it('invalidates output when the installed Markdown renderer changes without a Core version change', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-runtime-'))
    await mkdir(join(cwd, 'docs'))
    const config = createMockConfig()
    const graph = createMockGraph()
    const first = await createBuildManifest(cwd, config, graph)
    const path = fileURLToPath(resolveModule('@canofold/markdown/server', import.meta.url))
    const { readFile: read } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    const spy = vi
      .spyOn(fs, 'readFile')
      .mockImplementation((...args: Parameters<typeof read>) =>
        String(args[0]) === path
          ? Promise.resolve(Buffer.from('changed renderer implementation'))
          : read(...args)
      )
    try {
      const second = await createBuildManifest(cwd, config, graph)
      expect(second.sharedFingerprint).not.toBe(first.sharedFingerprint)
    } finally {
      spy.mockRestore()
    }
  })
  it('ignores missing files but surfaces other read errors', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-files-'))
    const directory = join(cwd, 'directory')
    await mkdir(directory)

    await expect(fingerprintExistingFiles([join(cwd, 'missing.css')])).resolves.toBeTypeOf('string')
    await expect(fingerprintExistingFiles([directory])).rejects.toMatchObject({ code: 'EISDIR' })
  })

  it('invalidates shared assets when the site gains or loses its first playground', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-playground-'))
    await mkdir(join(cwd, 'docs'))
    const config = createMockConfig()
    const documentPage = createMockPage()
    const playgroundPage = createMockPage({ frontmatter: { layout: 'playground' } })

    const documentManifest = await createBuildManifest(
      cwd,
      config,
      createMockGraph({ pages: [documentPage] })
    )
    const playgroundManifest = await createBuildManifest(
      cwd,
      config,
      createMockGraph({ pages: [playgroundPage] })
    )

    expect(playgroundManifest.sharedFingerprint).not.toBe(documentManifest.sharedFingerprint)
  })

  it('invalidates only the owning page when a demo dependency changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-demo-'))
    await mkdir(join(cwd, 'docs'))
    await mkdir(join(cwd, 'src'))
    const entryPath = join(cwd, 'src/demo.tsx')
    const dependencyPath = join(cwd, 'src/button.tsx')
    await writeFile(entryPath, "import './button'; export default () => null")
    await writeFile(dependencyPath, 'export const Button = 1')
    const demo = {
      id: 'demo',
      specifier: '/src/demo.tsx',
      sandbox: 'inline' as const,
      pageSourcePath: join(cwd, 'docs/index.md'),
      pageSourceRelativePath: 'docs/index.md',
      routePath: '/',
      locale: 'zh',
      modulePath: entryPath,
      dependencyPaths: [entryPath, dependencyPath],
      source: "import './button'; export default () => null",
      language: 'tsx' as const
    }
    const page = createMockPage({ demos: [demo] })
    const graph = createMockGraph({ pages: [page] })
    const config = createMockConfig()
    const first = await createBuildManifest(cwd, config, graph, undefined, {
      clientUrl: '/demo.js',
      demos: { demo }
    })
    const hotManifest = { clientUrl: '/demo.js', hotReload: true as const, demos: { demo } }
    const hotBefore = await createBuildManifest(cwd, config, graph, undefined, hotManifest, 'dev-request')
    await writeFile(dependencyPath, 'export const Button = 2')
    const second = await createBuildManifest(cwd, config, graph, undefined, {
      clientUrl: '/demo.js',
      demos: { demo }
    })

    expect(second.sharedFingerprint).toBe(first.sharedFingerprint)
    expect(second.pages[buildPageKey(page)]?.fingerprint).not.toBe(
      first.pages[buildPageKey(page)]?.fingerprint
    )
    const hotAfter = await createBuildManifest(cwd, config, graph, undefined, hotManifest, 'dev-request')
    expect(hotAfter.buildFingerprint).toBe(hotBefore.buildFingerprint)
    await writeFile(entryPath, 'export default () => "Updated source"')
    const entryChanged = await createBuildManifest(cwd, config, graph, undefined, hotManifest, 'dev-request')
    expect(entryChanged.pages[buildPageKey(page)]?.fingerprint).not.toBe(
      hotAfter.pages[buildPageKey(page)]?.fingerprint
    )
  })

  it('invalidates shared assets when a demo setup dependency changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-demo-setup-'))
    await mkdir(join(cwd, 'docs'))
    const setupPath = join(cwd, 'demo.setup.tsx')
    await writeFile(setupPath, 'export default ({ children }) => children')
    const config = createMockConfig()
    const graph = createMockGraph()
    const first = await createBuildManifest(cwd, config, graph, undefined, {
      clientUrl: '/demo.js',
      demos: {},
      dependencyPaths: [setupPath]
    })
    await writeFile(setupPath, 'export default ({ children }) => <main>{children}</main>')
    const second = await createBuildManifest(cwd, config, graph, undefined, {
      clientUrl: '/demo.js',
      demos: {},
      dependencyPaths: [setupPath]
    })

    expect(second.sharedFingerprint).not.toBe(first.sharedFingerprint)
  })

  it('invalidates shared output when the demo runtime switches between build and dev delivery', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-demo-runtime-'))
    await mkdir(join(cwd, 'docs'))
    const config = createMockConfig()
    const graph = createMockGraph()
    const manifest = {
      clientUrl: '/@id/__x00__virtual:canofold-demo-client',
      demos: {}
    }
    const production = await createBuildManifest(cwd, config, graph, undefined, manifest, 'build')
    const development = await createBuildManifest(cwd, config, graph, undefined, manifest, 'dev')

    expect(development.sharedFingerprint).not.toBe(production.sharedFingerprint)
  })

  it('invalidates shared output when the demo runtime assets change', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-demo-assets-'))
    await mkdir(join(cwd, 'docs'))
    const config = createMockConfig()
    const graph = createMockGraph()
    const first = await createBuildManifest(cwd, config, graph, undefined, {
      clientUrl: '/assets/canofold-demos/index.js',
      styleUrls: ['/assets/canofold-demos/styles.css'],
      outputPaths: ['assets/canofold-demos/index.js', 'assets/canofold-demos/styles.css'],
      demos: {}
    })
    const second = await createBuildManifest(cwd, config, graph, undefined, {
      clientUrl: '/assets/canofold-demos/index-v2.js',
      styleUrls: ['/assets/canofold-demos/styles-v2.css'],
      outputPaths: ['assets/canofold-demos/index-v2.js', 'assets/canofold-demos/styles-v2.css'],
      demos: {}
    })

    expect(second.sharedFingerprint).not.toBe(first.sharedFingerprint)
  })

  it('fingerprints pluggable runtimes and falls back to a demo entry dependency', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-state-pluggable-runtime-'))
    await mkdir(join(cwd, 'docs'))
    await mkdir(join(cwd, 'src'))
    const modulePath = join(cwd, 'src/demo.tsx')
    await writeFile(modulePath, 'export default function Demo() { return null }')
    const demo = {
      id: 'demo',
      specifier: '/src/demo.tsx',
      sandbox: 'inline' as const,
      pageSourcePath: join(cwd, 'docs/index.md'),
      pageSourceRelativePath: 'docs/index.md',
      routePath: '/',
      locale: 'zh',
      modulePath,
      source: 'export default function Demo() { return null }',
      language: 'tsx' as const
    }
    const page = createMockPage({
      demos: [
        demo,
        {
          ...demo,
          id: 'missing-demo',
          specifier: '/src/missing.tsx'
        }
      ]
    })
    const graph = createMockGraph({ pages: [page] })
    const baseConfig = createMockConfig()
    const configured = createMockConfig({
      demos: {
        engine: {
          id: 'fixture-demo-engine',
          async prepare() {
            return { clientUrl: '/fixture.js', demos: {} }
          }
        }
      },
      markdown: {
        ...baseConfig.markdown,
        plugins: [{ name: 'fixture-markdown-plugin' }]
      },
      search: {
        enabled: true,
        provider: {
          id: 'fixture-search',
          client: 'compact',
          async write() {}
        }
      }
    })

    const defaultManifest = await createBuildManifest(cwd, baseConfig, graph, undefined, {
      clientUrl: '/fixture.js',
      demos: { demo }
    })
    const configuredManifest = await createBuildManifest(cwd, configured, graph, undefined, {
      clientUrl: '/fixture.js',
      demos: { demo }
    })

    expect(configuredManifest.sharedFingerprint).not.toBe(defaultManifest.sharedFingerprint)
    expect(configuredManifest.pages[buildPageKey(page)]?.fingerprint).toBe(
      defaultManifest.pages[buildPageKey(page)]?.fingerprint
    )
  })
})
