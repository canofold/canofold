import { defineMarkdownPlugin, type MarkdownPlugin } from '@canofold/markdown'
import { deflateSync, strToU8 } from 'fflate'

import { diagramFence } from '../shared/diagram'
import { hasMarkdownFenceLanguage } from '../shared/markdownSource'

const PLUGIN_VERSION = '3'

export interface PlantUmlOptions {
  /** PlantUML server base URL. Set to false to keep source-only output. */
  server?: string | false
}

function encode6Bit(value: number) {
  const normalized = value & 0x3f
  if (normalized < 10) return String.fromCharCode(48 + normalized)
  if (normalized < 36) return String.fromCharCode(65 + normalized - 10)
  if (normalized < 62) return String.fromCharCode(97 + normalized - 36)
  return normalized === 62 ? '-' : '_'
}

function stripTrailingSlashes(value: string) {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

function encodePlantUml(source: string) {
  const normalized = /@start\w+/i.test(source) ? source : `@startuml\n${source}\n@enduml`
  const bytes = deflateSync(strToU8(normalized), { level: 9 })
  let encoded = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1] ?? 0
    const third = bytes[index + 2] ?? 0
    encoded += encode6Bit(first >> 2)
    encoded += encode6Bit(((first & 0x3) << 4) | (second >> 4))
    encoded += encode6Bit(((second & 0xf) << 2) | (third >> 6))
    encoded += encode6Bit(third & 0x3f)
  }
  return encoded
}

/** Enable PlantUML fenced code blocks as an opt-in official plugin. */
export function plantUml(options: PlantUmlOptions = {}): MarkdownPlugin {
  const server = options.server === false ? '' : stripTrailingSlashes(options.server?.trim() ?? '')

  return defineMarkdownPlugin({
    name: 'plantuml',
    version: PLUGIN_VERSION,
    cacheKey: { server },
    browserCompiler: {
      module: '@canofold/plugins/plantuml',
      exportName: 'plantUml',
      options: { server: server || false }
    },
    fenceLanguages: ['plantuml', 'puml'],
    appliesTo: ({ source }) => hasMarkdownFenceLanguage(source, new Set(['plantuml', 'puml'])),
    assets: {
      clients: [{ id: 'plantuml', module: '@canofold/plugins/client/plantuml' }],
      styles: [{ id: 'diagrams', module: '@canofold/plugins/diagram.css' }]
    },
    rehypePlugins: [
      diagramFence({
        languages: new Set(['plantuml', 'puml']),
        kind: 'plantuml',
        filename: () => 'diagram.puml',
        ...(server ? { imageUrl: (source) => `${server}/${encodePlantUml(source)}` } : {})
      })
    ]
  })
}
