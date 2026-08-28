import { existsSync, readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

const entry = resolve('packages/markdown/dist/server.js')
if (!existsSync(entry)) {
  console.error(
    'Missing packages/markdown/dist/server.js. Run `pnpm --filter @docfuse/markdown build` first.'
  )
  process.exit(1)
}

const { createMarkdownRenderer } = await import(entry)
const requestedPageCount = Number(process.env.DOCFUSE_MARKDOWN_BENCHMARK_PAGES ?? 100)
const pageCount = Number.isFinite(requestedPageCount) ? Math.max(1, Math.floor(requestedPageCount)) : 100
const showcaseFixture = readFileSync(resolve('site/docs/zh/markdown/playground.md'), 'utf8')

const technicalCorpus = [
  `# TypeScript API

\`\`\`ts
export interface BuildOptions {
  outDir: string
  minify?: boolean
}

export async function build(options: BuildOptions) {
  return { pages: 42, ...options }
}
\`\`\``,
  `# React component

\`\`\`tsx
export function Status({ ready }: { ready: boolean }) {
  return <strong aria-live="polite">{ready ? 'Ready' : 'Building'}</strong>
}
\`\`\``,
  `# Deployment

\`\`\`bash
pnpm run build:site
pnpm run preview:site
\`\`\`

\`\`\`nginx
location /docs/ {
  try_files $uri $uri/ /404.html;
}
\`\`\``,
  `# Configuration

\`\`\`json
{"search":{"enabled":true},"locales":["zh-CN","en"]}
\`\`\`

\`\`\`yaml
name: docs
features:
  - search
  - markdown
\`\`\``,
  `# Data and math

| Element | Interaction | Default |
| --- | --- | --- |
| Code | Copy | Enabled |
| Table | Sort and expand | Enabled |

The render budget is $T = parse + transform + render$.

:::tip Build once
Shiki highlighting belongs to the build path.
:::`,
  `# Diagram

\`\`\`mermaid
flowchart LR
  Markdown --> React
  React --> HTML
\`\`\`

\`\`\`plantuml
@startuml
Author -> Docfuse: Markdown
Docfuse -> Browser: Static HTML
@enduml
\`\`\``,
  showcaseFixture
]

function memorySnapshot() {
  const memory = process.memoryUsage()
  return { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed }
}

async function renderPage(renderer, source) {
  const result = await renderer.render(source)
  const html = renderToStaticMarkup(result.content)
  return { htmlBytes: Buffer.byteLength(html), behaviors: result.assets.behaviors }
}

const cacheRenderer = createMarkdownRenderer()
const coldMemory = memorySnapshot()
const coldStart = performance.now()
await renderPage(cacheRenderer, technicalCorpus[0])
const coldMs = performance.now() - coldStart
const afterCold = memorySnapshot()
const warmStart = performance.now()
await renderPage(cacheRenderer, technicalCorpus[0])
const warmMs = performance.now() - warmStart

console.log(
  JSON.stringify({
    benchmark: 'cold-and-cached-render',
    coldMs: Number(coldMs.toFixed(2)),
    cachedMs: Number(warmMs.toFixed(2)),
    coldRssDeltaBytes: Math.max(0, afterCold.rssBytes - coldMemory.rssBytes),
    coldHeapDeltaBytes: Math.max(0, afterCold.heapUsedBytes - coldMemory.heapUsedBytes)
  })
)

for (const pages of [...new Set([1, Math.min(25, pageCount), pageCount])]) {
  const renderer = createMarkdownRenderer({ maxEntries: Math.min(pages, 128) })
  const startMemory = memorySnapshot()
  let peakRssBytes = startMemory.rssBytes
  let peakHeapUsedBytes = startMemory.heapUsedBytes
  let htmlBytes = 0
  const behaviors = new Set()
  const start = performance.now()

  for (let index = 0; index < pages; index += 1) {
    const fixture = technicalCorpus[index % technicalCorpus.length]
    const result = await renderPage(renderer, `${fixture}\n\n<!-- benchmark-page-${index + 1} -->`)
    htmlBytes += result.htmlBytes
    result.behaviors.forEach((behavior) => behaviors.add(behavior))
    const memory = memorySnapshot()
    peakRssBytes = Math.max(peakRssBytes, memory.rssBytes)
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsedBytes)
  }

  const elapsedMs = performance.now() - start
  console.log(
    JSON.stringify({
      benchmark: 'technical-corpus',
      pages,
      corpusDocuments: technicalCorpus.length,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      perPageMs: Number((elapsedMs / pages).toFixed(2)),
      htmlBytes,
      rssDeltaBytes: Math.max(0, peakRssBytes - startMemory.rssBytes),
      heapDeltaBytes: Math.max(0, peakHeapUsedBytes - startMemory.heapUsedBytes),
      behaviors: [...behaviors].sort()
    })
  )
}
