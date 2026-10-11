/** Parse candidates without splitting commas that belong to a URL (such as data URLs). */
export function srcSetCandidates(value: string): Array<{ url: string; descriptor: string }> {
  const candidates: Array<{ url: string; descriptor: string }> = []
  let position = 0
  while (position < value.length) {
    while (position < value.length && /[\t\n\f\r ,]/.test(value[position] ?? '')) position += 1
    if (position >= value.length) break

    const urlStart = position
    while (position < value.length && !/[\t\n\f\r ]/.test(value[position] ?? '')) position += 1
    let url = value.slice(urlStart, position)
    let trailingCommas = 0
    while (url.endsWith(',')) {
      url = url.slice(0, -1)
      trailingCommas += 1
    }
    if (trailingCommas > 0) {
      candidates.push({ url, descriptor: '' })
      continue
    }

    while (position < value.length && /[\t\n\f\r ]/.test(value[position] ?? '')) position += 1
    const descriptorStart = position
    while (position < value.length && value[position] !== ',') position += 1
    const descriptor = value.slice(descriptorStart, position).trim()
    if (value[position] === ',') position += 1
    candidates.push({ url, descriptor })
  }
  return candidates
}
