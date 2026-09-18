import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createMockConfig,
  createMockGraph,
  createMockPage,
  trackedMkdtemp as mkdtemp
} from '../../test/fixtures'
import { buildPageKey, createBuildManifest, fingerprintExistingFiles } from './state'

describe('build state support-file fingerprints', () => {
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
    await writeFile(dependencyPath, 'export const Button = 2')
    const second = await createBuildManifest(cwd, config, graph, undefined, {
      clientUrl: '/demo.js',
      demos: { demo }
    })

    expect(second.sharedFingerprint).toBe(first.sharedFingerprint)
    expect(second.pages[buildPageKey(page)]?.fingerprint).not.toBe(
      first.pages[buildPageKey(page)]?.fingerprint
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
