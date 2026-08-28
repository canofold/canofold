function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Numbers must be finite')
    return String(value)
  }
  if (typeof value !== 'object') throw new TypeError('Value is not JSON serializable')
  if (seen.has(value)) throw new TypeError('Circular JSON value')

  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Only plain objects are JSON serializable')
  }

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new TypeError('Sparse arrays are not supported')
      return `[${value.map((item) => serialize(item, seen)).join(',')}]`
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize((value as Record<string, unknown>)[key], seen)}`)
      .join(',')}}`
  } finally {
    seen.delete(value)
  }
}

/** Deterministic JSON used only for optional cache identities. */
export function stableJson(value: unknown): string | undefined {
  try {
    return serialize(value, new WeakSet())
  } catch {
    return undefined
  }
}
