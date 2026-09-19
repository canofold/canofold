import {
  access,
  mkdir,
  mkdtemp as createMkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import { vite } from './index'

const fixtureNodeModules = fileURLToPath(new URL('../node_modules', import.meta.url))

async function mkdtemp(prefix: string) {
  const directory = await createMkdtemp(prefix)
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function linkNodeModules(directory: string) {
  await symlink(fixtureNodeModules, join(directory, 'node_modules'))
}

async function linkBrowserRuntime(directory: string) {
  const nodeModules = join(directory, 'node_modules')
  await mkdir(nodeModules, { recursive: true })
  await Promise.all(
    ['react', 'react-dom'].map((name) => symlink(join(fixtureNodeModules, name), join(nodeModules, name)))
  )
}

describe('@canofold/vite', () => {
  it('builds the client without requiring transitive engine dependencies in the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-vite-client-boundary-'))
    const outputRoot = join(cwd, '.canofold/dist')
    await mkdir(join(cwd, 'src'), { recursive: true })
    await linkBrowserRuntime(cwd)
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: '@fixture/client-boundary', type: 'module' })
    )
    await writeFile(
      join(cwd, 'src/demo.tsx'),
      `export default function Demo() { return <button>Demo</button> }`
    )
    await expect(access(join(cwd, 'node_modules/@canofold/markdown'))).rejects.toMatchObject({
      code: 'ENOENT'
    })

    const manifest = await vite({ configFile: false }).prepare({
      cwd,
      outputRoot,
      basePath: '/',
      mode: 'build',
      demos: [
        {
          id: 'fixture-demo',
          specifier: '/src/demo.tsx',
          sandbox: 'inline',
          pageSourcePath: join(cwd, 'docs/button.md'),
          pageSourceRelativePath: 'docs/button.md',
          routePath: '/button/',
          locale: 'en'
        }
      ]
    })

    await access(join(outputRoot, 'assets/canofold-demos/index.js'))
    await access(join(outputRoot, 'assets/canofold-demos/markdown.js'))
    expect(manifest.outputPaths).toContain('assets/canofold-demos/index.js')
  })

  it('reuses one Vite server until its config or package metadata changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-vite-dev-engine-'))
    const outputRoot = join(cwd, '.canofold/dist')
    const counterKey = `__canofoldViteConfigCount${Date.now()}`
    const targetKey = `__canofoldViteOptimizerTarget${Date.now()}`
    await mkdir(join(cwd, 'src'), { recursive: true })
    await linkNodeModules(cwd)
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: '@fixture/dev-components', type: 'module' })
    )
    await writeFile(
      join(cwd, 'vite.config.ts'),
      `export default {
  plugins: [{ name: 'fixture-count', configResolved(config) {
    globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1
    globalThis.${targetKey} = config.optimizeDeps.esbuildOptions.target
  } }],
  build: { lib: { entry: 'src/index.tsx', formats: ['es'] } }
}`
    )
    await writeFile(join(cwd, 'src/index.tsx'), `export function Demo() { return <button>Demo</button> }`)
    await writeFile(
      join(cwd, 'src/demo.tsx'),
      `import { Demo } from '@fixture/dev-components'; export default Demo`
    )
    const reference = {
      id: 'fixture-demo',
      specifier: '/src/demo.tsx',
      sandbox: 'inline' as const,
      pageSourcePath: join(cwd, 'docs/button.md'),
      pageSourceRelativePath: 'docs/button.md',
      routePath: '/button/',
      locale: 'en'
    }
    const server = createServer()
    const context = {
      cwd,
      outputRoot,
      basePath: '/',
      mode: 'dev' as const,
      server,
      demos: [reference]
    }

    const firstEngine = vite()
    const firstManifest = await firstEngine.prepare(context)
    const secondEngine = vite()
    const secondManifest = await secondEngine.prepare(context)
    const runtime = await secondEngine.startDev!({
      cwd,
      basePath: '/',
      server,
      getDemos: () => Object.values(secondManifest.demos),
      shouldIgnorePath: () => false
    })
    onTestFinished(async () => {
      delete (globalThis as Record<string, unknown>)[counterKey]
      delete (globalThis as Record<string, unknown>)[targetKey]
      await runtime.close()
    })
    expect((globalThis as Record<string, unknown>)[counterKey]).toBe(1)
    expect((globalThis as Record<string, unknown>)[targetKey]).toBe('esnext')
    expect(firstManifest.clientUrl).toBe(secondManifest.clientUrl)

    await writeFile(
      join(cwd, 'vite.config.ts'),
      `export default {
  plugins: [{ name: 'fixture-count-updated', configResolved(config) {
    globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1
    globalThis.${targetKey} = config.optimizeDeps.esbuildOptions.target
  } }],
  build: { lib: { entry: 'src/index.tsx', formats: ['es'] } }
}`
    )
    const thirdEngine = vite()
    const thirdManifest = await thirdEngine.prepare(context)
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: '@fixture/dev-components', type: 'module', dependencies: { react: '19.3.0' } })
    )
    const fourthEngine = vite()
    const fourthManifest = await fourthEngine.prepare(context)

    expect((globalThis as Record<string, unknown>)[counterKey]).toBe(3)
    expect((globalThis as Record<string, unknown>)[targetKey]).toBe('esnext')
    expect(secondManifest.clientUrl).toBe(thirdManifest.clientUrl)
    expect(thirdManifest.clientUrl).toBe(fourthManifest.clientUrl)
    expect(fourthManifest.dependencyPaths).toContain(await realpath(join(cwd, 'package.json')))
    expect(fourthManifest.dependencyPaths).toContain(await realpath(join(cwd, 'vite.config.ts')))
    expect(runtime.handlesFile?.(join(cwd, 'src/demo.tsx'))).toBe(true)
  })

  it('builds the same demo source and its imported CSS into a browser bundle', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-vite-engine-'))
    const outputRoot = join(cwd, '.canofold/dist')
    await mkdir(join(cwd, 'src'), { recursive: true })
    await linkNodeModules(cwd)
    await writeFile(join(cwd, 'src/demo.css'), '.fixture-demo { color: rgb(1 2 3); }')
    await writeFile(
      join(cwd, 'src/demo.tsx'),
      `import './demo.css'; export default function Demo() { return <button className="fixture-demo">Demo</button> }`
    )

    const manifest = await vite({ configFile: false }).prepare({
      cwd,
      outputRoot,
      basePath: '/docs/',
      mode: 'build',
      demos: [
        {
          id: 'fixture-demo',
          title: 'Basic usage',
          specifier: '/src/demo.tsx',
          sandbox: 'inline',
          pageSourcePath: join(cwd, 'docs/button.md'),
          pageSourceRelativePath: 'docs/button.md',
          routePath: '/button/',
          locale: 'en'
        }
      ]
    })

    expect(manifest.clientUrl).toBe('/docs/assets/canofold-demos/index.js')
    expect(manifest.markdownClientUrl).toBe('/docs/assets/canofold-demos/markdown.js')
    expect(manifest.styleUrls).toBeUndefined()
    expect(manifest.demos['fixture-demo']).toMatchObject({
      title: 'Basic usage',
      source: `import './demo.css'; export default function Demo() { return <button className="fixture-demo">Demo</button> }`,
      language: 'tsx'
    })
    expect(manifest.demos['fixture-demo']?.dependencyPaths).toEqual([
      join(await realpath(cwd), 'src/demo.css'),
      join(await realpath(cwd), 'src/demo.tsx')
    ])
    const cssPath = manifest.outputPaths?.find((path) => path.endsWith('.css'))
    expect(cssPath).toBeDefined()
    expect(manifest.outputPaths?.some((path) => path.includes('/chunks/'))).toBe(true)
    await access(join(outputRoot, 'assets/canofold-demos/index.js'))
    const markdownClient = await readFile(join(outputRoot, 'assets/canofold-demos/markdown.js'), 'utf8')
    expect(markdownClient).toContain('enhanceMarkdown')
    expect(markdownClient).not.toContain('createRoot')
    expect(await readFile(join(outputRoot, cssPath!), 'utf8')).toContain('.fixture-demo')
  })

  it('reports a missing demo through Vite resolution', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-vite-engine-'))
    await linkNodeModules(cwd)

    await expect(
      vite({ configFile: false }).prepare({
        cwd,
        outputRoot: join(cwd, '.canofold/dist'),
        basePath: '/',
        mode: 'analyze',
        demos: [
          {
            id: 'missing',
            specifier: '/src/missing.tsx',
            sandbox: 'inline',
            pageSourcePath: join(cwd, 'docs/button.md'),
            pageSourceRelativePath: 'docs/button.md',
            routePath: '/button/',
            locale: 'en'
          }
        ]
      })
    ).rejects.toThrow('Vite could not resolve demo')
  })

  it('loads each demo and its CSS from a separate production chunk', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-vite-split-engine-'))
    const outputRoot = join(cwd, '.canofold/dist')
    await mkdir(join(cwd, 'src'), { recursive: true })
    await linkNodeModules(cwd)
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: '@fixture/components', type: 'module' })
    )
    await writeFile(join(cwd, 'src/alpha.css'), '.alpha-only { color: red; }')
    await writeFile(join(cwd, 'src/beta.css'), '.beta-only { color: blue; }')
    await writeFile(
      join(cwd, 'src/index.tsx'),
      `export function Alpha() { return <p>ALPHA_DEMO_ONLY</p> }
export function Beta() { return <p>BETA_DEMO_ONLY</p> }`
    )
    await writeFile(
      join(cwd, 'src/alpha.tsx'),
      `import './alpha.css'; import { Alpha } from '@fixture/components'; export default Alpha`
    )
    await writeFile(
      join(cwd, 'src/beta.tsx'),
      `import './beta.css'; import { Beta } from '@fixture/components'; export default Beta`
    )
    await writeFile(
      join(cwd, 'vite.config.ts'),
      `let resolvedTarget

function packageRoots(bundle, packageName) {
  const escapedName = packageName.replace('/', '\\/')
  const pattern = new RegExp('^(.*\\/node_modules\\/(?:\\.pnpm\\/[^/]+\\/node_modules\\/)?' + escapedName + ')(?:\\/|$)')
  const roots = new Set()
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue
    for (const id of Object.keys(output.modules)) {
      const match = id.replace(/^\\0/, '').replaceAll('\\\\', '/').match(pattern)
      if (match) roots.add(match[1])
    }
  }
  return [...roots]
}

function packageRootsForEntry(bundle, entryFile, packageName) {
  const escapedName = packageName.replace('/', '\\/')
  const pattern = new RegExp('^(.*\\/node_modules\\/(?:\\.pnpm\\/[^/]+\\/node_modules\\/)?' + escapedName + ')(?:\\/|$)')
  const roots = new Set()
  const visited = new Set()
  const visit = (fileName) => {
    if (visited.has(fileName)) return
    visited.add(fileName)
    const output = bundle[fileName]
    if (!output || output.type !== 'chunk') return
    for (const id of Object.keys(output.modules)) {
      const match = id.replace(/^\\0/, '').replaceAll('\\\\', '/').match(pattern)
      if (match) roots.add(match[1])
    }
    output.imports.forEach(visit)
  }
  visit(entryFile)
  return [...roots]
}

export default {
  plugins: [{
    name: 'runtime-ownership-report',
    configResolved(config) {
      resolvedTarget = config.build.target
    },
    generateBundle(_options, bundle) {
      this.emitFile({
        type: 'asset',
        fileName: 'runtime-ownership.json',
        source: JSON.stringify({
          react: packageRoots(bundle, 'react'),
          reactDom: packageRoots(bundle, 'react-dom'),
          markdownReact: packageRootsForEntry(bundle, 'markdown.js', 'react'),
          markdownReactDom: packageRootsForEntry(bundle, 'markdown.js', 'react-dom'),
          demoReact: packageRootsForEntry(bundle, 'index.js', 'react'),
          demoReactDom: packageRootsForEntry(bundle, 'index.js', 'react-dom'),
          target: resolvedTarget
        })
      })
    }
  }],
  build: { target: 'es2022', lib: { entry: 'src/index.tsx', formats: ['es'] } }
}`
    )

    const manifest = await vite().prepare({
      cwd,
      outputRoot,
      basePath: '/',
      mode: 'build',
      demos: ['alpha', 'beta'].map((name) => ({
        id: name,
        specifier: `/src/${name}.tsx`,
        sandbox: 'inline' as const,
        pageSourcePath: join(cwd, `docs/${name}.md`),
        pageSourceRelativePath: `docs/${name}.md`,
        routePath: `/${name}/`,
        locale: 'en'
      }))
    })

    const outputPaths = manifest.outputPaths ?? []
    const entry = await readFile(join(outputRoot, 'assets/canofold-demos/index.js'), 'utf8')
    const chunkSources = await Promise.all(
      outputPaths
        .filter((path) => path.includes('/chunks/') && path.endsWith('.js'))
        .map((path) => readFile(join(outputRoot, path), 'utf8'))
    )
    const cssSources = await Promise.all(
      outputPaths
        .filter((path) => path.endsWith('.css'))
        .map((path) => readFile(join(outputRoot, path), 'utf8'))
    )
    const runtimeOwnership = JSON.parse(
      await readFile(join(outputRoot, 'assets/canofold-demos/runtime-ownership.json'), 'utf8')
    ) as {
      react: string[]
      reactDom: string[]
      markdownReact: string[]
      markdownReactDom: string[]
      demoReact: string[]
      demoReactDom: string[]
      target: string
    }

    expect(entry).not.toContain('ALPHA_DEMO_ONLY')
    expect(entry).not.toContain('BETA_DEMO_ONLY')
    expect(chunkSources.some((source) => source.includes('ALPHA_DEMO_ONLY'))).toBe(true)
    expect(chunkSources.some((source) => source.includes('BETA_DEMO_ONLY'))).toBe(true)
    expect(cssSources.some((source) => source.includes('.alpha-only'))).toBe(true)
    expect(cssSources.some((source) => source.includes('.beta-only'))).toBe(true)
    expect(runtimeOwnership.react).toHaveLength(1)
    expect(runtimeOwnership.reactDom).toHaveLength(1)
    expect(runtimeOwnership.markdownReact).toHaveLength(0)
    expect(runtimeOwnership.markdownReactDom).toHaveLength(0)
    expect(runtimeOwnership.demoReact).toHaveLength(1)
    expect(runtimeOwnership.demoReactDom).toHaveLength(1)
    expect(runtimeOwnership.target).toBe('es2022')
  })

  it('rejects demo source files outside the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-vite-engine-'))
    const outside = await mkdtemp(join(tmpdir(), 'canofold-vite-outside-'))
    await linkNodeModules(cwd)
    await writeFile(join(outside, 'demo.tsx'), 'export default function Demo() { return null }')

    await expect(
      vite({ configFile: false }).prepare({
        cwd,
        outputRoot: join(cwd, '.canofold/dist'),
        basePath: '/',
        mode: 'analyze',
        demos: [
          {
            id: 'outside',
            specifier: `/@fs/${outside}/demo.tsx`,
            sandbox: 'inline',
            pageSourcePath: join(cwd, 'docs/button.md'),
            pageSourceRelativePath: 'docs/button.md',
            routePath: '/button/',
            locale: 'en'
          }
        ]
      })
    ).rejects.toThrow('must resolve inside the Canofold project root')
  })

  it('rejects a demo setup file outside the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-vite-engine-'))
    const outside = await mkdtemp(join(tmpdir(), 'canofold-vite-outside-'))
    await linkNodeModules(cwd)
    await writeFile(join(outside, 'setup.ts'), 'export default function setup() {}')

    await expect(
      vite({ configFile: false }).prepare({
        cwd,
        outputRoot: join(cwd, '.canofold/dist'),
        basePath: '/',
        mode: 'analyze',
        setup: `/@fs/${outside}/setup.ts`,
        demos: []
      })
    ).rejects.toThrow('must resolve inside the Canofold project root')
  })

  it('keeps aliases but isolates demo output from library build options', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-vite-library-engine-'))
    const outputRoot = join(cwd, '.canofold/dist')
    await mkdir(join(cwd, 'src'), { recursive: true })
    await linkNodeModules(cwd)
    await writeFile(
      join(cwd, 'vite.config.ts'),
      `import { defineConfig } from 'vite'
       import { fileURLToPath } from 'node:url'
       export default defineConfig({
         resolve: { alias: { '@fixture/ui': fileURLToPath(new URL('./src/library.tsx', import.meta.url)) } },
         build: {
           lib: { entry: fileURLToPath(new URL('./src/library.tsx', import.meta.url)), formats: ['es'] },
           rollupOptions: { external: ['react', 'react/jsx-runtime'] }
         }
       })`
    )
    await writeFile(join(cwd, 'src/library.css'), '.fixture-button { color: rgb(4 5 6); }')
    await writeFile(
      join(cwd, 'src/library.tsx'),
      `import './library.css'; export function FixtureButton() { return <button className="fixture-button">Library button</button> }`
    )
    await writeFile(
      join(cwd, 'src/demo.tsx'),
      `import { FixtureButton } from '@fixture/ui'; export default function Demo() { return <FixtureButton /> }`
    )

    const previousNodeEnv = process.env.NODE_ENV
    delete process.env.NODE_ENV
    let manifest
    try {
      manifest = await vite().prepare({
        cwd,
        outputRoot,
        basePath: '/',
        mode: 'build',
        demos: [
          {
            id: 'library-demo',
            specifier: '/src/demo.tsx',
            sandbox: 'inline',
            pageSourcePath: join(cwd, 'docs/button.md'),
            pageSourceRelativePath: 'docs/button.md',
            routePath: '/button/',
            locale: 'en'
          }
        ]
      })
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }

    expect(manifest.dependencyPaths).toContain(await realpath(join(cwd, 'vite.config.ts')))
    const client = await readFile(join(outputRoot, 'assets/canofold-demos/index.js'), 'utf8')
    expect(client).not.toMatch(/from\s*["']react(?:\/jsx-runtime)?["']/)
    expect(client).not.toContain('jsxDEV')
    expect(client).not.toContain('react-jsx-runtime.development.js')
    const cssPath = manifest.outputPaths?.find((path) => path.endsWith('.css'))
    expect(cssPath).toBeDefined()
    expect(await readFile(join(outputRoot, cssPath!), 'utf8')).toContain('.fixture-button')
  })
})
