import { defineMarkdownPlugin, type MarkdownPlugin } from '@docfuse/markdown'

import { diagramFence } from '../shared/diagram'
import { hasMarkdownFenceLanguage } from '../shared/markdownSource'

const PLUGIN_VERSION = '3'

export interface MermaidOptions {
  /** Optional browser ESM module. The bundled Mermaid runtime is used by default. */
  moduleUrl?: string
}

/** Enable Mermaid fenced code blocks as an opt-in official plugin. */
export function mermaid(options: MermaidOptions = {}): MarkdownPlugin {
  const moduleUrl = options.moduleUrl?.trim()

  return defineMarkdownPlugin({
    name: 'mermaid',
    version: PLUGIN_VERSION,
    cacheKey: { moduleUrl: moduleUrl ?? null },
    browserCompiler: {
      module: '@docfuse/plugins/mermaid',
      exportName: 'mermaid',
      options: moduleUrl ? { moduleUrl } : {}
    },
    fenceLanguages: ['mermaid'],
    appliesTo: ({ source }) => hasMarkdownFenceLanguage(source, new Set(['mermaid'])),
    assets: {
      clients: [
        {
          id: 'mermaid',
          module: '@docfuse/plugins/client/mermaid',
          resources: [
            {
              module: 'mermaid/dist/mermaid.esm.min.mjs',
              output: 'mermaid.esm.min.mjs',
              directories: [
                {
                  source: 'chunks/mermaid.esm.min',
                  output: 'chunks/mermaid.esm.min',
                  extensions: ['.mjs']
                }
              ]
            }
          ]
        }
      ],
      styles: [{ id: 'diagrams', module: '@docfuse/plugins/diagram.css' }]
    },
    rehypePlugins: [
      diagramFence({
        languages: new Set(['mermaid']),
        kind: 'mermaid',
        filename: () => 'diagram.mmd',
        ...(moduleUrl ? { moduleUrl } : {})
      })
    ]
  })
}
