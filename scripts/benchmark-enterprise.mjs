import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { benchmarkPagefind } from './benchmark-pagefind.mjs'
import { filesUnder } from './lib/files.mjs'
const root = resolve(import.meta.dirname, '..')
const pageCount = Number(process.env.CANOFOLD_BENCHMARK_PAGES || 1000)
const buildBudgetMs = Number(process.env.CANOFOLD_BUILD_BUDGET_MS || 60_000)
const cachedBuildBudgetMs = Number(process.env.CANOFOLD_CACHED_BUILD_BUDGET_MS || 15_000)
const searchBudgetMs = Number(process.env.CANOFOLD_SEARCH_P95_BUDGET_MS || 50)
const searchColdBudgetMs = Number(process.env.CANOFOLD_SEARCH_COLD_BUDGET_MS || 1500)
const indexBudgetBytes = Number(process.env.CANOFOLD_SEARCH_INDEX_BUDGET_BYTES || 25 * 1024 * 1024)
const memoryBudgetBytes = Number(process.env.CANOFOLD_MEMORY_BUDGET_BYTES || 768 * 1024 * 1024)

async function runBuild(fixture) {
  const started = performance.now()
  const stdout = await new Promise((resolveDone, reject) => {
    execFile(
      process.execPath,
      [join(root, 'packages/canofold/dist/cli.js'), 'build'],
      { cwd: fixture, env: { ...process.env, CANOFOLD_BENCHMARK_REPORT: '1' } },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`${stderr || stdout || error.message}`))
        else resolveDone(stdout)
      }
    )
  })
  const resourceReport = JSON.parse(await readFile(join(fixture, '.canofold/dist/.benchmark.json'), 'utf8'))
  return {
    elapsedMs: performance.now() - started,
    maxRssBytes: resourceReport.maxRssBytes,
    stdout
  }
}

const fixture = await mkdtemp(join(tmpdir(), 'canofold-enterprise-benchmark-'))
try {
  await symlink(
    join(root, 'node_modules'),
    join(fixture, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  const docsRoot = join(fixture, 'docs/reference')
  await mkdir(docsRoot, { recursive: true })
  const writes = []
  writes.push(
    writeFile(
      join(fixture, 'canofold.config.ts'),
      `import { pagefind } from '@canofold/plugins/pagefind'

export default {
  title: 'Enterprise benchmark',
  search: { provider: pagefind() },
  ai: { llmsTxt: false, llmsFullTxt: false, markdownIndex: false, pageSummaries: false, codeExamples: false }
}`
    )
  )
  writes.push(
    writeFile(
      join(fixture, 'docs/index.md'),
      '---\ntitle: 首页\ndescription: 千页级基准首页\norder: 0\n---\n# 首页'
    )
  )
  for (let index = 1; index < pageCount; index += 1) {
    const number = String(index).padStart(4, '0')
    const path = join(docsRoot, `page-${number}.md`)
    writes.push(
      writeFile(
        path,
        `---\ntitle: 页面 ${number}\ndescription: Enterprise topic ${index % 25}\norder: ${index}\n---\n# 页面 ${number}\n\n这是千页级内容库的 enterprise topic ${index % 25} 测试正文。\n\n## 配置\n\n稳定构建、路由与搜索索引。`
      )
    )
  }
  await Promise.all(writes)

  const build = await runBuild(fixture)
  const cachedBuild = await runBuild(fixture)
  const outputRoot = join(fixture, '.canofold/dist')
  const files = await filesUnder(outputRoot)
  const generatedPages = files.filter(
    (path) => path.endsWith('index.html') && path !== join(outputRoot, '404.html')
  ).length
  const pagefindRoot = join(outputRoot, 'pagefind')
  const pagefindFiles = await filesUnder(pagefindRoot)
  const pagefindSizes = await Promise.all(pagefindFiles.map((path) => stat(path)))
  const indexBytes = pagefindSizes.reduce((total, file) => total + file.size, 0)
  const search = await benchmarkPagefind(pagefindRoot)
  const report = {
    pages: generatedPages,
    buildMs: Math.round(build.elapsedMs),
    cachedBuildMs: Math.round(cachedBuild.elapsedMs),
    maxRssMb: build.maxRssBytes ? Math.round(build.maxRssBytes / 1024 / 1024) : null,
    searchIndexMb: Number((indexBytes / 1024 / 1024).toFixed(2)),
    searchColdMs: Number(search.coldMs.toFixed(2)),
    searchP95Ms: Number(search.p95Ms.toFixed(2)),
    budgets: {
      buildBudgetMs,
      cachedBuildBudgetMs,
      searchBudgetMs,
      searchColdBudgetMs,
      indexBudgetBytes,
      memoryBudgetBytes
    }
  }
  console.log(JSON.stringify(report, null, 2))

  if (generatedPages !== pageCount) throw new Error(`Expected ${pageCount} pages, got ${generatedPages}`)
  if (build.elapsedMs > buildBudgetMs) throw new Error(`Build exceeded ${buildBudgetMs}ms budget`)
  if (!cachedBuild.stdout.includes('cache hit'))
    throw new Error('Expected the second build to be a cache hit')
  if (cachedBuild.elapsedMs > cachedBuildBudgetMs) {
    throw new Error(`Cached build exceeded ${cachedBuildBudgetMs}ms budget`)
  }
  if (indexBytes > indexBudgetBytes) throw new Error(`Search index exceeded ${indexBudgetBytes} byte budget`)
  if (search.coldMs > searchColdBudgetMs) {
    throw new Error(`Search cold query exceeded ${searchColdBudgetMs}ms budget`)
  }
  if (search.p95Ms > searchBudgetMs) throw new Error(`Search p95 exceeded ${searchBudgetMs}ms budget`)
  if (build.maxRssBytes && build.maxRssBytes > memoryBudgetBytes) {
    throw new Error(`Build memory exceeded ${memoryBudgetBytes} byte budget`)
  }
} finally {
  await rm(fixture, { recursive: true, force: true })
}
