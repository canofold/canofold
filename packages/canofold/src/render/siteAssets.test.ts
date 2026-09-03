import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  MarkdownAssets,
  MarkdownPluginClientAsset,
  MarkdownPluginStyleAsset
} from '@canofold/markdown/server'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { copyMarkdownPluginAssets, registerPluginAssets } from './siteAssets'

function markdownAssets(overrides: Partial<MarkdownAssets> = {}): MarkdownAssets {
  return {
    behaviors: [],
    math: false,
    pluginClients: [],
    pluginStyles: [],
    ...overrides
  }
}

describe('Markdown plugin site assets', () => {
  it('validates and de-duplicates declared client and style assets', () => {
    const clients = new Map<string, MarkdownPluginClientAsset>()
    const styles = new Map<string, MarkdownPluginStyleAsset>()
    const client = { id: 'diagram', module: '/plugin/client.js' }
    const style = { id: 'diagram', module: '/plugin/diagram.css' }

    registerPluginAssets(
      markdownAssets({ pluginClients: [client, client], pluginStyles: [style, style] }),
      clients,
      styles
    )

    expect([...clients.values()]).toEqual([client])
    expect([...styles.values()]).toEqual([style])
    expect(() =>
      registerPluginAssets(
        markdownAssets({ pluginClients: [{ id: 'Diagram', module: '/plugin/client.js' }] }),
        clients,
        styles
      )
    ).toThrow('Invalid Markdown plugin client id: Diagram')
    expect(() =>
      registerPluginAssets(
        markdownAssets({ pluginStyles: [{ id: 'diagram', module: '/plugin/other.css' }] }),
        clients,
        styles
      )
    ).toThrow('Markdown plugin style id "diagram" is declared by both')
  })

  it('copies plugin resources recursively while honoring extension filters', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-plugin-assets-'))
    const fixtureRoot = join(cwd, 'plugin')
    const outputRoot = join(cwd, 'dist')
    await mkdir(join(fixtureRoot, 'chunks/nested'), { recursive: true })
    const clientPath = join(fixtureRoot, 'client.js')
    const resourcePath = join(fixtureRoot, 'runtime.mjs')
    const stylePath = join(fixtureRoot, 'diagram.css')
    await writeFile(clientPath, 'export function enhance() {}')
    await writeFile(resourcePath, 'export default {}')
    await writeFile(stylePath, '.diagram {}')
    await writeFile(join(fixtureRoot, 'chunks/root.mjs'), 'export const root = true')
    await writeFile(join(fixtureRoot, 'chunks/root.js'), 'export const ignored = true')
    await writeFile(join(fixtureRoot, 'chunks/nested/lazy.mjs'), 'export const lazy = true')

    const client: MarkdownPluginClientAsset = {
      id: 'diagram',
      module: clientPath,
      resources: [
        {
          module: resourcePath,
          output: 'runtime.mjs',
          directories: [
            {
              source: 'chunks',
              output: 'chunks',
              extensions: ['.mjs']
            }
          ]
        }
      ]
    }

    await copyMarkdownPluginAssets(
      outputRoot,
      new Map([[client.id, client]]),
      new Map([['diagram', { id: 'diagram', module: stylePath }]])
    )

    const target = join(outputRoot, 'assets/canofold-plugins')
    expect(await readFile(join(target, 'diagram.js'), 'utf8')).toContain('enhance')
    expect(await readFile(join(target, 'diagram.css'), 'utf8')).toBe('.diagram {}')
    expect(await readFile(join(target, 'diagram/runtime.mjs'), 'utf8')).toBe('export default {}')
    expect(await readFile(join(target, 'diagram/chunks/root.mjs'), 'utf8')).toContain('root')
    expect(await readFile(join(target, 'diagram/chunks/nested/lazy.mjs'), 'utf8')).toContain('lazy')
    await expect(access(join(target, 'diagram/chunks/root.js'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unsafe resource paths and symbolic links', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-plugin-resource-safety-'))
    const fixtureRoot = join(cwd, 'plugin')
    const outputRoot = join(cwd, 'dist')
    await mkdir(join(fixtureRoot, 'chunks'), { recursive: true })
    const clientPath = join(fixtureRoot, 'client.js')
    const resourcePath = join(fixtureRoot, 'runtime.mjs')
    const outsidePath = join(cwd, 'outside.mjs')
    await writeFile(clientPath, 'export default {}')
    await writeFile(resourcePath, 'export default {}')
    await writeFile(outsidePath, 'export const outside = true')

    const unsafeClient: MarkdownPluginClientAsset = {
      id: 'unsafe',
      module: clientPath,
      resources: [{ module: resourcePath, output: '../runtime.mjs' }]
    }
    await expect(
      copyMarkdownPluginAssets(outputRoot, new Map([[unsafeClient.id, unsafeClient]]), new Map())
    ).rejects.toThrow('Invalid Markdown plugin resource output path')

    await symlink(outsidePath, join(fixtureRoot, 'chunks/linked.mjs'))
    const linkedClient: MarkdownPluginClientAsset = {
      id: 'linked',
      module: clientPath,
      resources: [
        {
          module: resourcePath,
          output: 'runtime.mjs',
          directories: [{ source: 'chunks', output: 'chunks' }]
        }
      ]
    }
    await expect(
      copyMarkdownPluginAssets(outputRoot, new Map([[linkedClient.id, linkedClient]]), new Map())
    ).rejects.toThrow('Markdown plugin resources must not use symbolic links')
  })

  it('removes stale plugin output when no assets remain', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-empty-plugin-assets-'))
    const pluginRoot = join(cwd, 'dist/assets/canofold-plugins')
    await mkdir(pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, 'stale.js'), 'stale')

    await copyMarkdownPluginAssets(join(cwd, 'dist'), new Map(), new Map())

    await expect(access(pluginRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
