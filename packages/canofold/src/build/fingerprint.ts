import { createHash } from 'node:crypto'

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue }

function canonicalValue(value: unknown, seen: WeakSet<object>): CanonicalValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Fingerprint values must contain only finite numbers')
    return value
  }
  if (typeof value !== 'object') {
    throw new TypeError('Fingerprint values must be JSON-serializable')
  }
  if (seen.has(value)) throw new TypeError('Fingerprint values must not be circular')

  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Fingerprint values must be JSON-serializable plain objects')
  }

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) {
        throw new TypeError('Fingerprint values must not contain sparse arrays')
      }
      return value.map((item) => canonicalValue(item, seen))
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item, seen)] as const)
    return Object.fromEntries(entries)
  } finally {
    seen.delete(value)
  }
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonicalValue(value, new WeakSet()))
}

export function fingerprint(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export function fingerprintBytes(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}
