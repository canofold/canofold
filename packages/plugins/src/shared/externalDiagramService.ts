import type { MarkdownPluginContext } from '@canofold/markdown'

interface ExternalDiagramServiceGateOptions {
  plugin: string
  appliesTo: (context: MarkdownPluginContext) => boolean
}

/** Resolve an explicitly configured server without silently masking an empty value. */
export function resolveExternalDiagramServer(plugin: string, server: string | undefined) {
  if (server === undefined) return ''

  const message = `${plugin} server must be an HTTP(S) base URL without a query or fragment.`
  const value = server.trim()
  if (value.includes('?') || value.includes('#')) throw new Error(message)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(message)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(message)
  return parsed.href.replace(/\/+$/, '')
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
