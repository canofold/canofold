import { lstat, open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type { MarkdownRenderer } from '@canofold/markdown/server'
import { analyzeMarkdown } from '@canofold/markdown/server/analyze'
import { fingerprint, fingerprintBytes } from '../build/fingerprint'
import type { CanofoldConfig } from '../config/types'
import { documentationVersions } from '../config/versions'
import { assertDisjointPaths, isInside, resolveProjectPath } from '../utils/paths'
import {
  canonicalRoutePath,
  htmlOutputPathFor,
  markdownOutputPathFor,
  routePathFor,
  localeRootPath
} from './routes'
import type { ContentSource } from './source'
import type { DocPage } from './types'
import { ContentDiagnosticsError, type CheckDiagnostic } from '../check/diagnostics'

const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_SOURCE_BYTES = 64 * 1024 * 1024
const MAX_SOURCE_FILES = 512
const MAX_DOCUMENTS = 10_001
const slug = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function assertContentSources(config: CanofoldConfig) {
  const ids = new Set<string>()
  const versions = documentationVersions(config)
  for (const source of config.sources) {
    if (!slug.test(source.id) || !slug.test(source.kind) || !source.revision.trim()) {
      throw new Error('Content source id/kind must be lowercase kebab-case and revision must be nonempty')
    }
    if (source.kind === 'markdown' || source.kind === 'mdx') {
      throw new Error(`Content source kind is reserved for authored documents: ${source.kind}`)
    }
    const identity = JSON.stringify([source.version, source.locale, source.id])
    if (ids.has(identity)) throw new Error(`Duplicate content source id in version/locale: ${source.id}`)
    ids.add(identity)
    if (!versions.some((version) => version.id === source.version)) {
      throw new Error(`Unknown version for content source ${source.id}: ${source.version}`)
    }
    if (!config.i18n.locales.includes(source.locale)) {
      throw new Error(`Unknown locale for content source ${source.id}: ${source.locale}`)
    }
    canonicalRoutePath(source.base)
    if (!source.base.endsWith('/')) {
      throw new Error(`Content source base must be an absolute route ending in /: ${source.id}`)
    }
    // Reuse the cache's canonical JSON boundary; do not silently omit functions or custom objects.
    try {
      fingerprint(source.cacheKey)
    } catch (cause) {
      throw new Error(`Content source cacheKey must be JSON data: ${source.id}`, { cause })
    }
  }
}

async function trackedInput(cwd: string, source: ContentSource) {
  const root = resolveProjectPath(cwd, source.root, `sources[${source.id}].root`)
  const entry = resolveProjectPath(cwd, source.entry, `sources[${source.id}].entry`)
  const canonicalRoot = await realpath(root)
  if (!(await lstat(root)).isDirectory()) throw new Error(`Source root must be a directory: ${source.id}`)
  if (!isInside(await realpath(cwd), canonicalRoot))
    throw new Error(`Source root escapes project: ${source.id}`)
  const dependencies = new Map<string, { revision: string }>()
  const pending = new Map<string, Promise<string>>()
  let bytes = 0
  async function readOnce(input: string) {
    const path = input
    // Reject symlinks even when their current target is inside the allowed tree.
    let segment = path
    while (segment !== resolve(cwd)) {
      if ((await lstat(segment)).isSymbolicLink())
        throw new Error(`Source input must not use symbolic links: ${input}`)
      segment = dirname(segment)
    }
    if (!isInside(canonicalRoot, await realpath(path))) throw new Error(`Source input escapes root: ${input}`)
    const key = relative(cwd, path).replace(/\\/g, '/')
    const stat = await lstat(path)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
      throw new Error(`Source input exceeds file limit or is not a regular file: ${key}`)
    }
    bytes += stat.size
    if (bytes > MAX_SOURCE_BYTES)
      throw new Error(`Source inputs exceed ${MAX_SOURCE_BYTES} bytes: ${source.id}`)
    // A bounded descriptor read also covers files growing between stat and read.
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    let buffer: Buffer
    try {
      buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_FILE_BYTES + 1))
      let length = 0
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, length)
        if (result.bytesRead === 0) break
        length += result.bytesRead
      }
      buffer = buffer.subarray(0, length)
      const after = await handle.stat()
      if (
        buffer.length !== stat.size ||
        after.size !== stat.size ||
        after.mtimeMs !== stat.mtimeMs ||
        after.ino !== stat.ino
      ) {
        throw new Error(`Source input changed while reading: ${key}`)
      }
    } finally {
      await handle.close()
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    dependencies.set(key, { revision: fingerprintBytes(buffer) })
    return raw
  }
  function read(input: string) {
    const path = resolve(root, input)
    if (!isInside(root, path)) return Promise.reject(new Error(`Source input escapes root: ${input}`))
    const existing = pending.get(path)
    if (existing) return existing
    if (pending.size >= MAX_SOURCE_FILES)
      return Promise.reject(new Error(`Source input exceeds file count limit: ${source.id}`))
    const result = readOnce(path)
    pending.set(path, result)
    return result
  }
  await read(entry)
  return { root, entry, read, dependencies }
}

/** Adapt source facts once, before navigation, search and machine-output projection. */
export async function loadSourcePages(
  cwd: string,
  config: CanofoldConfig,
  renderer: MarkdownRenderer,
  diagnostics?: CheckDiagnostic[]
) {
  assertContentSources(config)
  const versions = documentationVersions(config)
  const pages: DocPage[] = []
  for (const source of config.sources) {
    const sourceBase = canonicalRoutePath(source.base)
    await assertDisjointPaths(
      resolve(cwd, config.outputDir),
      resolve(cwd, source.root),
      `sources[${source.id}].root`
    )
    const input = await trackedInput(cwd, source)
    const version = versions.find((candidate) => candidate.id === source.version)!
    let documents: readonly import('./source').SourceDocument[]
    try {
      documents = await source.load({
        cwd,
        root: input.root,
        entry: input.entry,
        read: input.read,
        fail: ({ message, file = input.entry, pointer = '', line, column }) => {
          const path = relative(cwd, resolve(input.root, file)).replace(/\\/g, '/')
          if (!input.dependencies.has(path))
            throw new Error(`Source diagnostic must refer to a tracked input: ${source.id}`)
          if (
            (line !== undefined && (!Number.isSafeInteger(line) || line < 1)) ||
            (column !== undefined && (line === undefined || !Number.isSafeInteger(column) || column < 1))
          )
            throw new Error(`Source diagnostic has an invalid position: ${source.id}`)
          throw new ContentDiagnosticsError([
            {
              ruleId: 'content-syntax',
              severity: 'error',
              page: path,
              sourcePointer: pointer,
              message,
              ...(line === undefined ? {} : { line }),
              ...(column === undefined ? {} : { column })
            }
          ])
        },
        routeBase: `${localeRootPath(source.locale, config.i18n.defaultLocale, version.base)}${sourceBase.slice(1)}`
      })
    } catch (error) {
      if (!diagnostics || !(error instanceof ContentDiagnosticsError)) throw error
      diagnostics.push(...error.diagnostics)
      continue
    }
    if (documents.length > MAX_DOCUMENTS) throw new Error(`Too many derived documents: ${source.id}`)
    const dependencies = [...input.dependencies]
      .map(([path, value]) => ({ path, revision: value.revision }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    if (
      source.version !== versions[0]!.id &&
      dependencies.some(
        (dependency) => !isInside(resolve(cwd, version.docsDir), resolve(cwd, dependency.path))
      )
    ) {
      throw new Error(`Historical source dependencies must remain inside ${version.docsDir}: ${source.id}`)
    }
    const keys = new Set<string>()
    const sourceRelativePath = relative(cwd, input.entry).replace(/\\/g, '/')
    const optionsRevision = fingerprint(source.cacheKey)
    const dependenciesRevision = fingerprint(dependencies)
    for (const document of documents) {
      if (
        !document.key ||
        keys.has(document.key) ||
        !document.title.trim() ||
        (document.pointer !== '' && !/^\/(?:[^~]|~[01])*$/.test(document.pointer))
      ) {
        throw new Error(`Invalid or duplicate derived document identity: ${source.id} ${document.key}`)
      }
      keys.add(document.key)
      const route = `${sourceBase}${document.path}`
      if (canonicalRoutePath(route) !== route || !route.endsWith('/')) {
        throw new Error(`Invalid derived document route: ${source.id} ${document.path}`)
      }
      const pagePath = [
        ...route.slice(1, -1).split('/').filter(Boolean).map(decodeURIComponent),
        'index.md'
      ].join('/')
      const relativePath = join(source.locale, pagePath).replace(/\\/g, '/')
      const directories: DocPage['navigation']['directories'] = sourceBase
        .slice(1, -1)
        .split('/')
        .filter(Boolean)
        .map((segment) => ({ segment: decodeURIComponent(segment) }))
      if (document.group)
        directories.push({ segment: encodeURIComponent(document.group), title: document.group })
      const analysis = await renderer.analyze(document.body, {
        mode: 'markdown',
        markdown: { ...config.markdown, html: 'sanitize' }
      })
      const { directiveIssues, missingCodeBlockLanguageLocations } = analyzeMarkdown(document.body, {
        plugins: config.markdown.plugins
      })
      pages.push({
        sourcePath: input.entry,
        sourceRelativePath,
        sourceRevision: input.dependencies.get(sourceRelativePath)!.revision,
        transformedSource: document.body,
        relativePath,
        version: version.id,
        versionBase: version.base,
        docsDir: version.docsDir,
        locale: source.locale,
        routePath: routePathFor(source.locale, config.i18n.defaultLocale, pagePath, version.base),
        outputPath: htmlOutputPathFor(source.locale, config.i18n.defaultLocale, pagePath, version.base),
        markdownOutputPath: markdownOutputPathFor(
          source.locale,
          config.i18n.defaultLocale,
          pagePath,
          version.base
        ),
        title: document.title,
        description: document.description,
        order: document.order ?? Number.MAX_SAFE_INTEGER,
        group: directories[0]?.segment ?? '',
        navigation: { directories, index: document.path === '' },
        status: 'published',
        search: true,
        ai: true,
        body: document.body,
        syntax: { directiveIssues, missingCodeBlockLanguageLocations },
        searchText: analysis.text,
        headings: analysis.headings,
        codeExamples: analysis.codeExamples,
        excerpt: analysis.excerpt,
        references: {
          links: analysis.links,
          linkLocations: analysis.linkLocations,
          images: analysis.images,
          imageLocations: analysis.imageLocations,
          anchors: analysis.anchors
        },
        demos: [],
        lastUpdated: '',
        frontmatter: { title: document.title, description: document.description, tags: document.tags ?? [] },
        origin: {
          id: source.id,
          kind: source.kind,
          key: document.key,
          pointer: document.pointer,
          adapterRevision: source.revision,
          optionsRevision,
          dependencies,
          dependenciesRevision,
          facts: document.facts ?? {}
        }
      })
    }
  }
  return pages
}
