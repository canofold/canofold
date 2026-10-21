import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import type { Element, Parents, Root as HastRoot } from 'hast'
import type {
  LanguageInput,
  LanguageRegistration,
  ShikiTransformer,
  ThemeInput,
  ThemeRegistration
} from '@shikijs/types'
import {
  transformerMetaHighlight,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight
} from '@shikijs/transformers'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledThemes, type BundledTheme } from 'shiki/themes'
import type { Pluggable, Transformer } from 'unified'
import { visit } from 'unist-util-visit'
import { toString } from 'hast-util-to-string'
import type { NormalizedMarkdownOptions } from './normalizeOptions.js'
import { parseFenceMetadata } from './fenceMetadata.js'
import { stableJson } from './stableJson.js'
import { createPreparationCache } from './preparationCache.js'

// Highlight fragments contain only Shiki-owned data, before user rehype plugins.
// Compressed retention avoids keeping a second token tree alive for long edits.
const highlightedBlocks = createPreparationCache<ArrayBuffer>(
  1024,
  8 * 1024 * 1024,
  (value) => value.byteLength
)
let nextHighlighterId = 0

async function compressBlock(block: Element) {
  const stream = new Response(JSON.stringify(block)).body!.pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

async function restoreBlock(value: ArrayBuffer): Promise<Element> {
  const stream = new Response(value).body!.pipeThrough(new DecompressionStream('gzip'))
  return (await new Response(stream).json()) as Element
}

type LanguageModule = { default: LanguageInput }
type LanguageLoader = () => Promise<LanguageModule>

function transformerFenceMetadata(): ShikiTransformer {
  return {
    name: 'canofold:fence-metadata',
    pre(node) {
      const meta = String(this.options.meta?.__raw ?? '')
      const { filename, overflow } = parseFenceMetadata(meta)
      if (filename) node.properties.dataCfFilename = filename
      if (overflow) node.properties.dataCfCodeOverflow = overflow
      return node
    }
  }
}

const builtinLanguageLoaders = {
  bash: () => import('@shikijs/langs/bash'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  diff: () => import('@shikijs/langs/diff'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  dotenv: () => import('@shikijs/langs/dotenv'),
  go: () => import('@shikijs/langs/go'),
  graphql: () => import('@shikijs/langs/graphql'),
  html: () => import('@shikijs/langs/html'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  jsx: () => import('@shikijs/langs/jsx'),
  markdown: () => import('@shikijs/langs/markdown'),
  mdx: () => import('@shikijs/langs/mdx'),
  nginx: () => import('@shikijs/langs/nginx'),
  php: () => import('@shikijs/langs/php'),
  python: () => import('@shikijs/langs/python'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  scss: () => import('@shikijs/langs/scss'),
  sql: () => import('@shikijs/langs/sql'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  vue: () => import('@shikijs/langs/vue'),
  yaml: () => import('@shikijs/langs/yaml')
} satisfies Record<string, LanguageLoader>

type BuiltinLanguage = keyof typeof builtinLanguageLoaders

const languageAliases: Readonly<Record<string, BuiltinLanguage>> = {
  bash: 'bash',
  c: 'c',
  'c++': 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  csharp: 'csharp',
  css: 'css',
  diff: 'diff',
  docker: 'dockerfile',
  dockerfile: 'dockerfile',
  dotenv: 'dotenv',
  env: 'dotenv',
  gql: 'graphql',
  go: 'go',
  graphql: 'graphql',
  htm: 'html',
  html: 'html',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsonc: 'jsonc',
  jsx: 'jsx',
  markdown: 'markdown',
  md: 'markdown',
  mdx: 'mdx',
  nginx: 'nginx',
  php: 'php',
  py: 'python',
  python: 'python',
  rb: 'ruby',
  ruby: 'ruby',
  rust: 'rust',
  rs: 'rust',
  sass: 'scss',
  scss: 'scss',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  vue: 'vue',
  yml: 'yaml',
  yaml: 'yaml',
  zsh: 'bash'
}

const specialLanguages = new Set(['ansi', 'text', 'plaintext', 'txt', 'plain'])

interface ManagedHighlighter {
  id: number
  highlighter: Awaited<ReturnType<typeof createHighlighterCore>>
  loadedInputs: Set<string>
  loadChain: Promise<void>
}

const highlighters = new Map<string, Promise<ManagedHighlighter>>()
const HIGHLIGHTER_CACHE_LIMIT = 8
const languageConfigIds = new WeakMap<object, number>()
let nextLanguageConfigId = 1

function themeInput(theme: string | ThemeRegistration): ThemeInput {
  // Shiki normalizes registrations in place. Do not mutate our shared default
  // theme or change its cache identity after the first highlighter is created.
  if (typeof theme !== 'string') return structuredClone(theme)
  const loader = bundledThemes[theme as BundledTheme]
  if (!loader) throw new Error(`Unknown Shiki theme: ${theme}`)
  return loader
}

function highlighterKey(options: NormalizedMarkdownOptions) {
  const themes =
    stableJson(options.codeThemes) ??
    `${String(options.codeThemes.light)}\0${String(options.codeThemes.dark)}`
  if (Object.keys(options.codeLanguages).length === 0) return themes
  const serializableLanguages = stableJson(options.codeLanguages)
  if (serializableLanguages !== undefined) return `${themes}\0${serializableLanguages}`

  const languageConfig = options.codeLanguages as object
  let identity = languageConfigIds.get(languageConfig)
  if (identity === undefined) {
    identity = nextLanguageConfigId++
    languageConfigIds.set(languageConfig, identity)
  }
  return `${themes}\0custom:${identity}`
}

function rememberHighlighter(key: string, highlighter: Promise<ManagedHighlighter>) {
  highlighters.delete(key)
  highlighters.set(key, highlighter)
  while (highlighters.size > HIGHLIGHTER_CACHE_LIMIT) {
    const oldest = highlighters.keys().next().value
    if (oldest === undefined) break
    highlighters.delete(oldest)
  }
  return highlighter
}

function managedHighlighter(options: NormalizedMarkdownOptions) {
  const key = highlighterKey(options)
  const existing = highlighters.get(key)
  if (existing) {
    highlighters.delete(key)
    highlighters.set(key, existing)
    return existing
  }

  const created = createHighlighterCore({
    themes: [themeInput(options.codeThemes.light), themeInput(options.codeThemes.dark)],
    langs: [],
    engine: createJavaScriptRegexEngine()
  })
    .then((highlighter) => ({
      id: nextHighlighterId++,
      highlighter,
      loadedInputs: new Set<string>(),
      loadChain: Promise.resolve()
    }))
    .catch((error) => {
      if (highlighters.get(key) === created) highlighters.delete(key)
      throw error
    })
  return rememberHighlighter(key, created)
}

async function resolveCustomLanguage(input: LanguageInput, alias: string) {
  const loaded = await (typeof input === 'function' ? input() : input)
  const moduleValue = loaded as
    LanguageRegistration | LanguageRegistration[] | { default: LanguageRegistration | LanguageRegistration[] }
  const value =
    typeof moduleValue === 'object' && moduleValue !== null && 'default' in moduleValue
      ? moduleValue.default
      : moduleValue
  const registrations = (Array.isArray(value) ? value : [value]).map((registration) => ({
    ...registration,
    aliases: registration.aliases ? [...registration.aliases] : undefined
  }))
  const target =
    registrations.find(
      (registration) => registration.name === alias || registration.aliases?.includes(alias)
    ) ?? registrations.at(-1)
  if (target && target.name !== alias && !target.aliases?.includes(alias)) {
    target.aliases = [...(target.aliases ?? []), alias]
  }
  return registrations
}

function languageInput(language: string, options: NormalizedMarkdownOptions) {
  const custom = options.codeLanguages[language]
  if (custom) {
    return {
      key: `custom:${language}`,
      input: () => resolveCustomLanguage(custom, language)
    }
  }
  const builtin = languageAliases[language]
  if (!builtin) return undefined
  return { key: `builtin:${builtin}`, input: builtinLanguageLoaders[builtin] }
}

function reportUnknownLanguages(
  languages: readonly string[],
  options: NormalizedMarkdownOptions,
  warnedLanguages: Set<string>
) {
  if (languages.length === 0 || options.unknownLanguage === 'plain-text') return
  if (options.unknownLanguage === 'error') {
    throw new Error(
      `Unsupported Markdown code language${languages.length > 1 ? 's' : ''}: ${languages.join(', ')}`
    )
  }

  for (const language of languages) {
    if (warnedLanguages.has(language)) continue
    warnedLanguages.add(language)
    console.warn(
      `[canofold/markdown] Unsupported code language "${language}"; rendering it as ${options.fallbackLanguage}.`
    )
  }
}

async function loadLanguages(
  managed: ManagedHighlighter,
  requestedLanguages: readonly string[],
  options: NormalizedMarkdownOptions,
  warnedLanguages: Set<string>
) {
  const requested = [...new Set([...requestedLanguages, options.fallbackLanguage])]
    .map((language) => language.trim().toLowerCase())
    .filter((language) => language && !specialLanguages.has(language))
  const resolved = requested.map((language) => ({ language, resolved: languageInput(language, options) }))
  const unknown = resolved.filter((entry) => !entry.resolved).map((entry) => entry.language)
  reportUnknownLanguages(unknown, options, warnedLanguages)

  const pending = resolved.flatMap((entry) => {
    if (!entry.resolved || managed.loadedInputs.has(entry.resolved.key)) return []
    return [entry.resolved]
  })
  if (pending.length === 0) return

  const request = managed.loadChain.then(async () => {
    for (const entry of pending) {
      if (managed.loadedInputs.has(entry.key)) continue
      await managed.highlighter.loadLanguage(entry.input)
      managed.loadedInputs.add(entry.key)
    }
  })
  // Keep later language loads serialized without allowing one invalid custom
  // grammar to poison this cached highlighter for the rest of the process.
  managed.loadChain = request.catch(() => undefined)
  await request
}

export async function createSyntaxHighlighterPlugin(
  codeLanguages: readonly string[],
  options: NormalizedMarkdownOptions,
  warnedLanguages = new Set<string>(),
  excludedLanguages: ReadonlySet<string> = new Set(),
  signal?: AbortSignal
): Promise<Pluggable> {
  const managed = await managedHighlighter(options)
  await loadLanguages(managed, codeLanguages, options, warnedLanguages)
  const fallbackLanguage = languageInput(options.fallbackLanguage, options)
    ? options.fallbackLanguage
    : 'text'

  return () => {
    const highlight = rehypeShikiFromHighlighter(managed.highlighter, {
      themes: structuredClone(options.codeThemes),
      addLanguageClass: true,
      mergeSameStyleTokens: true,
      fallbackLanguage,
      transformers: [
        {
          name: 'canofold:code-line-endings',
          preprocess: (code) => code.replace(/\r\n?/g, '\n')
        },
        transformerFenceMetadata(),
        transformerMetaHighlight(),
        transformerNotationHighlight(),
        transformerNotationDiff(),
        transformerNotationFocus(),
        transformerNotationWordHighlight(),
        transformerNotationErrorLevel()
      ]
    })

    const transform: Transformer<HastRoot, HastRoot> = async (tree, file) => {
      const blocks: Array<{ node: Element; parent: Parents; index: number; key: string }> = []
      visit(tree, 'element', (node, index, parent) => {
        if (node.tagName !== 'pre' || index === undefined || !parent) return
        const code = node.children[0]
        if (code?.type !== 'element' || code.tagName !== 'code') return
        const className = code.properties.className
        const languageClass = Array.isArray(className)
          ? className.find((value) => typeof value === 'string' && value.startsWith('language-'))
          : undefined
        if (typeof languageClass !== 'string') return
        if (excludedLanguages.has(languageClass.slice('language-'.length).toLowerCase())) return
        const meta = code.data?.meta ?? code.properties.metastring?.toString() ?? ''
        const key = JSON.stringify([managed.id, fallbackLanguage, languageClass, meta, toString(code)])
        blocks.push({ node, parent, index, key })
      })
      for (const { node, parent, index, key } of blocks) {
        signal?.throwIfAborted()
        let fresh: Element | undefined
        const value = await highlightedBlocks.get(key, async () => {
          const block: HastRoot = { type: 'root', children: [node] }
          const result = await highlight(block, file, () => undefined)
          if (result instanceof Error) throw result
          // Rehype Shiki replaces a pre with its generated root fragment.
          const fragment = block.children[0] as Element | HastRoot
          const output = fragment.type === 'root' ? fragment.children[0] : fragment
          if (output?.type !== 'element') throw new Error('Shiki returned an invalid code block')
          fresh = output
          return compressBlock(output)
        })
        // Cached fragments are decoded into a fresh tree so downstream plugins
        // and concurrent renderers cannot mutate another document's tokens.
        const output = fresh ?? (await restoreBlock(value))
        signal?.throwIfAborted()
        parent.children[index] = output
      }
    }

    return transform
  }
}
