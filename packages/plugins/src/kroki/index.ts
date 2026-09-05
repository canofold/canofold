import { defineMarkdownPlugin, type MarkdownPlugin } from '@canofold/markdown'
import { strToU8, zlibSync } from 'fflate'

import { diagramFence } from '../shared/diagram'
import { hasMarkdownFenceLanguage } from '../shared/markdownSource'

const PLUGIN_VERSION = '3'
const DEFAULT_SERVER = 'https://kroki.io'
const DEFAULT_LANGUAGES: Record<string, string> = {
  graphviz: 'graphviz',
  dot: 'graphviz',
  gv: 'graphviz',
  d2: 'd2'
}

export interface KrokiOptions {
  server?: string
  /** Map Markdown fence labels to Kroki diagram types. */
  languages?: Readonly<Record<string, string>>
  format?: 'svg' | 'png'
}

function encodeKroki(source: string) {
  let binary = ''
  for (const byte of zlibSync(strToU8(source), { level: 9 })) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function stripTrailingSlashes(value: string) {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

function krokiUrl(server: string, type: string, format: 'svg' | 'png', source: string) {
  return `${server}/${encodeURIComponent(type)}/${format}/${encodeKroki(source)}`
}

/** Render plugin-owned diagram fences through a Kroki-compatible server. */
export function kroki(options: KrokiOptions = {}): MarkdownPlugin {
  const server = (options.server ? stripTrailingSlashes(options.server) : '') || DEFAULT_SERVER
  const languages = { ...DEFAULT_LANGUAGES, ...options.languages }
  const format = options.format === 'png' ? 'png' : 'svg'
  const languageMap = Object.fromEntries(
    Object.entries(languages)
      .map(([language, type]) => [language.trim().toLowerCase(), type.trim().toLowerCase()] as const)
      .filter(([language, type]) => language && type)
  )

  return defineMarkdownPlugin({
    name: 'kroki',
    version: PLUGIN_VERSION,
    cacheKey: { server, languages: languageMap, format },
    browserCompiler: {
      module: '@canofold/plugins/kroki',
      exportName: 'kroki',
      options: { server, languages: languageMap, format }
    },
    fenceLanguages: Object.keys(languageMap),
    appliesTo: ({ source }) => hasMarkdownFenceLanguage(source, new Set(Object.keys(languageMap))),
    assets: {
      clients: [{ id: 'kroki', module: '@canofold/plugins/client/kroki' }],
      styles: [{ id: 'diagrams', module: '@canofold/plugins/diagram.css' }]
    },
    rehypePlugins: [
      diagramFence({
        languages: new Set(Object.keys(languageMap)),
        kind: 'kroki',
        filename: (language) => `diagram.${languageMap[language] ?? language}`,
        imageUrl: (source, language) => krokiUrl(server, languageMap[language] ?? language, format, source)
      })
    ]
  })
}
