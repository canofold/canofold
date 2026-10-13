import { defineMarkdownPlugin, type MarkdownPlugin } from '@canofold/markdown'
import { strToU8, zlibSync } from 'fflate'

import { diagramFence } from '../shared/diagram'
import { externalDiagramServiceGate, resolveExternalDiagramServer } from '../shared/externalDiagramService'
import { hasMarkdownFenceLanguage } from '../shared/markdownSource'

const PLUGIN_VERSION = '4'
const DEFAULT_LANGUAGES: Record<string, string> = {
  graphviz: 'graphviz',
  dot: 'graphviz',
  gv: 'graphviz',
  d2: 'd2'
}

export interface KrokiOptions {
  /** Kroki-compatible server URL. Omit it to keep source local. */
  server?: string
  /** Let the browser host render the source through the public client enhancer. */
  renderer?: 'client'
  /** Map Markdown fence labels to Kroki diagram types. */
  languages?: Readonly<Record<string, string>>
  format?: 'svg' | 'png'
}

function encodeKroki(source: string) {
  let binary = ''
  for (const byte of zlibSync(strToU8(source), { level: 9 })) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function krokiUrl(server: string, type: string, format: 'svg' | 'png', source: string) {
  return `${server}/${encodeURIComponent(type)}/${format}/${encodeKroki(source)}`
}

/** Render plugin-owned diagram fences through a Kroki-compatible server. */
export function kroki(options: KrokiOptions = {}): MarkdownPlugin {
  const clientRenderer = options.renderer === 'client'
  const server = resolveExternalDiagramServer('Kroki', options.server)
  if (server && clientRenderer) {
    throw new Error('Kroki cannot use server and client rendering at the same time.')
  }
  const languages = { ...DEFAULT_LANGUAGES, ...options.languages }
  const format = options.format === 'png' ? 'png' : 'svg'
  if (clientRenderer && format !== 'svg') {
    throw new Error('Kroki client rendering only supports SVG output.')
  }
  const languageMap = Object.fromEntries(
    Object.entries(languages)
      .map(([language, type]) => [language.trim().toLowerCase(), type.trim().toLowerCase()] as const)
      .filter(([language, type]) => language && type)
  )
  const hasKrokiFence = ({ source }: { source: string }) =>
    hasMarkdownFenceLanguage(source, new Set(Object.keys(languageMap)))
  const appliesTo = server
    ? externalDiagramServiceGate({ plugin: 'Kroki', appliesTo: hasKrokiFence })
    : hasKrokiFence

  return defineMarkdownPlugin({
    name: 'kroki',
    version: PLUGIN_VERSION,
    cacheKey: { server, renderer: clientRenderer ? 'client' : false, languages: languageMap, format },
    browserCompiler: {
      module: '@canofold/plugins/kroki',
      exportName: 'kroki',
      options: {
        ...(server ? { server } : {}),
        languages: languageMap,
        format,
        ...(clientRenderer ? { renderer: 'client' as const } : {})
      }
    },
    fenceLanguages: Object.keys(languageMap),
    appliesTo,
    assets: {
      clients: [{ id: 'kroki', module: '@canofold/plugins/client/kroki' }],
      styles: [{ id: 'diagrams', module: '@canofold/plugins/diagram.css' }]
    },
    rehypePlugins: [
      diagramFence({
        languages: new Set(Object.keys(languageMap)),
        kind: 'kroki',
        filename: (language) => `diagram.${languageMap[language] ?? language}`,
        diagramType: (language) => languageMap[language] ?? language,
        clientRenderer,
        ...(server
          ? {
              imageUrl: (source: string, language: string) =>
                krokiUrl(server, languageMap[language] ?? language, format, source)
            }
          : {})
      })
    ]
  })
}
