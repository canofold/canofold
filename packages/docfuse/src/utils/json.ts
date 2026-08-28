import type { DocfuseJsonValue } from '../config/types'

function validateJsonValue(value: unknown, seen: WeakSet<object>): value is DocfuseJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false

  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return (
        Object.keys(value).length === value.length && value.every((item) => validateJsonValue(item, seen))
      )
    }
    return Object.values(value).every((item) => validateJsonValue(item, seen))
  } finally {
    seen.delete(value)
  }
}

export function assertJsonValue(value: unknown, label: string): asserts value is DocfuseJsonValue {
  if (!validateJsonValue(value, new WeakSet())) {
    throw new Error(`${label} must be JSON-serializable`)
  }
}
