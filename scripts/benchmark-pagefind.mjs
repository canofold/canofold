import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0
}

export async function benchmarkPagefind(pagefindRoot, iterations = 100) {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  Object.assign(globalThis, {
    document: {
      currentScript: null,
      querySelector: (selector) =>
        selector === 'html' ? { getAttribute: (attribute) => (attribute === 'lang' ? 'zh' : null) } : null
    }
  })
  globalThis.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input.url)
    if (!rawUrl.startsWith('file:')) return originalFetch(input, init)
    const path = fileURLToPath(rawUrl.split('?')[0] ?? rawUrl)
    return new Response(await readFile(path), {
      headers: path.endsWith('.pagefind') ? { 'content-type': 'application/wasm' } : undefined
    })
  }

  try {
    const pagefind = await import(
      `${pathToFileURL(join(pagefindRoot, 'pagefind.js')).href}?benchmark=${Date.now()}`
    )
    await pagefind.options({ baseUrl: '/' })
    await pagefind.init()
    const filters = { version: 'current', locale: 'zh' }
    const runQuery = async (query) => {
      const started = performance.now()
      const response = await pagefind.search(query, { filters })
      await Promise.all(response.results.slice(0, 8).map((result) => result.data()))
      return performance.now() - started
    }
    const coldMs = await runQuery('enterprise topic 7')
    const timings = []
    for (let index = 0; index < iterations; index += 1) {
      timings.push(await runQuery(`enterprise topic ${index % 25}`))
    }
    await pagefind.destroy()
    return { coldMs, p95Ms: percentile(timings, 0.95) }
  } finally {
    Object.assign(globalThis, { document: originalDocument, fetch: originalFetch })
  }
}
