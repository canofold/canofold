import { defineMarkdownPlugin, type MarkdownPlugin } from '@canofold/markdown'
import { deflateSync, strToU8 } from 'fflate'

import { diagramFence } from '../shared/diagram'
import { resolveExternalDiagramServer } from '../shared/externalDiagramService'
import { hasMarkdownFenceLanguage } from '../shared/markdownSource'

const PLUGIN_VERSION = '4'

export interface PlantUmlOptions {
  /** PlantUML server base URL. Omit it to keep source-only output. */
  server?: string
  /** Let the browser host render the source through the public client enhancer. */
  renderer?: 'client'
}

function encode6Bit(value: number) {
  const normalized = value & 0x3f
  if (normalized < 10) return String.fromCharCode(48 + normalized)
  if (normalized < 36) return String.fromCharCode(65 + normalized - 10)
  if (normalized < 62) return String.fromCharCode(97 + normalized - 36)
  return normalized === 62 ? '-' : '_'
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
  const server = resolveExternalDiagramServer('PlantUML', options.server)
  if (server && options.renderer === 'client') {
    throw new Error('PlantUML cannot use server and client rendering at the same time.')
  }
  const clientRenderer = options.renderer === 'client'
  const hasPlantUmlFence = ({ source }: { source: string }) =>
    hasMarkdownFenceLanguage(source, new Set(['plantuml', 'puml']))

  return defineMarkdownPlugin({
    name: 'plantuml',
    version: PLUGIN_VERSION,
    cacheKey: { server, renderer: clientRenderer ? 'client' : false },
    browserCompiler: {
      module: '@canofold/plugins/plantuml',
      exportName: 'plantUml',
      options: { ...(server ? { server } : {}), ...(clientRenderer ? { renderer: 'client' as const } : {}) }
    },
    fenceLanguages: ['plantuml', 'puml'],
    appliesTo: hasPlantUmlFence,
    assets: {
      clients: [{ id: 'plantuml', module: '@canofold/plugins/client/plantuml' }],
      styles: [{ id: 'diagrams', module: '@canofold/plugins/diagram.css' }]
    },
    rehypePlugins: [
      diagramFence({
        languages: new Set(['plantuml', 'puml']),
        kind: 'plantuml',
        filename: () => 'diagram.puml',
        diagramType: () => 'plantuml',
        clientRenderer,
        ...(server ? { imageUrl: (source) => `${server}/${encodePlantUml(source)}` } : {})
      })
    ]
  })
}
