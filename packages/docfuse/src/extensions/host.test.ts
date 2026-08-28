import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { defaultConfig } from '../config/defaults'
import { buildContentGraph } from '../content/graph'
import { loadExtensionHost } from './host'

async function fixture(extensionSource: string) {
  const cwd = await mkdtemp(join(tmpdir(), 'docfuse-extension-'))
  await mkdir(join(cwd, 'docs'), { recursive: true })
  await mkdir(join(cwd, 'extensions'), { recursive: true })
  await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n{{label}}')
  await writeFile(join(cwd, 'extensions/example.ts'), extensionSource)
  const descriptors = [{ resolve: './extensions/example.ts', options: { label: 'Extended' } }]
  return {
    cwd,
    descriptors,
    temporaryRoot: join(cwd, '.docfuse/cache')
  }
}

const validExtension = `
export default (options) => ({
  apiVersion: 1,
  name: 'example',
  outputs: ['report.json'],
  transformSource(context) {
    return context.source.replace('{{label}}', options.label)
  },
  extendPage(page) {
    return { description: 'Processed ' + page.title, searchText: page.searchText + ' extension-keyword' }
  },
  async generate({ pages, emitFile }) {
    await emitFile('report.json', JSON.stringify({ pages: pages.map((page) => page.routePath) }))
  }
})`

describe('ExtensionHost', () => {
  it('creates a stable no-op host when no extensions are configured', async () => {
    const { cwd, temporaryRoot } = await fixture(validExtension)
    const host = await loadExtensionHost(cwd, temporaryRoot, [])
    const graph = await buildContentGraph(cwd, defaultConfig, host)

    expect(host.publicOutputPaths).toEqual([])
    expect(graph.pages[0]?.body).toBe('# Home\n\n{{label}}')
    await expect(host.generate(join(cwd, '.docfuse/dist'), graph.pages)).resolves.toBeUndefined()
  })

  it('resolves the public docfuse extension API from the bundled host shim', async () => {
    const { cwd, descriptors, temporaryRoot } = await fixture(`
      import { DOCFUSE_EXTENSION_API_VERSION, defineExtension, docfuseVersion } from 'docfuse'
      export default defineExtension({
        apiVersion: DOCFUSE_EXTENSION_API_VERSION,
        name: 'public-api',
        extendPage(page) { return { description: 'Docfuse ' + docfuseVersion + ': ' + page.title } }
      })`)
    const host = await loadExtensionHost(cwd, temporaryRoot, descriptors)
    const graph = await buildContentGraph(cwd, defaultConfig, host)

    expect(graph.pages[0]?.description).toMatch(/^Docfuse \d+\.\d+\.\d+: Home$/)
  })

  it('applies one transformed source to analysis/render data and emits declared artifacts', async () => {
    const { cwd, descriptors, temporaryRoot } = await fixture(validExtension)
    const host = await loadExtensionHost(cwd, temporaryRoot, descriptors)
    const graph = await buildContentGraph(cwd, defaultConfig, host)

    expect(graph.pages[0]).toMatchObject({
      body: '# Home\n\nExtended',
      description: 'Processed Home'
    })
    expect(graph.pages[0]?.searchText).toContain('Extended')
    expect(graph.pages[0]?.searchText).toContain('extension-keyword')
    expect(host.publicOutputPaths).toEqual(['/extensions/example/report.json'])

    const outputRoot = join(cwd, '.docfuse/dist')
    await host.generate(outputRoot, graph.pages)
    expect(JSON.parse(await readFile(join(outputRoot, 'extensions/example/report.json'), 'utf8'))).toEqual({
      pages: ['/']
    })
  })

  it('changes the host fingerprint when implementation or options change', async () => {
    const { cwd, descriptors, temporaryRoot } = await fixture(validExtension)
    const first = await loadExtensionHost(cwd, temporaryRoot, descriptors)
    const withOptions = await loadExtensionHost(cwd, temporaryRoot, [
      { ...descriptors[0]!, options: { label: 'Changed option' } }
    ])
    await writeFile(join(cwd, 'extensions/example.ts'), validExtension.replace('Processed ', 'Updated '))
    const withCode = await loadExtensionHost(cwd, temporaryRoot, descriptors)

    expect(withOptions.fingerprint).not.toBe(first.fingerprint)
    expect(withCode.fingerprint).not.toBe(first.fingerprint)
  })

  it('rejects incompatible APIs, duplicate identities and undeclared outputs', async () => {
    const incompatible = await fixture(`export default { apiVersion: 2, name: 'future' }`)
    await expect(
      loadExtensionHost(incompatible.cwd, incompatible.temporaryRoot, incompatible.descriptors)
    ).rejects.toThrow('Failed to load extension')

    const duplicate = await fixture(`export default { apiVersion: 1, name: 'same' }`)
    await writeFile(
      join(duplicate.cwd, 'extensions/second.ts'),
      `export default { apiVersion: 1, name: 'same' }`
    )
    await expect(
      loadExtensionHost(duplicate.cwd, duplicate.temporaryRoot, [
        duplicate.descriptors[0]!,
        { resolve: './extensions/second.ts' }
      ])
    ).rejects.toThrow('Duplicate extension name')

    const undeclared = await fixture(`
      export default {
        apiVersion: 1,
        name: 'unsafe',
        outputs: ['declared.txt'],
        generate({ emitFile }) { return emitFile('../escape.txt', 'unsafe') }
      }`)
    const host = await loadExtensionHost(undeclared.cwd, undeclared.temporaryRoot, undeclared.descriptors)
    await expect(host.generate(join(undeclared.cwd, '.docfuse/dist'), [])).rejects.toThrow(
      'Extension "unsafe" generate failed'
    )
    await expect(access(join(undeclared.cwd, '.docfuse/dist/extensions/escape.txt'))).rejects.toThrow()

    const unicodeDuplicate = await fixture(`
      export default {
        apiVersion: 1,
        name: 'unicode-output',
        outputs: ['caf\u00e9.txt', 'cafe\u0301.txt'],
        generate() {}
      }`)
    await expect(
      loadExtensionHost(unicodeDuplicate.cwd, unicodeDuplicate.temporaryRoot, unicodeDuplicate.descriptors)
    ).rejects.toThrow('duplicate portable output paths')
  })

  it.each([
    ['non-object export', 'export default null', 'must export an extension object or factory'],
    [
      'unknown definition key',
      `export default { apiVersion: 1, name: 'unknown-key', unexpected: true }`,
      'has unknown key "unexpected"'
    ],
    [
      'non-portable name',
      `export default { apiVersion: 1, name: 'Not Portable' }`,
      'name must be a lowercase portable slug'
    ],
    [
      'non-function hook',
      `export default { apiVersion: 1, name: 'bad-hook', extendPage: true }`,
      'hook extendPage must be a function'
    ],
    [
      'non-array outputs',
      `export default { apiVersion: 1, name: 'bad-outputs', outputs: 'report.txt' }`,
      'outputs must be an array'
    ],
    [
      'generate without outputs',
      `export default { apiVersion: 1, name: 'missing-outputs', generate() {} }`,
      'with generate() must declare outputs'
    ],
    [
      'outputs without generate',
      `export default { apiVersion: 1, name: 'missing-generate', outputs: ['report.txt'] }`,
      'declares outputs without generate()'
    ]
  ])('rejects %s', async (_label, source, message) => {
    const invalid = await fixture(source)
    await expect(loadExtensionHost(invalid.cwd, invalid.temporaryRoot, invalid.descriptors)).rejects.toThrow(
      message
    )
  })

  it.each([
    [`{ unexpected: true }`, 'extendPage() returned unknown key "unexpected"'],
    [`{ title: 42 }`, 'extendPage() field title must be a string'],
    [`{ search: 'yes' }`, 'extendPage() field search must be a boolean']
  ])('rejects an invalid extendPage patch: %s', async (patch, message) => {
    const invalid = await fixture(`
      export default {
        apiVersion: 1,
        name: 'invalid-patch',
        extendPage() { return ${patch} }
      }`)
    const host = await loadExtensionHost(invalid.cwd, invalid.temporaryRoot, invalid.descriptors)

    await expect(buildContentGraph(invalid.cwd, defaultConfig, host)).rejects.toThrow(message)
  })

  it('wraps invalid transform results with page and extension context', async () => {
    const invalid = await fixture(`
      export default {
        apiVersion: 1,
        name: 'invalid-transform',
        transformSource() { return null }
      }`)
    const host = await loadExtensionHost(invalid.cwd, invalid.temporaryRoot, invalid.descriptors)

    await expect(buildContentGraph(invalid.cwd, defaultConfig, host)).rejects.toThrow(
      'Extension "invalid-transform" transformSource failed for docs/index.md: transformSource() must return a string'
    )
  })

  it('rejects duplicate and missing generated artifacts', async () => {
    const duplicate = await fixture(`
      export default {
        apiVersion: 1,
        name: 'duplicate-artifact',
        outputs: ['report.txt'],
        async generate({ emitFile }) {
          await emitFile('report.txt', 'first')
          await emitFile('report.txt', 'second')
        }
      }`)
    const duplicateHost = await loadExtensionHost(
      duplicate.cwd,
      duplicate.temporaryRoot,
      duplicate.descriptors
    )
    await expect(duplicateHost.generate(join(duplicate.cwd, '.docfuse/dist'), [])).rejects.toThrow(
      'generate() emitted "report.txt" more than once'
    )

    const missing = await fixture(`
      export default {
        apiVersion: 1,
        name: 'missing-artifact',
        outputs: ['report.txt'],
        generate() {}
      }`)
    const missingHost = await loadExtensionHost(missing.cwd, missing.temporaryRoot, missing.descriptors)
    await expect(missingHost.generate(join(missing.cwd, '.docfuse/dist'), [])).rejects.toThrow(
      'generate() did not emit declared outputs: report.txt'
    )
  })
})
