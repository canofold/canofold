import { mkdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMockGraph, createMockPage, trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { analyzeMarkdown } from '@canofold/markdown/server/analyze'
import { defaultConfig } from '../config/defaults'
import { writeAiOutputs } from './writeAiOutputs'

describe('writeAiOutputs', () => {
  it('writes structured AI files from the content graph', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-ai-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
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
          routePath: '/%E5%BF%AB%E9%80%9F%20%E5%BC%80%E5%A7%8B/a%29b/',
          outputPath: '快速 开始/a)b/index.html',
          markdownOutputPath: '快速 开始/a)b/index.md',
          title: 'API ](https://evil.example)',
          description: '中文首页',
          order: 0,
          group: '',
          status: 'published',
          search: true,
          ai: true,
          body: '# 首页',
          headings: [{ level: 1, text: '首页', slug: '首页' }],
          searchText: '首页',
          codeExamples: [{ language: 'ts', code: 'const value = 1' }],
          lastUpdated: new Date('2026-06-23T00:00:00.000Z').toISOString(),
          frontmatter: { title: 'API ](https://evil.example)', secretToken: 'must-not-be-published' }
        })
      ]
    })

    await writeAiOutputs(cwd, defaultConfig, graph)

    const pages = JSON.parse(await readFile(join(cwd, '.canofold/dist/ai/pages.json'), 'utf8'))
    const examples = JSON.parse(await readFile(join(cwd, '.canofold/dist/ai/code-examples.json'), 'utf8'))
    const index = await readFile(join(cwd, '.canofold/dist/ai/index.md'), 'utf8')
    const llms = await readFile(join(cwd, '.canofold/dist/llms.txt'), 'utf8')
    const manifest = JSON.parse(await readFile(join(cwd, '.canofold/dist/ai/manifest.json'), 'utf8'))

    expect(pages.pages[0].headings).toEqual([{ level: 1, text: '首页', slug: '首页' }])
    expect(pages.pages[0].frontmatter).toEqual({ title: 'API ](https://evil.example)' })
    expect(JSON.stringify(pages)).not.toContain('must-not-be-published')
    expect(await readFile(join(cwd, '.canofold/dist/llms-full.txt'), 'utf8')).not.toContain(
      'must-not-be-published'
    )
    expect(examples.examples[0].code).toBe('const value = 1')
    expect(index).toContain('/%E5%BF%AB%E9%80%9F%20%E5%BC%80%E5%A7%8B/a%29b/index.md')
    expect(analyzeMarkdown(index).links).toEqual(['/%E5%BF%AB%E9%80%9F%20%E5%BC%80%E5%A7%8B/a%29b/index.md'])
    expect(analyzeMarkdown(llms).links).toEqual(['/%E5%BF%AB%E9%80%9F%20%E5%BC%80%E5%A7%8B/a%29b/'])
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      includedVersions: 'current',
      totals: { pages: 1 },
      llmsFull: { mode: 'full' },
      partitions: [{ version: 'current', locale: 'zh', pages: 1 }]
    })
    const shardPath = manifest.partitions[0].shards[0].path.replace(/^\//, '')
    expect(await readFile(join(cwd, '.canofold/dist', shardPath), 'utf8')).toContain('"content":"# 首页"')

    const historical = {
      ...graph.pages[0]!,
      sourcePath: 'versions/v1/zh/index.md',
      sourceRelativePath: 'versions/v1/zh/index.md',
      version: 'v1',
      versionBase: '/v1/',
      docsDir: 'versions/v1',
      routePath: '/v1/',
      outputPath: 'v1/index.html',
      markdownOutputPath: 'v1/index.md',
      title: '历史 API'
    }
    const allVersionsGraph = createMockGraph({
      ...graph,
      versions: [...graph.versions, { id: 'v1', label: '1.x', docsDir: 'versions/v1', base: '/v1/' }],
      pages: [...graph.pages, historical]
    })
    const allVersionsConfig = {
      ...defaultConfig,
      outputDir: '.canofold/all-versions',
      ai: { ...defaultConfig.ai, versions: 'all' as const }
    }
    await mkdir(join(cwd, allVersionsConfig.outputDir), { recursive: true })
    await writeAiOutputs(cwd, allVersionsConfig, allVersionsGraph)
    const allManifest = JSON.parse(
      await readFile(join(cwd, allVersionsConfig.outputDir, 'ai/manifest.json'), 'utf8')
    )
    expect(allManifest.partitions.map((partition: { version: string }) => partition.version)).toEqual([
      'current',
      'v1'
    ])
  })

  it('partitions large Unicode content into bounded shards and keeps llms-full as a manifest pointer', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-ai-bounded-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    const body = `# 大页面\n\n${'中文内容\\n'.repeat(400)}`
    const graph = createMockGraph({
      pages: [
        createMockPage({
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
          title: '大页面',
          description: '',
          order: 0,
          group: '',
          status: 'published',
          search: true,
          ai: true,
          body,
          headings: [],
          searchText: body,
          codeExamples: [],
          lastUpdated: '2026-06-23T00:00:00.000Z',
          frontmatter: {}
        })
      ]
    })
    const config = {
      ...defaultConfig,
      ai: {
        ...defaultConfig.ai,
        chunkSizeBytes: 512,
        llmsFullMaxBytes: 128,
        llmsFullOverflow: 'manifest' as const
      }
    }

    await writeAiOutputs(cwd, config, graph)

    const manifest = JSON.parse(await readFile(join(cwd, '.canofold/dist/ai/manifest.json'), 'utf8'))
    expect(manifest.llmsFull).toMatchObject({ mode: 'manifest', sourceBytes: Buffer.byteLength(body) })
    expect(await readFile(join(cwd, '.canofold/dist/llms-full.txt'), 'utf8')).toContain('/ai/manifest.json')
    const shardPaths = manifest.partitions[0].shards.map((shard: { path: string }) => shard.path)
    const records = []
    for (const shardPath of shardPaths) {
      const absolutePath = join(cwd, '.canofold/dist', shardPath.replace(/^\//, ''))
      expect((await stat(absolutePath)).size).toBeLessThanOrEqual(512)
      records.push(
        ...(await readFile(absolutePath, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as { content: string })
      )
    }
    expect(records.map((record) => record.content).join('')).toBe(body)
  })

  it('can fail atomically instead of degrading llms-full when configured', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-ai-error-'))
    await mkdir(join(cwd, '.canofold/dist'), { recursive: true })
    const graph = createMockGraph({
      pages: [
        createMockPage({
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
          title: 'Home',
          description: '',
          order: 0,
          group: '',
          status: 'published',
          search: true,
          ai: true,
          body: 'x'.repeat(200),
          headings: [],
          searchText: '',
          codeExamples: [],
          lastUpdated: '',
          frontmatter: {}
        })
      ]
    })

    await expect(
      writeAiOutputs(
        cwd,
        {
          ...defaultConfig,
          ai: {
            ...defaultConfig.ai,
            chunkSizeBytes: 512,
            llmsFullMaxBytes: 32,
            llmsFullOverflow: 'error'
          }
        },
        graph
      )
    ).rejects.toThrow('exceeding ai.llmsFullMaxBytes')
  })
})
