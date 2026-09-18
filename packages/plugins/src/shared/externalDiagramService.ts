import type { MarkdownPluginContext } from '@canofold/markdown'

interface ExternalDiagramServiceGateOptions {
  plugin: string
  appliesTo: (context: MarkdownPluginContext) => boolean
}

/** Warn once when a document actually sends diagram source to an external renderer. */
export function externalDiagramServiceGate({ plugin, appliesTo }: ExternalDiagramServiceGateOptions) {
  let warned = false

  return (context: MarkdownPluginContext) => {
    const active = appliesTo(context)
    if (active && !warned) {
      console.warn(
        `[canofold/plugins] ${plugin} sends diagram source to its configured external service. Use a trusted self-hosted service for private content.`
      )
      warned = true
    }
    return active
  }
}
