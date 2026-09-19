import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { withPagefind } from './benchmark-pagefind.mjs'

const root = resolve(import.meta.dirname, '..')
const minimumMrr = Number(process.env.CANOFOLD_SEARCH_QUALITY_MRR || 0.8)
const minimumRecall = Number(process.env.CANOFOLD_SEARCH_QUALITY_RECALL || 1)
const cases = [
  { kind: 'module', query: '组件开发', expected: ['/guide/component-development/'] },
  { kind: 'term', query: '权限策略', expected: ['/guide/access-policy/'] },
  { kind: 'cross-section', query: '私有文档保护', expected: ['/guide/access-policy/'] },
  { kind: 'colloquial', query: '怎么让缓存重新构建', expected: ['/guide/cache-invalidation/'] },
  { kind: 'term', query: '多语言路由', expected: ['/guide/i18n-routing/'] },
  { kind: 'term', query: '图表服务', expected: ['/guide/diagram-service/'] },
  { kind: 'term', query: '发布流程', expected: ['/guide/release-process/'] },
  {
    kind: 'short-noise',
    query: '组件',
    expected: ['/guide/component-development/', '/guide/component-reference/']
  },
  { kind: 'no-result', query: 'ZXQ_NONEXISTENT_9317', expected: [] }
]

const pages = [
  [
    'component-development',
    '组件开发工作流',
    '用 Vite 编写组件示例并保持源码同步',
    '组件开发需要实时预览、样式依赖和热更新。'
  ],
  [
    'access-policy',
    '权限策略',
    '保护私有文档和全部静态产物',
    '权限策略必须覆盖 HTML、搜索、Markdown 和 AI 文件，私有文档保护不能只依赖 robots.txt。'
  ],
  [
    'cache-invalidation',
    '缓存失效',
    '理解增量构建的缓存失效条件',
    '配置或内容变化会触发缓存失效。怎么让缓存重新构建？执行无缓存构建即可。'
  ],
  ['i18n-routing', '多语言路由', '配置默认语言和多语言路由', '多语言路由为非默认语言增加 locale 前缀。'],
  [
    'diagram-service',
    '图表服务安全',
    '选择可信的 Mermaid、Kroki 与 PlantUML 服务',
    '外部图表服务可能接收图示源码。'
  ],
  [
    'release-process',
    '发布流程',
    '执行标准 npm 发布流程和质量门禁',
    '发布流程包括构建、测试、打包检查和可信发布。'
  ],
  ['content-authoring', '内容编辑', '编写普通知识文档', '内容编辑关注标题、段落、链接和资源。'],
  ['component-reference', '组件参考', '查询组件属性和状态', '组件参考列出 API，但不介绍完整开发流程。']
]

function runBuild(fixture, provider) {
  return new Promise((resolveDone, reject) => {
    const started = performance.now()
    execFile(
      process.execPath,
      [join(root, 'packages/canofold/dist/cli.js'), 'build', '--no-cache'],
      { cwd: fixture, env: { ...process.env, CANOFOLD_BENCHMARK_PROVIDER: provider } },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || stdout || error.message))
        else resolveDone({ stdout, buildMs: Number((performance.now() - started).toFixed(2)) })
      }
    )
  })
}

function summarize(results) {
  const relevant = results.filter(({ expected }) => expected.length > 0)
  const noResult = results.filter(({ expected }) => expected.length === 0)
  const ranks = relevant.map(({ routes, expected }) => {
    const normalizedRoutes = routes.map((route) => String(route).split('#')[0])
    return normalizedRoutes.findIndex((route) => expected.includes(route)) + 1
  })
  const hits = ranks.filter((rank) => rank > 0)
  const expectedCount = relevant.reduce((total, { expected }) => total + expected.length, 0)
  const retrievedRelevant = relevant.reduce((total, { routes, expected }) => {
    const normalizedRoutes = routes.map((route) => String(route).split('#')[0])
    return total + expected.filter((route) => normalizedRoutes.includes(route)).length
  }, 0)
  return {
    precisionAt1: Number((hits.filter((rank) => rank === 1).length / relevant.length).toFixed(3)),
    mrrAt8: Number(
      (ranks.reduce((total, rank) => total + (rank > 0 ? 1 / rank : 0), 0) / ranks.length).toFixed(3)
    ),
    recallAt8: Number((retrievedRelevant / expectedCount).toFixed(3)),
    noResultAccuracy: Number(
      (noResult.filter(({ routes }) => routes.length === 0).length / noResult.length).toFixed(3)
    ),
    ranks
  }
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0
}

async function directorySize(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const target = join(path, entry.name)
      return entry.isDirectory() ? directorySize(target) : (await stat(target)).size
    })
  )
  return sizes.reduce((total, size) => total + size, 0)
}

async function loadSearchAlgorithms(outputRoot) {
  const outfile = join(outputRoot, 'search-quality-runtime.mjs')
  await build({
    stdin: {
      contents: [
        `export { queryCompactIndex } from ${JSON.stringify(join(root, 'packages/canofold/src/search/queryCompact.ts'))}`,
        `export { createPagefindSearchDocument, rankSearchDocuments } from ${JSON.stringify(join(root, 'packages/canofold/src/render/searchClient.ts'))}`
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'search-quality-runtime.ts',
      loader: 'ts'
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile
  })
  return import(`${pathToFileURL(outfile).href}?quality=${Date.now()}`)
}

const fixture = await mkdtemp(join(tmpdir(), 'canofold-search-quality-'))
try {
  await symlink(
    join(root, 'node_modules'),
    join(fixture, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  await mkdir(join(fixture, 'docs/guide'), { recursive: true })
  await writeFile(
    join(fixture, 'canofold.config.ts'),
    `import { pagefind } from '@canofold/plugins/pagefind'

export default {
  title: '中文搜索质量基准',
  search: { provider: process.env.CANOFOLD_BENCHMARK_PROVIDER === 'pagefind' ? pagefind() : 'compact' },
  ai: { llmsTxt: false, llmsFullTxt: false, markdownIndex: false, pageSummaries: false, codeExamples: false }
}
`
  )
  await writeFile(join(fixture, 'docs/index.md'), '---\ntitle: 搜索基准\n---\n\n# 搜索基准\n')
  await Promise.all(
    pages.map(([slug, title, description, body], index) =>
      writeFile(
        join(fixture, `docs/guide/${slug}.md`),
        `---\ntitle: ${title}\ndescription: ${description}\norder: ${index + 1}\n---\n\n# ${title}\n\n${body}\n`
      )
    )
  )

  const algorithms = await loadSearchAlgorithms(fixture)
  const compactBuild = await runBuild(fixture, 'compact')
  const compactIndexPath = join(fixture, '.canofold/dist/search/zh.json')
  const compactIndex = JSON.parse(await readFile(compactIndexPath, 'utf8'))
  const compactIndexBytes = (await stat(compactIndexPath)).size
  const compactTimings = []
  const compactResults = cases.map(({ kind, query, expected }) => {
    const started = performance.now()
    const routes = algorithms.queryCompactIndex(query, compactIndex, 8).map((document) => document.routePath)
    compactTimings.push(performance.now() - started)
    return { kind, query, expected, routes }
  })

  const pagefindBuild = await runBuild(fixture, 'pagefind')
  const pagefindTimings = []
  const pagefindResults = await withPagefind(join(fixture, '.canofold/dist/pagefind'), async (pagefind) => {
    const filters = { version: 'current', locale: 'zh' }
    const output = []
    for (const { kind, query, expected } of cases) {
      const started = performance.now()
      const response = await pagefind.search(query, { filters })
      const candidates = await Promise.all(response.results.slice(0, 32).map((result) => result.data()))
      const documents = candidates
        .map((data) => algorithms.createPagefindSearchDocument(query, data))
        .filter(Boolean)
      const routes = algorithms
        .rankSearchDocuments(query, documents)
        .slice(0, 8)
        .map((document) => document.routePath)
      pagefindTimings.push(performance.now() - started)
      output.push({
        kind,
        query,
        expected,
        routes
      })
    }
    return output
  })

  const report = {
    fixture: { locale: 'zh', documents: pages.length + 1, queries: cases.length },
    compact: {
      ...summarize(compactResults),
      buildMs: compactBuild.buildMs,
      indexBytes: compactIndexBytes,
      queryP95Ms: Number(percentile(compactTimings, 0.95).toFixed(3))
    },
    pagefind: {
      ...summarize(pagefindResults),
      buildMs: pagefindBuild.buildMs,
      indexBytes: await directorySize(join(fixture, '.canofold/dist/pagefind')),
      queryP95Ms: Number(percentile(pagefindTimings, 0.95).toFixed(3))
    },
    thresholds: { minimumMrr, minimumRecall }
  }
  console.log(JSON.stringify(report, null, 2))

  for (const [provider, metrics] of Object.entries({ compact: report.compact, pagefind: report.pagefind })) {
    if (metrics.mrrAt8 < minimumMrr) throw new Error(`${provider} MRR@8 fell below ${minimumMrr}`)
    if (metrics.recallAt8 < minimumRecall) {
      throw new Error(`${provider} Recall@8 fell below ${minimumRecall}`)
    }
  }
} finally {
  await rm(fixture, { recursive: true, force: true })
}
