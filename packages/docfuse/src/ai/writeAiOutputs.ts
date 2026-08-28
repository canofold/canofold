import { mkdir, open, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { fingerprintBytes } from '../build/fingerprint'
import type { DocfuseConfig } from '../config/types'
import { publicFrontmatterFor } from '../content/frontmatter'
import type { ContentGraph, DocPage } from '../content/types'
import { publicPathFor } from '../seo/urls'
import { logInfo } from '../utils/logger'
import { resolveOutputRoot } from '../utils/paths'
import { createDeterministicSummary } from './summaries'

const AI_MANIFEST_SCHEMA_VERSION = 1

function markdownLinkLabel(value: string) {
  return value.replace(/\r?\n/g, ' ').replace(/([\\[\]])/g, '\\$1')
}

function pageMetadata(config: DocfuseConfig, page: DocPage) {
  const markdownRoute = `${page.routePath}index.md`
  return {
    title: page.title,
    description: page.description,
    routePath: publicPathFor(config, page.routePath),
    markdownPath: publicPathFor(config, markdownRoute),
    version: page.version,
    locale: page.locale,
    status: page.status,
    tags: Array.isArray(page.frontmatter.tags)
      ? page.frontmatter.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    owner: typeof page.frontmatter.owner === 'string' ? page.frontmatter.owner : undefined,
    headings: page.headings,
    lastUpdated: page.lastUpdated,
    frontmatter: publicFrontmatterFor(page.frontmatter)
  }
}

async function writePieces(path: string, pieces: Iterable<string> | AsyncIterable<string>) {
  await mkdir(dirname(path), { recursive: true })
  const file = await open(path, 'w')
  try {
    for await (const piece of pieces) await file.write(piece)
  } finally {
    await file.close()
  }
}

async function writeJsonArray<T>(path: string, key: string, values: Iterable<T>) {
  async function* pieces() {
    yield `{"${key}":[`
    let first = true
    for (const value of values) {
      yield `${first ? '' : ','}\n${JSON.stringify(value, null, 2)}`
      first = false
    }
    yield `${first ? '' : '\n'}]}\n`
  }
  await writePieces(path, pieces())
}

function selectedPages(config: DocfuseConfig, graph: ContentGraph) {
  return graph.pages.filter(
    (page) => page.ai && (config.ai.versions === 'all' || page.version === graph.currentVersion)
  )
}

interface ContentRecordBase {
  routePath: string
  markdownPath: string
  title: string
  description: string
  version: string
  locale: string
}

interface ContentRecord extends ContentRecordBase {
  part: number
  parts: number
  content: string
}

function jsonEscapedCharacterBytes(character: string) {
  if (character === '"' || character === '\\') return 2
  const code = character.codePointAt(0) ?? 0
  if (code === 8 || code === 9 || code === 10 || code === 12 || code === 13) return 2
  if (code < 32) return 6
  return Buffer.byteLength(character)
}

function splitContentRecord(base: ContentRecordBase, source: string, maximumBytes: number): ContentRecord[] {
  const conservativeHeader = Buffer.byteLength(
    JSON.stringify({ ...base, part: 999_999_999, parts: 999_999_999, content: '' }) + '\n'
  )
  const contentBudget = maximumBytes - conservativeHeader
  if (contentBudget < 1) throw new Error(`AI chunkSizeBytes ${maximumBytes} is too small for page metadata`)

  const pieces: string[] = []
  let start = 0
  let end = 0
  let bytes = 0
  for (const character of source) {
    const characterBytes = jsonEscapedCharacterBytes(character)
    if (end > start && bytes + characterBytes > contentBudget) {
      pieces.push(source.slice(start, end))
      start = end
      bytes = 0
    }
    end += character.length
    bytes += characterBytes
  }
  pieces.push(source.slice(start, end))

  const records = pieces.map((content, index) => ({
    ...base,
    part: index + 1,
    parts: pieces.length,
    content
  }))
  for (const record of records) {
    const bytes = Buffer.byteLength(JSON.stringify(record) + '\n')
    if (bytes > maximumBytes) {
      throw new Error(`Unable to keep AI content record within ${maximumBytes} bytes: ${base.routePath}`)
    }
  }
  return records
}

interface AiContentShard {
  path: string
  bytes: number
  records: number
  fingerprint: string
}

async function writePartition(
  outputRoot: string,
  config: DocfuseConfig,
  version: string,
  locale: string,
  pages: readonly DocPage[]
) {
  const directory = posix.join('ai', 'content', version, locale)
  const shards: AiContentShard[] = []
  let buffer = ''
  let records = 0

  async function flush() {
    if (!buffer) return
    const name = `${String(shards.length + 1).padStart(4, '0')}.jsonl`
    const relativePath = posix.join(directory, name)
    const bytes = Buffer.byteLength(buffer)
    await writeFile(join(outputRoot, relativePath), buffer)
    shards.push({
      path: publicPathFor(config, `/${relativePath}`),
      bytes,
      records,
      fingerprint: fingerprintBytes(Buffer.from(buffer))
    })
    buffer = ''
    records = 0
  }

  await mkdir(join(outputRoot, directory), { recursive: true })
  for (const page of pages) {
    const metadata = pageMetadata(config, page)
    const base: ContentRecordBase = {
      routePath: metadata.routePath,
      markdownPath: metadata.markdownPath,
      title: page.title,
      description: page.description,
      version: page.version,
      locale: page.locale
    }
    for (const record of splitContentRecord(base, page.body, config.ai.chunkSizeBytes)) {
      const line = JSON.stringify(record) + '\n'
      if (buffer && Buffer.byteLength(buffer) + Buffer.byteLength(line) > config.ai.chunkSizeBytes) {
        await flush()
      }
      buffer += line
      records += 1
    }
  }
  await flush()
  return shards
}

function llmsFullBytes(pages: readonly DocPage[]) {
  const separatorBytes = Buffer.byteLength('\n\n---\n\n')
  return pages.reduce(
    (total, page, index) => total + Buffer.byteLength(page.body) + (index ? separatorBytes : 0),
    0
  )
}

export async function writeAiOutputs(cwd: string, config: DocfuseConfig, graph: ContentGraph) {
  const outputRoot = resolveOutputRoot(cwd, config.outputDir)
  const aiDir = join(outputRoot, 'ai')
  const contentRoot = join(aiDir, 'content')
  await mkdir(aiDir, { recursive: true })
  await rm(contentRoot, { recursive: true, force: true })

  const aiPages = selectedPages(config, graph)
  const pages = aiPages.map((page) => pageMetadata(config, page))
  const partitions = new Map<string, DocPage[]>()
  for (const page of aiPages) {
    const key = `${page.version}\u0000${page.locale}`
    const partition = partitions.get(key) ?? []
    partition.push(page)
    partitions.set(key, partition)
  }
  const partitionManifest = []
  for (const [key, partitionPages] of partitions) {
    const [version = '', locale = ''] = key.split('\u0000')
    const shards = await writePartition(outputRoot, config, version, locale, partitionPages)
    partitionManifest.push({
      version,
      locale,
      pages: partitionPages.length,
      sourceBytes: partitionPages.reduce((total, page) => total + Buffer.byteLength(page.body), 0),
      shards
    })
  }

  await writeJsonArray(join(aiDir, 'pages.json'), 'pages', pages)
  if (config.ai.pageSummaries) {
    await writeJsonArray(
      join(aiDir, 'summaries.json'),
      'summaries',
      aiPages.map((page) => ({
        routePath: publicPathFor(config, page.routePath),
        summary: createDeterministicSummary({ description: page.description, body: page.body })
      }))
    )
  }
  if (config.ai.codeExamples) {
    function* examples() {
      for (const page of aiPages) {
        for (const example of page.codeExamples) {
          yield {
            routePath: publicPathFor(config, page.routePath),
            ...example
          }
        }
      }
    }
    await writeJsonArray(join(aiDir, 'code-examples.json'), 'examples', examples())
  }
  if (config.ai.markdownIndex) {
    await writePieces(
      join(aiDir, 'index.md'),
      pages.map((page) => `- [${markdownLinkLabel(page.title || page.routePath)}](${page.markdownPath})\n`)
    )
  }
  if (config.ai.llmsTxt) {
    await writePieces(
      join(outputRoot, 'llms.txt'),
      pages.map((page) => `- [${markdownLinkLabel(page.title || page.routePath)}](${page.routePath})\n`)
    )
  }

  const aggregateBytes = llmsFullBytes(aiPages)
  let llmsFullMode: 'disabled' | 'full' | 'manifest' = 'disabled'
  if (config.ai.llmsFullTxt) {
    if (aggregateBytes <= config.ai.llmsFullMaxBytes) {
      async function* bodies() {
        for (const [index, page] of aiPages.entries()) {
          if (index) yield '\n\n---\n\n'
          yield page.body
        }
      }
      await writePieces(join(outputRoot, 'llms-full.txt'), bodies())
      llmsFullMode = 'full'
    } else if (config.ai.llmsFullOverflow === 'error') {
      throw new Error(
        `llms-full.txt requires ${aggregateBytes} bytes, exceeding ai.llmsFullMaxBytes ${config.ai.llmsFullMaxBytes}`
      )
    } else {
      await writeFile(
        join(outputRoot, 'llms-full.txt'),
        [
          '# Docfuse AI content manifest',
          '',
          `The full Markdown corpus requires ${aggregateBytes} bytes and exceeds the configured single-file budget of ${config.ai.llmsFullMaxBytes} bytes.`,
          '',
          `Use ${publicPathFor(config, '/ai/manifest.json')} to load the complete versioned and locale-partitioned content shards.`,
          ''
        ].join('\n')
      )
      llmsFullMode = 'manifest'
      logInfo(
        `llms-full.txt exceeded ${config.ai.llmsFullMaxBytes} bytes; wrote a bounded manifest pointer instead`
      )
    }
  }

  await writeFile(
    join(aiDir, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: AI_MANIFEST_SCHEMA_VERSION,
        currentVersion: graph.currentVersion,
        includedVersions: config.ai.versions,
        totals: {
          pages: aiPages.length,
          sourceBytes: aiPages.reduce((total, page) => total + Buffer.byteLength(page.body), 0)
        },
        budgets: {
          chunkSizeBytes: config.ai.chunkSizeBytes,
          llmsFullMaxBytes: config.ai.llmsFullMaxBytes
        },
        llmsFull: {
          enabled: config.ai.llmsFullTxt,
          mode: llmsFullMode,
          sourceBytes: aggregateBytes,
          path: config.ai.llmsFullTxt ? publicPathFor(config, '/llms-full.txt') : null
        },
        partitions: partitionManifest
      },
      null,
      2
    )
  )
}
