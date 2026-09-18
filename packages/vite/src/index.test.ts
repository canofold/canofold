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

describe('@canofold/vite', () => {
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
    expect(manifest.styleUrls).toEqual(['/docs/assets/canofold-demos/styles.css'])
    expect(manifest.demos['fixture-demo']).toMatchObject({
      title: 'Basic usage',
      source: `import './demo.css'; export default function Demo() { return <button className="fixture-demo">Demo</button> }`,
      language: 'tsx'
    })
    expect(manifest.demos['fixture-demo']?.dependencyPaths).toEqual([
      join(await realpath(cwd), 'src/demo.css'),
      join(await realpath(cwd), 'src/demo.tsx')
    ])
    await access(join(outputRoot, 'assets/canofold-demos/index.js'))
    expect(await readFile(join(outputRoot, 'assets/canofold-demos/index.js'), 'utf8')).toContain(
      '/docs/assets/canofold-demos/styles.css'
    )
    expect(await readFile(join(outputRoot, 'assets/canofold-demos/styles.css'), 'utf8')).toContain(
      '.fixture-demo'
    )
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
    expect(await readFile(join(outputRoot, 'assets/canofold-demos/styles.css'), 'utf8')).toContain(
      '.fixture-button'
    )
  })
})
