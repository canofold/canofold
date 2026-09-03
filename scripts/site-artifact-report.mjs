import { gzipSync } from 'node:zlib'
import { access, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { filesUnder } from './lib/files.mjs'

const root = resolve(import.meta.dirname, '..')
const outputRoot = join(root, 'site/.canofold/dist')
const budgets = {
  'assets/canofold.css': 24 * 1024,
  'assets/canofold-search.js': 4 * 1024,
  'assets/canofold-markdown/index.js': 5 * 1024,
  'assets/canofold-plugins/kroki.js': 3 * 1024,
  'assets/canofold-plugins/mermaid.js': 6 * 1024,
  'assets/canofold-plugins/plantuml.js': 3 * 1024,
  'assets/canofold-plugins/diagrams.css': 4 * 1024,
  'assets/canofold-plugins/mermaid/mermaid.esm.min.mjs': 16 * 1024,
  'pagefind/pagefind.js': 16 * 1024,
  'pagefind/pagefind-worker.js': 20 * 1024
}
const optionalPluginBudgets = new Set(
  Object.keys(budgets).filter((relativePath) => relativePath.startsWith('assets/canofold-plugins/'))
)
const pagefindTotalBudget = 4 * 1024 * 1024
const pluginRuntimeBudget = 4 * 1024 * 1024
const failures = []
const rows = []

for (const [relativePath, budget] of Object.entries(budgets)) {
  let source
  try {
    source = await readFile(join(outputRoot, relativePath))
  } catch (error) {
    if (error?.code === 'ENOENT' && optionalPluginBudgets.has(relativePath)) continue
    throw error
  }
  const gzipBytes = gzipSync(source).byteLength
  rows.push({ file: relativePath, rawBytes: source.byteLength, gzipBytes, budget })
  if (gzipBytes > budget) failures.push(`${relativePath}: ${gzipBytes} gzip bytes exceeds ${budget}`)
}

const pagefindRoot = join(outputRoot, 'pagefind')
const pagefindFiles = await filesUnder(pagefindRoot)
const pagefindBytes = (await Promise.all(pagefindFiles.map(async (path) => (await stat(path)).size))).reduce(
  (total, bytes) => total + bytes,
  0
)
if (pagefindBytes > pagefindTotalBudget) {
  failures.push(`pagefind/: ${pagefindBytes} bytes exceeds ${pagefindTotalBudget}`)
}

const pluginRoot = join(outputRoot, 'assets/canofold-plugins')
const pluginFiles = await filesUnder(pluginRoot)
const pluginBytes = (await Promise.all(pluginFiles.map(async (path) => (await stat(path)).size))).reduce(
  (total, bytes) => total + bytes,
  0
)
if (pluginBytes > pluginRuntimeBudget) {
  failures.push(`assets/canofold-plugins/: ${pluginBytes} bytes exceeds ${pluginRuntimeBudget}`)
}
for (const path of pluginFiles) {
  if (path.endsWith('.map')) failures.push(`${path}: source maps must not be published to the generated site`)
}
for (const unused of [
  'pagefind-ui.js',
  'pagefind-ui.css',
  'pagefind-modular-ui.js',
  'pagefind-component-ui.js',
  'pagefind-component-ui.css',
  'pagefind-highlight.js'
]) {
  try {
    await access(join(pagefindRoot, unused))
    failures.push(`pagefind/${unused}: unused UI artifact must not be published`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const aiManifest = JSON.parse(await readFile(join(outputRoot, 'ai/manifest.json'), 'utf8'))
for (const partition of aiManifest.partitions ?? []) {
  for (const shard of partition.shards ?? []) {
    if (shard.bytes > aiManifest.budgets.chunkSizeBytes) {
      failures.push(`${shard.path}: ${shard.bytes} bytes exceeds AI chunk budget`)
    }
  }
}

console.table(
  rows.map((row) => ({
    file: row.file,
    rawKB: (row.rawBytes / 1024).toFixed(2),
    gzipKB: (row.gzipBytes / 1024).toFixed(2),
    budgetKB: (row.budget / 1024).toFixed(2)
  }))
)
console.log(
  `Pagefind total: ${(pagefindBytes / 1024 / 1024).toFixed(2)} MiB / ${(pagefindTotalBudget / 1024 / 1024).toFixed(2)} MiB`
)
console.log(
  `Plugin runtime total: ${(pluginBytes / 1024 / 1024).toFixed(2)} MiB / ${(pluginRuntimeBudget / 1024 / 1024).toFixed(2)} MiB`
)

if (failures.length) {
  console.error('\nSite artifact budget failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
}
