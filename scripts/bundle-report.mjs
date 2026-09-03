import { gzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { filesUnder } from './lib/files.mjs'
import { moduleGraph } from './lib/moduleGraph.mjs'

const dist = join(process.cwd(), 'packages/markdown/dist')
const budgets = {
  'client/index.js': 5 * 1024,
  'server.js': 3 * 1024,
  'server/analyze.js': 7 * 1024,
  'base.css': 10 * 1024,
  'theme.css': 4 * 1024
}
const syncBudgets = {
  // The React entry owns the compiler and component graph by design. Keep the
  // shared graph bounded, while the browser-only client bundle remains a
  // separate budget above.
  'index.js': 40 * 1024,
  'server.js': 60 * 1024,
  // This entry shares the directive-analysis chunk with the server renderer.
  // The graph budget includes parent-directory imports from nested entries.
  'server/analyze.js': 14 * 1024,
  'client/index.js': 5 * 1024
}
const asyncBudgets = {
  'client/index.js': 108 * 1024
}
const reactRuntimeBudget = 72 * 1024
const canofoldDist = join(process.cwd(), 'packages/canofold/dist')
const canofoldBudgets = {
  'cli.js': 3 * 1024,
  'playground-client.js': 3 * 1024,
  'styles.input.css': 8 * 1024
}
// Stale-lock recovery is part of the production build path; keep the complete
// CLI graph bounded after accounting for that ownership check.
const canofoldJavaScriptBudget = 62 * 1024
const canofoldBrowserEntries = new Set(['playground-client.js'])
const pluginDist = join(process.cwd(), 'packages/plugins/dist')
const pluginClientBudgets = {
  'client/kroki.js': 3 * 1024,
  'client/mermaid.js': 6 * 1024,
  'client/plantuml.js': 3 * 1024
}

async function relativeFiles(directory) {
  return (await filesUnder(directory)).map((file) => relative(directory, file).split(sep).join('/'))
}

const files = (await relativeFiles(dist)).filter((file) => /\.(?:js|css)$/.test(file)).sort()
const rows = []
const failures = []
const layerRows = []

async function measureGraph(layer, label, entry, includeDynamic = false, budget) {
  const graph = await moduleGraph(dist, entry, includeDynamic)
  const sources = await Promise.all([...graph].map((path) => readFile(path)))
  const combined = Buffer.concat(sources)
  const gzipBytes = gzipSync(combined).byteLength
  layerRows.push({ layer, label, rawBytes: combined.byteLength, gzipBytes, budget })
  return { graph, gzipBytes }
}

for (const file of files) {
  const source = await readFile(join(dist, file))
  const gzipBytes = gzipSync(source).byteLength
  const budget = /^client\/chunks\/react-runtime-[^/]+\.js$/.test(file) ? reactRuntimeBudget : budgets[file]
  rows.push({ file, rawBytes: source.byteLength, gzipBytes, budget })
  if (budget && gzipBytes > budget) {
    failures.push(`${file}: ${gzipBytes} gzip bytes exceeds ${budget}`)
  }
}

const reactRuntimeChunks = rows.filter((row) => /^client\/chunks\/react-runtime-[^/]+\.js$/.test(row.file))
if (reactRuntimeChunks.length !== 1) {
  failures.push(`expected one shared client React runtime chunk, found ${reactRuntimeChunks.length}`)
}

for (const [entry, budget] of Object.entries(syncBudgets)) {
  const graph = await moduleGraph(dist, entry)
  const sources = await Promise.all([...graph].map((path) => readFile(path)))
  const combined = Buffer.concat(sources)
  const gzipBytes = gzipSync(combined).byteLength
  rows.push({
    file: `${entry} (sync: ${[...graph].map((path) => basename(path)).join(', ')})`,
    rawBytes: combined.byteLength,
    gzipBytes,
    budget
  })
  if (gzipBytes > budget)
    failures.push(`${entry} synchronous graph: ${gzipBytes} gzip bytes exceeds ${budget}`)
}

for (const [entry, budget] of Object.entries(asyncBudgets)) {
  const graph = await moduleGraph(dist, entry, true)
  const sources = await Promise.all([...graph].map((path) => readFile(path)))
  const combined = Buffer.concat(sources)
  const gzipBytes = gzipSync(combined).byteLength
  rows.push({
    file: `${entry} (all lazy chunks)`,
    rawBytes: combined.byteLength,
    gzipBytes,
    budget
  })
  if (gzipBytes > budget) failures.push(`${entry} lazy graph: ${gzipBytes} gzip bytes exceeds ${budget}`)
}

const rootGraph = await moduleGraph(dist, 'index.js')
const indexSource = (await Promise.all([...rootGraph].map((path) => readFile(path, 'utf8')))).join('\n')
if (/react\.production|minified React error|__SECRET_INTERNALS_DO_NOT_USE/.test(indexSource)) {
  failures.push('index.js appears to contain a bundled React runtime')
}
const rootImplementationSource = indexSource.replace(/https?:\/\/[^\s"'`]+/g, '')
if (/mermaid\.esm|@mermaid-js|plantuml-encoder/.test(rootImplementationSource)) {
  failures.push('index.js contains a full diagram runtime')
}

const canofoldFiles = (await relativeFiles(canofoldDist)).filter((file) => /\.(?:js|css)$/.test(file)).sort()
const canofoldRows = []
const canofoldJavaScript = []
for (const file of canofoldFiles) {
  const source = await readFile(join(canofoldDist, file))
  const gzipBytes = gzipSync(source).byteLength
  const budget = canofoldBudgets[file]
  canofoldRows.push({ file, rawBytes: source.byteLength, gzipBytes, budget })
  if (file.endsWith('.js') && !canofoldBrowserEntries.has(file)) canofoldJavaScript.push(source)
  if (budget && gzipBytes > budget) {
    failures.push(`canofold/${file}: ${gzipBytes} gzip bytes exceeds ${budget}`)
  }
}
const canofoldJavaScriptBytes = gzipSync(Buffer.concat(canofoldJavaScript)).byteLength
canofoldRows.push({
  file: 'Node JavaScript',
  rawBytes: canofoldJavaScript.reduce((total, source) => total + source.byteLength, 0),
  gzipBytes: canofoldJavaScriptBytes,
  budget: canofoldJavaScriptBudget
})
if (canofoldJavaScriptBytes > canofoldJavaScriptBudget) {
  failures.push(
    `canofold Node JavaScript: ${canofoldJavaScriptBytes} gzip bytes exceeds ${canofoldJavaScriptBudget}`
  )
}

const pluginRows = []
for (const [file, budget] of Object.entries(pluginClientBudgets)) {
  const source = await readFile(join(pluginDist, file))
  const gzipBytes = gzipSync(source).byteLength
  pluginRows.push({ file, rawBytes: source.byteLength, gzipBytes, budget })
  if (gzipBytes > budget) failures.push(`plugins/${file}: ${gzipBytes} gzip bytes exceeds ${budget}`)
}

await measureGraph('React API', '默认同步入口', 'index.js', false, syncBudgets['index.js'])
await measureGraph('构建 / SSR', '服务端渲染入口', 'server.js', false, syncBudgets['server.js'])
await measureGraph('构建 / SSR', '内容分析入口', 'server/analyze.js', false, syncBudgets['server/analyze.js'])
await measureGraph('浏览器初始', '行为增强器', 'client/index.js', false, syncBudgets['client/index.js'])
await measureGraph('浏览器交互', '全部富交互上限', 'client/index.js', true, asyncBudgets['client/index.js'])

const richEntryNames = ['gallery', 'image', 'table', 'diagram']
for (const name of richEntryNames) {
  const entry = files.find((file) => new RegExp(`^client/chunks/${name}-[^/]+\\.js$`).test(file))
  if (entry) await measureGraph('浏览器交互', name, entry)
}

const styles = rows.find((row) => row.file === 'base.css')
if (styles) {
  layerRows.push({
    layer: '内容样式',
    label: 'Markdown 基础样式',
    rawBytes: styles.rawBytes,
    gzipBytes: styles.gzipBytes,
    budget: styles.budget
  })
}

console.log('\nMarkdown 分层体积（富交互包含其共享 React 运行时）：')
console.table(
  layerRows.map((row) => ({
    layer: row.layer,
    entry: row.label,
    rawKB: (row.rawBytes / 1024).toFixed(2),
    gzipKB: (row.gzipBytes / 1024).toFixed(2),
    budgetKB: row.budget ? (row.budget / 1024).toFixed(2) : '-'
  }))
)
console.log('Shiki、Unified 与 MDX 属于构建期外部依赖，不进入浏览器客户端体积。')

console.table(
  rows.map((row) => ({
    file: row.file,
    rawKB: (row.rawBytes / 1024).toFixed(2),
    gzipKB: (row.gzipBytes / 1024).toFixed(2),
    budgetKB: (row.budget ?? budgets[row.file]) ? ((row.budget ?? budgets[row.file]) / 1024).toFixed(2) : '-'
  }))
)

console.table(
  canofoldRows.map((row) => ({
    file: `canofold/${row.file}`,
    rawKB: (row.rawBytes / 1024).toFixed(2),
    gzipKB: (row.gzipBytes / 1024).toFixed(2),
    budgetKB: row.budget ? (row.budget / 1024).toFixed(2) : '-'
  }))
)

console.table(
  pluginRows.map((row) => ({
    file: `plugins/${row.file}`,
    rawKB: (row.rawBytes / 1024).toFixed(2),
    gzipKB: (row.gzipBytes / 1024).toFixed(2),
    budgetKB: (row.budget / 1024).toFixed(2)
  }))
)

if (failures.length) {
  console.error('\nBundle budget failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
}
