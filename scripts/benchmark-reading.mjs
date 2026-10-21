import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { chromium, firefox, webkit, expect } from '@playwright/test'
import { createReadingDocument } from './lib/readingFixture.mjs'
const core = resolve(import.meta.dirname, '..')
const browserName = process.env.CANOFOLD_BENCHMARK_BROWSER ?? 'chromium'
assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName))
const require = createRequire(core + '/packages/markdown/package.json')
const { renderToStaticMarkup } = await import(require.resolve('react-dom/server'))
const { createMarkdownRenderer } = await import(core + '/packages/markdown/dist/server.js')
const root = await mkdtemp(join(tmpdir(), 'canofold-reading-'))
const sizes = [32, 128, 512]

let child, browser
try {
  await mkdir(join(root, 'docs'))
  await writeFile(join(root, 'canofold.config.mjs'), `export default {title:'Reading benchmark'}`)
  await writeFile(
    join(root, 'docs/index.md'),
    '---\ntitle: Home\ndescription: Reading benchmark home\n---\n# Home\n\nShort page.\n'
  )
  await writeFile(
    join(root, 'docs/short.md'),
    '---\ntitle: Short\ndescription: Reading benchmark short page\n---\n# Short\n\nShort page.\n'
  )
  for (const n of sizes) {
    const source = createReadingDocument(n)
    await writeFile(join(root, `docs/long-${n}.md`), source)
    const renderer = createMarkdownRenderer()
    const times = []
    let html = ''
    for (const suffix of ['', '', '\nEdited version']) {
      const started = performance.now()
      const prepared = await renderer.render(source + suffix)
      const compileMs = performance.now() - started
      const renderStart = performance.now()
      html = renderToStaticMarkup(prepared.content)
      times.push({ compileMs: Math.round(compileMs), ssrMs: Math.round(performance.now() - renderStart) })
    }
    console.log(
      JSON.stringify({
        stage: 'server',
        sections: n,
        sourceBytes: Buffer.byteLength(source),
        htmlBytes: Buffer.byteLength(html),
        times,
        rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024)
      })
    )
    renderer.clear()
    global.gc?.()
  }
  child = fork(core + '/packages/canofold/dist/cli.js', ['dev', '--port', '3359'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output)), 60000)
    child.on('message', (m) => {
      if (m?.type === 'ready') {
        clearTimeout(timer)
        resolve(m.port)
      }
    })
    child.once('exit', (c) => {
      clearTimeout(timer)
      reject(new Error(`exit ${c}: ${output}`))
    })
  })
  console.log(JSON.stringify({ stage: 'dev', output, port }))
  browser = await { chromium, firefox, webkit }[browserName].launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : undefined
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    window.__long = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copiedReading = value
        }
      }
    })
    new PerformanceObserver((l) =>
      window.__long.push(...l.getEntries().map((e) => ({ start: e.startTime, ms: e.duration })))
    ).observe({ type: 'longtask', buffered: true })
  })
  await page.goto(`http://127.0.0.1:${port}/short/`)
  for (const n of sizes) {
    for (const kind of ['cold', 'warm']) {
      const started = performance.now()
      await page.locator(`.cf-sidebar a[href="/long-${n}/"]`).evaluate((e) => e.click())
      await page.waitForFunction(
        (n) => document.querySelector('main')?.textContent.includes(`End marker ${n}`),
        n,
        { timeout: 60000 }
      )
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const displayedMs = Math.round(performance.now() - started)
      await page.evaluate(() => window.__canofoldMarkdownReady)
      const interactiveMs = Math.round(performance.now() - started)
      await expect(page.locator('.cf-content code.language-ts')).toHaveCount(n)
      await expect(page.locator('.cf-content table')).toHaveCount(n)
      const codeLayout = await page
        .locator('code.language-ts')
        .first()
        .evaluate((code) => ({
          height: code.getBoundingClientRect().height,
          linesHeight: [...code.querySelectorAll(':scope > .line')].reduce(
            (height, line) => height + line.getBoundingClientRect().height,
            0
          ),
          text: code.textContent
        }))
      assert.ok(Math.abs(codeLayout.height - codeLayout.linesHeight) < 2, 'No extra rows between code lines')
      assert.equal(codeLayout.text.split('\n').length, 16)
      await page.locator('[data-cf-action="copy-code"]').first().click()
      await expect.poll(() => page.evaluate(() => window.__copiedReading?.split('\n').length)).toBe(16)
      const dom = await page.evaluate(() => ({
        nodes: document.querySelectorAll('*').length,
        longTasks: window.__long.splice(0),
        resource: performance
          .getEntriesByType('resource')
          .filter((e) => e.initiatorType === 'fetch')
          .slice(-1)
          .map((e) => ({ ms: e.duration, bytes: e.decodedBodySize }))
      }))
      if (cdp) await cdp.send('HeapProfiler.collectGarbage')
      const heap = cdp ? await cdp.send('Runtime.getHeapUsage') : undefined
      const frames = await page.evaluate(async () => {
        const intervals = []
        let previous = performance.now()
        for (let i = 0; i < 40; i++) {
          window.scrollTo(0, (document.documentElement.scrollHeight * i) / 39)
          await new Promise((r) => requestAnimationFrame(r))
          const now = performance.now()
          intervals.push(now - previous)
          previous = now
        }
        return intervals
      })
      console.log(
        JSON.stringify({
          stage: 'browser',
          sections: n,
          kind,
          displayedMs,
          interactiveMs,
          heapMiB: heap ? Math.round(heap.usedSize / 1024 / 1024) : null,
          ...dom,
          scrollMaxMs: Math.round(Math.max(...frames)),
          scrollP95Ms: Math.round([...frames].sort((a, b) => a - b)[37])
        })
      )
      await page.locator('.cf-sidebar a[href="/short/"]').evaluate((e) => e.click())
      await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Short')
    }
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ stage: 'complete', browser: browserName, errors }))
} finally {
  await browser?.close()
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await once(child, 'exit')
  }
  await rm(root, { recursive: true, force: true })
}
