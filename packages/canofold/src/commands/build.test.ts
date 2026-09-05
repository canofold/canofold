import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runBuild, versionSatisfies } from './build'

async function directorySnapshot(
  root: string,
  directory = root,
  ignoredRootDirectories = new Set<string>()
): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (directory === root && entry.isDirectory() && ignoredRootDirectories.has(entry.name)) continue
    if (entry.isDirectory())
      Object.assign(snapshot, await directorySnapshot(root, path, ignoredRootDirectories))
    if (entry.isFile())
      snapshot[path.slice(root.length + 1).replace(/\\/g, '/')] = (await readFile(path)).toString('base64')
  }
  return snapshot
}

describe('versionSatisfies', () => {
  it('uses standard caret semantics for zero and stable major versions', () => {
    expect(versionSatisfies('0.1.8', '^0.1.0')).toBe(true)
    expect(versionSatisfies('0.2.0', '^0.1.0')).toBe(false)
    expect(versionSatisfies('1.9.0', '^1.2.0')).toBe(true)
    expect(versionSatisfies('2.0.0', '^1.2.0')).toBe(false)
  })

  it('supports exact and comparator ranges and rejects invalid input', () => {
    expect(versionSatisfies('1.4.2', '1.4.2')).toBe(true)
    expect(versionSatisfies('1.4.2', '>=1.4 <2')).toBe(true)
    expect(() => versionSatisfies('1.4.2', 'not-a-range')).toThrow('Invalid requiredVersion range')
  })
})

describe('runBuild', () => {
  it('compiles uppercase MDX extensions with MDX semantics', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-extension-case-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/Index.MD'), '# Home')
    await writeFile(join(cwd, 'docs/Guide.MDX'), '# Guide\n\nMDX value: {1 + 1}')

    await runBuild({ cwd })

    const html = await readFile(join(cwd, '.canofold/dist/Guide/index.html'), 'utf8')
    expect(html).toContain('<p data-cf-element="paragraph">MDX value: 2</p>')
  })

  it('builds deployable static output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/en'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\ndescription: 中文首页\n---\n# 首页')
    await writeFile(join(cwd, 'docs/en/index.md'), '---\ntitle: Home\ndescription: English home\n---\n# Home')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { title: 'Docs', i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] } }`
    )

    await runBuild({ cwd })

    await access(join(cwd, '.canofold/dist/index.html'))
    await expect(access(join(cwd, '.canofold/dist/zh/index.html'))).rejects.toMatchObject({ code: 'ENOENT' })
    await access(join(cwd, '.canofold/dist/en/index.html'))
    await access(join(cwd, '.canofold/dist/search/zh.json'))
    await access(join(cwd, '.canofold/dist/llms.txt'))
    await access(join(cwd, '.canofold/dist/ai/pages.json'))
    await access(join(cwd, '.canofold/dist/ai/manifest.json'))

    const html = await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')
    expect(html).toContain('首页')
    expect(html).not.toContain('Select language')
  })

  it('reuses a valid cross-process cache and safely recovers from output and manifest corruption', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-cache-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')

    expect((await runBuild({ cwd })).mode).toBe('clean')
    const cached = await runBuild({ cwd })
    expect(cached).toMatchObject({ mode: 'cached', cached: true, reason: 'unchanged-inputs' })

    await writeFile(join(cwd, '.canofold/dist/index.html'), 'tampered')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'invalid-output' })
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('<!doctype html>')

    await writeFile(join(cwd, '.canofold/cache/build-manifest.json'), '{broken')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'missing-manifest' })
    expect(await runBuild({ cwd, noCache: true })).toMatchObject({ mode: 'clean', reason: 'forced' })
  })

  it('invalidates cached analysis, rendering, and generated artifacts when an extension changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-extension-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await mkdir(join(cwd, 'extensions'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n{{release}}')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { extensions: [{ resolve: './extensions/release.ts' }] }`
    )
    const extensionPath = join(cwd, 'extensions/release.ts')
    const extension = (label: string) => `
      export default {
        apiVersion: 1,
        name: 'release',
        outputs: ['metadata.json'],
        transformSource({ source }) { return source.replace('{{release}}', '${label}') },
        extendPage(page) { return { searchText: page.searchText + ' ${label}-search' } },
        generate({ pages, emitFile }) {
          return emitFile('metadata.json', JSON.stringify({ label: '${label}', pages: pages.length }))
        }
      }`
    await writeFile(extensionPath, extension('alpha'))

    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'missing-manifest' })
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('alpha')
    expect(await readFile(join(cwd, '.canofold/dist/index.md'), 'utf8')).toContain('alpha')
    expect(await readFile(join(cwd, '.canofold/dist/index.md'), 'utf8')).not.toContain('{{release}}')
    expect(
      JSON.parse(await readFile(join(cwd, '.canofold/dist/extensions/release/metadata.json'), 'utf8'))
    ).toEqual({ label: 'alpha', pages: 1 })
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached', reason: 'unchanged-inputs' })

    await writeFile(extensionPath, extension('beta'))
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'shared-inputs-changed' })
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('beta')
    expect(await readFile(join(cwd, '.canofold/dist/index.md'), 'utf8')).toContain('beta')
    expect(
      JSON.parse(await readFile(join(cwd, '.canofold/dist/extensions/release/metadata.json'), 'utf8'))
    ).toEqual({ label: 'beta', pages: 1 })
  })

  it('invalidates only MDX pages that import a changed project-local component', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-local-component-'))
    await mkdir(join(cwd, 'docs/guide'), { recursive: true })
    await mkdir(join(cwd, 'components'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/other.md'), '# Other\n\nUnchanged')
    await writeFile(
      join(cwd, 'docs/guide/status.mdx'),
      "import { Status } from '../../components/Status'\n\n# Status\n\n<Status />"
    )
    const componentPath = join(cwd, 'components/Status.tsx')
    await writeFile(componentPath, `export function Status() { return <strong>Alpha</strong> }`)

    await runBuild({ cwd })
    expect(await readFile(join(cwd, '.canofold/dist/guide/status/index.html'), 'utf8')).toContain('Alpha')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached' })

    await writeFile(componentPath, `export function Status() { return <strong>Beta</strong> }`)
    const rebuilt = await runBuild({ cwd })

    expect(rebuilt).toMatchObject({ mode: 'incremental' })
    expect(rebuilt.changedPages).toEqual(['docs/guide/status.mdx'])
    expect(await readFile(join(cwd, '.canofold/dist/guide/status/index.html'), 'utf8')).toContain('Beta')
  })

  it('invalidates generated extension artifacts when a bundled package dependency changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-extension-dependency-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await mkdir(join(cwd, 'extensions'), { recursive: true })
    const helperRoot = join(cwd, 'node_modules/extension-helper')
    await mkdir(helperRoot, { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { extensions: [{ resolve: './extensions/report.ts' }] }`
    )
    await writeFile(
      join(cwd, 'extensions/report.ts'),
      `import { label } from 'extension-helper'
       export default {
         apiVersion: 1,
         name: 'report',
         outputs: ['metadata.json'],
         generate({ emitFile }) { return emitFile('metadata.json', JSON.stringify({ label })) }
       }`
    )
    await writeFile(
      join(helperRoot, 'package.json'),
      JSON.stringify({ name: 'extension-helper', type: 'module', exports: './index.js' })
    )
    const helperPath = join(helperRoot, 'index.js')
    await writeFile(helperPath, `export const label = 'alpha'`)

    await runBuild({ cwd })
    expect(
      JSON.parse(await readFile(join(cwd, '.canofold/dist/extensions/report/metadata.json'), 'utf8'))
    ).toEqual({ label: 'alpha' })
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached' })

    await writeFile(helperPath, `export const label = 'beta'`)
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'shared-inputs-changed' })
    expect(
      JSON.parse(await readFile(join(cwd, '.canofold/dist/extensions/report/metadata.json'), 'utf8'))
    ).toEqual({ label: 'beta' })
  })

  it('handles multi-page changes and deletions with output identical to a clean build', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-equivalence-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const firstPath = join(cwd, 'docs/zh/first.md')
    const secondPath = join(cwd, 'docs/zh/second.md')
    await writeFile(firstPath, '# First\n\nOld first')
    await writeFile(secondPath, '# Second\n\nOld second')
    await runBuild({ cwd })

    await writeFile(firstPath, '# First\n\nNew first')
    await writeFile(secondPath, '# Second\n\nNew second')
    const incremental = await runBuild({
      cwd
    })
    expect(incremental.mode).toBe('incremental')
    expect(incremental.changedPages).toHaveLength(2)
    expect(incremental.partialReload).toBe(false)
    const incrementalSnapshot = await directorySnapshot(
      join(cwd, '.canofold/dist'),
      join(cwd, '.canofold/dist'),
      new Set(['pagefind'])
    )

    await runBuild({ cwd, noCache: true })
    expect(
      await directorySnapshot(join(cwd, '.canofold/dist'), join(cwd, '.canofold/dist'), new Set(['pagefind']))
    ).toEqual(incrementalSnapshot)

    await rm(secondPath)
    expect(await runBuild({ cwd })).toMatchObject({
      mode: 'incremental',
      partialReload: false
    })
    await expect(access(join(cwd, '.canofold/dist/second/index.html'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    const deletionSnapshot = await directorySnapshot(
      join(cwd, '.canofold/dist'),
      join(cwd, '.canofold/dist'),
      new Set(['pagefind'])
    )
    await runBuild({ cwd, noCache: true })
    expect(
      await directorySnapshot(join(cwd, '.canofold/dist'), join(cwd, '.canofold/dist'), new Set(['pagefind']))
    ).toEqual(deletionSnapshot)
  })

  it('rejects output directories that overlap source documents without deleting them', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-safety-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const source = join(cwd, 'docs/zh/index.mdx')
    await writeFile(source, '# Keep me')
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { outputDir: 'docs' }`)

    await expect(runBuild({ cwd })).rejects.toThrow('must not overlap outputDir')
    await expect(readFile(source, 'utf8')).resolves.toBe('# Keep me')
  })

  it('rejects source/output overlap hidden behind a symbolic link without deleting data', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-symlink-safety-'))
    const outputRoot = join(cwd, '.canofold/dist')
    await mkdir(join(outputRoot, 'zh'), { recursive: true })
    const source = join(outputRoot, 'zh/index.md')
    const unrelated = join(outputRoot, 'keep.txt')
    await writeFile(source, '# Keep me')
    await writeFile(unrelated, 'keep unrelated')
    await symlink(outputRoot, join(cwd, 'docs'))

    await expect(runBuild({ cwd })).rejects.toThrow('must not overlap outputDir')
    await expect(readFile(source, 'utf8')).resolves.toBe('# Keep me')
    await expect(readFile(unrelated, 'utf8')).resolves.toBe('keep unrelated')
  })

  it('rejects an output directory that escapes through a symbolic-link ancestor', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-output-link-'))
    const outside = await mkdtemp(join(tmpdir(), 'canofold-build-output-outside-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await symlink(outside, join(cwd, '.canofold'))

    await expect(runBuild({ cwd })).rejects.toThrow(
      'build cache must resolve to a path inside the project root'
    )
    await expect(access(join(outside, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(outside, 'cache'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves the last successful output when a later build fails', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-atomic-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const source = join(cwd, 'docs/zh/guide.mdx')
    await writeFile(source, '# Stable output')
    await runBuild({ cwd })
    const output = join(cwd, '.canofold/dist/guide/index.html')
    const previous = await readFile(output, 'utf8')

    await writeFile(source, `import Broken from 'not-a-canofold-component'\n\n# Broken output`)
    await expect(runBuild({ cwd })).rejects.toThrow()
    await expect(readFile(output, 'utf8')).resolves.toBe(previous)
  })

  it('recovers the previous output after an interrupted directory swap', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-swap-recovery-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Stable output')
    await runBuild({ cwd })

    const outputRoot = join(cwd, '.canofold/dist')
    const backupRoot = join(cwd, '.canofold/.dist.backup')
    await rename(outputRoot, backupRoot)

    await expect(runBuild({ cwd })).resolves.toMatchObject({ mode: 'cached', cached: true })
    await expect(readFile(join(outputRoot, 'index.html'), 'utf8')).resolves.toContain('Stable output')
    await expect(access(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects public assets that use the build-owned benchmark path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-benchmark-collision-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/public'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/public/.benchmark.json'), '{"owner":"user"}')

    await expect(runBuild({ cwd })).rejects.toThrow(
      'Static asset conflicts with generated output: .benchmark.json'
    )
  })

  it('rejects page routes inside runtime-owned asset directories before rendering', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-runtime-route-collision-'))
    await mkdir(join(cwd, 'docs/zh/assets/fonts'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/zh/assets/fonts/KaTeX_AMS-Regular.woff2.md'), '# Reserved route')

    await expect(runBuild({ cwd })).rejects.toThrow('Generated output uses reserved directory "assets/fonts"')
  })

  it('rebuilds one changed page when its navigation contract is stable', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\n---\n# 首页')
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 指南\n---\n# 指南\n\n旧内容')

    await runBuild({ cwd })
    const sharedCss = join(cwd, '.canofold/dist/assets/canofold.css')
    const previousCss = await readFile(sharedCss, 'utf8')
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 指南\n---\n# 指南\n\n新内容')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    expect(second.mode).toBe('incremental')
    expect(second.partialReload).toBe(true)
    expect(await readFile(sharedCss, 'utf8')).toBe(previousCss)
    const html = await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')
    expect(html).toContain('新内容')
  })

  it('falls back to clean builds when the site-level math resource fact changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-math-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\nPlain content')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        markdown: {
          plugins: [{
            name: 'math-assets-test',
            version: '1',
            assets: { math: true },
            appliesTo: ({ source }) => source.includes('$')
          }]
        }
      }`
    )

    await runBuild({ cwd })
    await writeFile(guidePath, '# Guide\n\n$E = mc^2$')

    const withMath = await runBuild({
      cwd
    })

    expect(withMath.incremental).toBe(false)
    expect(await readFile(join(cwd, '.canofold/dist/assets/canofold.css'), 'utf8')).toContain('KaTeX_Main')
    expect(
      (await readdir(join(cwd, '.canofold/dist/assets/fonts'))).filter((file) => file.endsWith('.woff2'))
    ).toHaveLength(20)
    expect(await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')).toContain('$E = mc^2$')

    await writeFile(guidePath, '# Guide\n\nPlain again')
    const removedMath = await runBuild({
      cwd
    })

    expect(removedMath.incremental).toBe(false)
    expect(await readFile(join(cwd, '.canofold/dist/assets/canofold.css'), 'utf8')).not.toContain(
      'KaTeX_Main'
    )
    await expect(access(join(cwd, '.canofold/dist/assets/fonts'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rebuilds shared assets when the site gains or loses its first playground', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-playground-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\nPlain content')

    await runBuild({ cwd })
    const playgroundBundle = join(cwd, '.canofold/dist/assets/canofold-playground/index.js')
    await expect(access(playgroundBundle)).rejects.toMatchObject({ code: 'ENOENT' })

    await writeFile(guidePath, '---\nlayout: playground\n---\n\n# Guide')
    const withPlayground = await runBuild({ cwd })

    expect(withPlayground.mode).toBe('clean')
    await access(playgroundBundle)
    expect(await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')).toContain(
      'data-canofold-playground-client-url="/assets/canofold-playground/index.js"'
    )

    await writeFile(guidePath, '# Guide\n\nPlain again')
    const withoutPlayground = await runBuild({ cwd })

    expect(withoutPlayground.mode).toBe('clean')
    await expect(access(playgroundBundle)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes page assets that are no longer referenced after an incremental rebuild', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-stale-asset-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\n![Old](./old.png)')
    await writeFile(join(cwd, 'docs/zh/old.png'), 'old image')

    await runBuild({ cwd })
    const generatedAsset = join(cwd, '.canofold/dist/guide/old.png')
    await access(generatedAsset)
    await writeFile(guidePath, '# Guide\n\nNo image now.')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    await expect(access(generatedAsset)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes plugin assets that are no longer required after an incremental rebuild', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-plugin-assets-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const clientPath = join(cwd, 'plugin-client.js')
    const stylePath = join(cwd, 'plugin.css')
    await writeFile(clientPath, 'export function enhance() {}')
    await writeFile(stylePath, '.plugin-test {}')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        markdown: {
          plugins: [{
            name: 'incremental-assets-test',
            version: '1',
            appliesTo: ({ source }) => source.includes('plugin-runtime'),
            assets: {
              clients: [{ id: 'incremental-assets-test', module: ${JSON.stringify(clientPath)} }],
              styles: [{ id: 'incremental-assets-test', module: ${JSON.stringify(stylePath)} }]
            }
          }]
        }
      }`
    )
    const pagePath = join(cwd, 'docs/zh/index.md')
    await writeFile(pagePath, '# Home\n\nplugin-runtime')

    await runBuild({ cwd })
    const pluginRoot = join(cwd, '.canofold/dist/assets/canofold-plugins')
    await expect(readdir(pluginRoot)).resolves.toEqual([
      'incremental-assets-test.css',
      'incremental-assets-test.js'
    ])
    await writeFile(pagePath, '# Home\n\nNo plugin resource.')

    const second = await runBuild({ cwd })

    expect(second.incremental).toBe(true)
    await expect(access(pluginRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves a public asset when a page stops sharing ownership of its output path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-shared-asset-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/public/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\n![Shared](./shared.png)')
    await writeFile(join(cwd, 'docs/zh/shared.png'), 'shared image')
    await writeFile(join(cwd, 'docs/public/guide/shared.png'), 'shared image')

    await runBuild({ cwd })
    const generatedAsset = join(cwd, '.canofold/dist/guide/shared.png')
    await access(generatedAsset)
    await writeFile(guidePath, '# Guide\n\nNo image now.')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    expect(await readFile(generatedAsset, 'utf8')).toBe('shared image')
  })

  it('rerenders affected pages when navigation metadata changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\n---\n# 首页')
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 指南\n---\n# 指南')

    await runBuild({ cwd })
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 新指南\n---\n# 新指南')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    expect(second.changedPages).toHaveLength(2)
    expect(await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')).toContain('新指南')
  })

  it('rerenders affected pages when a directory group label changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-group-'))
    await mkdir(join(cwd, 'docs/zh/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const groupIndex = join(cwd, 'docs/zh/guide/index.md')
    await writeFile(groupIndex, '---\ntitle: Guide\ngroup: Guides\n---\n# Guide')
    await writeFile(join(cwd, 'docs/zh/guide/start.md'), '---\ntitle: Start\n---\n# Start')

    await runBuild({ cwd })
    await writeFile(groupIndex, '---\ntitle: Guide\ngroup: Tutorials\n---\n# Guide')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    expect(second.changedPages).toHaveLength(3)
    expect(await readFile(join(cwd, '.canofold/dist/guide/start/index.html'), 'utf8')).toContain('Tutorials')
  })

  it('adds required Islands when an incremental page gains core interactive blocks', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-islands-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\n---\n# 首页')
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { markdown: { html: 'trusted' } }`)
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '---\ntitle: 指南\n---\n# 指南\n\n普通正文')

    await runBuild({ cwd })
    await writeFile(
      guidePath,
      [
        '---',
        'title: 指南',
        '---',
        '# 指南',
        '',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '<div data-cf-component="gallery"><figure><img src="one.png" alt="One"></figure></div>'
      ].join('\n')
    )

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    await access(join(cwd, '.canofold/dist/assets/canofold-markdown/index.js'))
    const html = await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')
    expect(html).toContain('data-cf-island="gallery"')
    expect(html).toContain('data-cf-island="table"')
    expect(html).toContain('data-markdown-behaviors="[&quot;gallery&quot;,&quot;table&quot;]"')
    expect(html).toContain('enhanceMarkdown(root, { behaviors })')

    const interactiveSnapshot = await directorySnapshot(
      join(cwd, '.canofold/dist'),
      join(cwd, '.canofold/dist'),
      new Set(['pagefind'])
    )
    await runBuild({ cwd, noCache: true })
    expect(
      await directorySnapshot(join(cwd, '.canofold/dist'), join(cwd, '.canofold/dist'), new Set(['pagefind']))
    ).toEqual(interactiveSnapshot)

    await writeFile(guidePath, '---\ntitle: 指南\n---\n# 指南\n\n恢复普通正文')
    expect((await runBuild({ cwd })).mode).toBe('incremental')
    await expect(access(join(cwd, '.canofold/dist/assets/canofold-markdown'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    const plainSnapshot = await directorySnapshot(
      join(cwd, '.canofold/dist'),
      join(cwd, '.canofold/dist'),
      new Set(['pagefind'])
    )
    await runBuild({ cwd, noCache: true })
    expect(
      await directorySnapshot(join(cwd, '.canofold/dist'), join(cwd, '.canofold/dist'), new Set(['pagefind']))
    ).toEqual(plainSnapshot)
  })

  it('keeps the Markdown client when only an unchanged page contains a GFM table', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-gfm-table-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(
      join(cwd, 'docs/zh/index.md'),
      ['# Home', '', '| Name | Value |', '| --- | --- |', '| Canofold | Fast |'].join('\n')
    )
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\nBefore')

    await runBuild({ cwd })
    const markdownClient = join(cwd, '.canofold/dist/assets/canofold-markdown/index.js')
    await access(markdownClient)

    await writeFile(guidePath, '# Guide\n\nAfter')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'incremental' })

    await access(markdownClient)
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('data-cf-island="table"')
  })

  it('tracks versioned pages independently when versions share one docsDir', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-shared-version-docs-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const pagePath = join(cwd, 'docs/index.md')
    await writeFile(pagePath, '# Shared\n\nAlpha')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        versions: {
          current: 'v2',
          items: [
            { id: 'v2', label: '2.x', docsDir: 'docs', base: '/' },
            { id: 'v1', label: '1.x', docsDir: 'docs', base: '/v1/' }
          ]
        }
      }`
    )

    await runBuild({ cwd })
    await writeFile(pagePath, '# Shared\n\nBeta')
    const rebuilt = await runBuild({ cwd })

    expect(rebuilt.mode).toBe('incremental')
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('Beta')
    expect(await readFile(join(cwd, '.canofold/dist/v1/index.html'), 'utf8')).toContain('Beta')
  })

  it('builds versioned snapshots, isolated search indexes, and redirects', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-enterprise-'))
    await mkdir(join(cwd, 'docs/zh/guide'), { recursive: true })
    await mkdir(join(cwd, 'versions/v1/zh/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 2.x')
    await writeFile(join(cwd, 'docs/zh/guide/start.md'), '# 当前指南')
    await writeFile(join(cwd, 'versions/v1/zh/index.md'), '# 1.x')
    await writeFile(join(cwd, 'versions/v1/zh/guide/start.md'), '# 旧版指南')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        navigation: { zh: [{ text: '指南', link: '/guide/start/' }] },
        versions: {
          current: 'v2',
          items: [
            { id: 'v2', label: '2.x', docsDir: 'docs', base: '/' },
            { id: 'v1', label: '1.x', docsDir: 'versions/v1', base: '/v1/' }
          ]
        },
        redirects: { '/getting-started/': '/guide/start/' }
      }`
    )

    await runBuild({ cwd })

    const current = await readFile(join(cwd, '.canofold/dist/guide/start/index.html'), 'utf8')
    const historical = await readFile(join(cwd, '.canofold/dist/v1/guide/start/index.html'), 'utf8')
    expect(current).toContain('当前指南')
    expect(current).toContain('>2.x<')
    expect(historical).toContain('旧版指南')
    expect(historical).toContain('href="/v1/guide/start/"')
    await access(join(cwd, '.canofold/dist/search/zh.json'))
    await access(join(cwd, '.canofold/dist/getting-started/index.html'))
    await access(join(cwd, '.canofold/dist/redirects.json'))
  })
})
