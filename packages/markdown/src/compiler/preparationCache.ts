import type { PreparedMarkdown } from './types.js'

/** Shared retention policy for server and browser preparation; values stay private. */
export function createPreparationCache<T>(
  maxEntries: number,
  maxBytes: number,
  weight: (value: T) => number
) {
  interface Entry {
    promise: Promise<T>
    bytes: number
  }
  const entries = new Map<string, Entry>()
  let bytes = 0
  const remove = (key: string) => {
    bytes -= entries.get(key)?.bytes ?? 0
    entries.delete(key)
  }
  const trim = () => {
    while (entries.size > maxEntries || bytes > maxBytes) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      remove(oldest)
    }
  }
  return {
    get(key: string | undefined, create: () => Promise<T>): Promise<T> {
      if (key === undefined) return create()
      const existing = entries.get(key)
      if (existing) {
        entries.delete(key)
        entries.set(key, existing)
        return existing.promise
      }
      const overhead = key.length * 2 + 512
      const promise = create()
        .then((value) => {
          // Clearing/evicting pending work must not resurrect it on completion.
          if (entries.get(key) === entry) {
            const size = weight(value) + overhead
            bytes += size - entry.bytes
            entry.bytes = size
            trim()
          }
          return value
        })
        .catch((error) => {
          if (entries.get(key) === entry) remove(key)
          throw error
        })
      const entry: Entry = { promise, bytes: overhead }
      entries.set(key, entry)
      bytes += entry.bytes
      trim()
      return promise
    },
    clear() {
      entries.clear()
      bytes = 0
    },
    delete: remove
  }
}

/** Include node overhead and text, without executing trusted plugin accessors. */
export function preparedMarkdownWeight(prepared: PreparedMarkdown) {
  return JSON.stringify(prepared.analysis).length * 2 + markdownDocumentWeight(prepared.document)
}

export function markdownDocumentWeight(document: PreparedMarkdown['document']) {
  let bytes = 0
  const pending: unknown[] = [document]
  while (pending.length) {
    const node = pending.pop() as Record<string, unknown>
    bytes += 256
    if (typeof node.value === 'string') bytes += node.value.length * 2
    if (node.properties && typeof node.properties === 'object') {
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(node.properties))) {
        bytes += 64 + key.length * 2
        if ('value' in descriptor) {
          if (typeof descriptor.value === 'string') bytes += descriptor.value.length * 2
          else if (Array.isArray(descriptor.value)) bytes += descriptor.value.length * 32
        }
      }
    }
    if (Array.isArray(node.children)) for (const child of node.children) pending.push(child)
  }
  return bytes
}
