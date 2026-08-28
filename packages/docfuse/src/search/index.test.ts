import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMockGraph, createMockPage, trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { defaultConfig } from '../config/defaults'
import { defineSearchProvider, searchProviderClient, searchProviderFor, writeSearchIndexes } from './index'

describe('writeSearchIndexes', () => {
  it('keeps compact built in and explains how to migrate the legacy Pagefind option', () => {
    expect(searchProviderFor('compact').id).toBe('compact')
    expect(searchProviderClient('compact')).toBe('compact')
    expect(() => searchProviderFor('pagefind')).toThrow('@docfuse/plugins')
  })

  it('requires providers to declare the browser search protocol and a JSON cache identity', () => {
    expect(() =>
      defineSearchProvider({ id: 'missing-client', write: async () => undefined } as never)
    ).toThrow(/client must be "compact" or "pagefind"/)
    expect(() =>
      defineSearchProvider({
        id: 'bad-cache',
        client: 'compact',
        cacheKey: { pattern: /alpha/ },
        write: async () => undefined
      } as never)
    ).toThrow(/cacheKey must be JSON-serializable/)
  })

  it('writes compact documents and a locale-scoped inverted index', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-search-'))
    await mkdir(join(cwd, '.docfuse/dist'), { recursive: true })
    const graph = createMockGraph({
      pages: [
        createMockPage({
          sourcePath: 'docs/zh/index.md',
          transformedSource: '',
          sourceRelativePath: 'docs/zh/index.md',
          relativePath: 'zh/index.md',
          version: 'current',
          versionBase: '/',
          docsDir: 'docs',
          locale: 'zh',
          routePath: '/',
          outputPath: 'index.html',
          markdownOutputPath: 'index.md',
          title: '首页',
          description: '中文首页',
          order: 0,
          group: '',
          status: 'published',
          search: true,
          ai: true,
          body: '# 首页',
          headings: [],
          searchText: '首页 快速开始',
          codeExamples: [],
          lastUpdated: new Date().toISOString(),
          frontmatter: { tags: ['cli'] }
        }),
        createMockPage({
          sourcePath: 'docs/zh/guide.md',
          sourceRelativePath: 'docs/zh/guide.md',
          relativePath: 'zh/guide.md',
          locale: 'zh',
          routePath: '/guide/',
          outputPath: 'guide/index.html',
          markdownOutputPath: 'guide/index.md',
          title: 'CLI guide',
          description: 'CLI reference',
          body: '# CLI guide',
          searchText: 'cli cli cli'
        })
      ]
    })

    await writeSearchIndexes(cwd, { ...defaultConfig, search: { enabled: true, provider: 'compact' } }, graph)
    const index = JSON.parse(await readFile(join(cwd, '.docfuse/dist/search/zh.json'), 'utf8'))

    expect(index.docs[0].excerpt).toBe('首页 快速开始')
    expect(index.docs[0].tags).toEqual(['cli'])
    expect(index.docs[0]).not.toHaveProperty('text')
    expect(index.docs[0]).not.toHaveProperty('tokens')
    expect(index.postings.cli).toEqual([0, 1])
    expect(index.postings['首页']).toEqual([0])
  })

  it('indexes the complete searchable body without serializing it twice', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-search-large-'))
    await mkdir(join(cwd, '.docfuse/dist'), { recursive: true })
    const body = `${'intro '.repeat(100)}needle-at-the-end`
    const page = createMockPage({
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
      title: '首页',
      description: '中文首页',
      order: 0,
      group: '',
      status: 'published',
      search: true,
      ai: true,
      body,
      headings: [],
      searchText: body,
      codeExamples: [],
      lastUpdated: new Date().toISOString(),
      frontmatter: {}
    })
    const graph = createMockGraph({ pages: [page] })

    await writeSearchIndexes(cwd, { ...defaultConfig, search: { enabled: true, provider: 'compact' } }, graph)
    const index = JSON.parse(await readFile(join(cwd, '.docfuse/dist/search/zh.json'), 'utf8'))

    expect(index.docs[0].excerpt.length).toBeLessThanOrEqual(320)
    expect(index.postings.needle).toEqual([0])
    expect(JSON.stringify(index.docs)).not.toContain('needle-at-the-end')
  })

  it('does not emit a search index when search is disabled', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-search-'))
    await mkdir(join(cwd, '.docfuse/dist'), { recursive: true })
    const graph = createMockGraph()
    await writeSearchIndexes(
      cwd,
      {
        ...defaultConfig,
        search: { enabled: false, provider: 'compact' }
      },
      graph
    )
    await expect(readFile(join(cwd, '.docfuse/dist/search/zh.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('runs a custom search provider with stable public and filesystem helpers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-search-provider-'))
    await mkdir(join(cwd, '.docfuse/dist'), { recursive: true })
    const provider = defineSearchProvider({
      id: 'custom-search',
      client: 'compact',
      async write(context) {
        await writeFile(
          context.resolveOutputPath('custom-index.json', 'custom search index'),
          JSON.stringify({ url: context.publicPathFor('/guide/') })
        )
      }
    })
    const graph = createMockGraph()

    await writeSearchIndexes(cwd, { ...defaultConfig, search: { enabled: true, provider } }, graph)

    expect(searchProviderClient(provider)).toBe('compact')

    await expect(readFile(join(cwd, '.docfuse/dist/custom-index.json'), 'utf8')).resolves.toBe(
      '{"url":"/guide/"}'
    )
  })
})
