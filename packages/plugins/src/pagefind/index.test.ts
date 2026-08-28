import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { SearchProviderContext } from 'docfuse'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { pagefind, writePagefindIndex } from './index'

async function searchGeneratedIndex(pagefindRoot: string, query: string) {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  Object.assign(globalThis, {
    document: {
      currentScript: null,
      querySelector: (selector: string) =>
        selector === 'html'
          ? { getAttribute: (attribute: string) => (attribute === 'lang' ? 'zh' : null) }
          : null
    }
  })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input.url)
    if (!rawUrl.startsWith('file:')) return originalFetch(input, init)
    const path = fileURLToPath(rawUrl.split('?')[0] ?? rawUrl)
    const content = await readFile(path)
    return new Response(content, {
      headers: path.endsWith('.pagefind') ? { 'content-type': 'application/wasm' } : undefined
    })
  }) as typeof fetch

  try {
    const pagefind = await import(
      `${pathToFileURL(join(pagefindRoot, 'pagefind.js')).href}?test=${Date.now()}`
    )
    await pagefind.options({ baseUrl: '/' })
    await pagefind.init()
    const response = await pagefind.search(query, {
      filters: { version: 'current', locale: 'zh' }
    })
    const results = await Promise.all(
      response.results.map((result: { data(): Promise<unknown> }) => result.data())
    )
    await pagefind.destroy()
    return results
  } finally {
    Object.assign(globalThis, { document: originalDocument, fetch: originalFetch })
  }
}

describe('pagefind', () => {
  it('closes Pagefind when index initialization reports an error', async () => {
    const close = vi.fn(async () => undefined)
    const context = {
      cwd: '/project',
      config: {} as SearchProviderContext['config'],
      graph: {
        pages: [],
        sidebar: {},
        nav: {},
        locales: [],
        defaultLocale: 'en',
        versions: [],
        currentVersion: 'current'
      },
      outputRoot: '/project/out',
      publicPathFor: (routePath: string) => routePath,
      resolveOutputPath: (outputPath: string) => outputPath
    } satisfies SearchProviderContext

    await expect(
      writePagefindIndex(
        context,
        { includeCharacters: '._-', keepIndexUrl: false, writePlayground: false },
        async () => ({
          pagefindApi: {
            createIndex: async () => ({ errors: ['initialization failed'] }),
            close
          },
          readFile: async () => '',
          rm: async () => undefined,
          join: (...paths: string[]) => paths.join('/')
        })
      )
    ).rejects.toThrow('Pagefind initialization failed')
    expect(close).toHaveBeenCalledOnce()
  })

  it('builds a searchable chunked index and removes unused Pagefind UI files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-pagefind-plugin-'))
    onTestFinished(() => rm(cwd, { recursive: true, force: true }))
    const outputRoot = join(cwd, '.docfuse/dist')
    await mkdir(outputRoot, { recursive: true })
    await writeFile(
      join(outputRoot, 'index.html'),
      '<!doctype html><html lang="zh"><head><meta data-pagefind-meta="title[content]" content="部署指南"><meta data-pagefind-filter="version:current"><meta data-pagefind-filter="locale:zh"></head><body><main data-pagefind-body><h1>部署指南</h1><p>零停机发布与回滚策略</p></main></body></html>'
    )

    const graph = {
      sidebar: {},
      nav: {},
      locales: ['zh'],
      defaultLocale: 'zh',
      versions: [{ id: 'current', label: 'Current', docsDir: 'docs', base: '/' }],
      currentVersion: 'current',
      pages: [
        {
          sourcePath: 'docs/index.md',
          transformedSource: '',
          sourceRelativePath: 'docs/index.md',
          relativePath: 'index.md',
          version: 'current',
          versionBase: '/',
          docsDir: 'docs',
          locale: 'zh',
          routePath: '/',
          outputPath: 'index.html',
          markdownOutputPath: 'index.md',
          title: '部署指南',
          description: '零停机发布',
          order: 0,
          group: '',
          status: 'published',
          search: true,
          ai: true,
          body: '# 部署指南',
          headings: [],
          searchText: '零停机发布与回滚策略',
          codeExamples: [],
          lastUpdated: new Date().toISOString(),
          frontmatter: {}
        }
      ]
    } as SearchProviderContext['graph']

    await pagefind().write({
      cwd,
      config: {} as SearchProviderContext['config'],
      graph,
      outputRoot,
      publicPathFor: (routePath) => routePath,
      resolveOutputPath: (outputPath) => join(outputRoot, outputPath)
    })

    const files = await readdir(join(outputRoot, 'pagefind'), { recursive: true })
    expect(files).toContain('pagefind.js')
    expect(files).toContain('pagefind-worker.js')
    expect(files).not.toContain('pagefind-ui.js')
    expect(files).not.toContain('pagefind-component-ui.js')
    expect(files.some((path) => String(path).includes('index/zh'))).toBe(true)
    await expect(access(join(outputRoot, 'search/zh.json'))).rejects.toMatchObject({ code: 'ENOENT' })

    const matches = await searchGeneratedIndex(join(outputRoot, 'pagefind'), '回滚策略')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ url: '/', meta: { title: '部署指南' } })
  })
})
