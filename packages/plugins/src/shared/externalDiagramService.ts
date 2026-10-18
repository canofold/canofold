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
