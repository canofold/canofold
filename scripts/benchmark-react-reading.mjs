import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { chromium, firefox, webkit, expect } from '@playwright/test'
import { createReadingDocument } from './lib/readingFixture.mjs'
const core = resolve(import.meta.dirname, '..')
const browserName = process.env.CANOFOLD_BENCHMARK_BROWSER ?? 'chromium'
assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName))
const require = createRequire(core + '/packages/markdown/package.json')
const { createServer } = await import(require.resolve('vite', { paths: [join(core, 'packages/vite')] }))
const root = await mkdtemp(join(tmpdir(), 'canofold-react-reading-'))
let server, browser
try {
  await writeFile(
    join(root, 'index.html'),
    '<div id="root"></div><script type="module" src="/app.mjs"></script>'
  )
  await writeFile(
    join(root, 'app.mjs'),
    `import {createElement} from 'react';import{createRoot}from'react-dom/client';import{Markdown}from'/@fs${core}/packages/markdown/dist/index.js';import'/@fs${core}/packages/markdown/dist/base.css';import'/@fs${core}/packages/themes/src/canofold/tokens.css';let root;window.renderReading=(source,reuse)=>new Promise((resolve,reject)=>{if(!reuse){root?.unmount();root=createRoot(document.getElementById('root'))}const started=performance.now();root.render(createElement(Markdown,{source,retainPrevious:true,onError:reject,onReady:()=>resolve(performance.now()-started)}))});window.disposeReading=()=>root?.unmount();`
  )
  server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    resolve: {
      alias: [
        { find: /^react$/, replacement: require.resolve('react') },
        { find: /^react\/jsx-runtime$/, replacement: require.resolve('react/jsx-runtime') },
        { find: /^react-dom\/client$/, replacement: require.resolve('react-dom/client') }
      ]
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [core, root] } }
  })
  await server.listen()
  browser = await { chromium, firefox, webkit }[browserName].launch()
  const page = await browser.newPage()
  page.setDefaultTimeout(60000)
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
    new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => e.duration))).observe({
      type: 'longtask',
      buffered: true
    })
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.waitForFunction(() => typeof window.renderReading === 'function')
  const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : undefined
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  for (const sections of [32, 128, 512]) {
    const source = createReadingDocument(sections)
    for (const [kind, text, reuse] of [
      ['cold', source, false],
      ['warm', source, false],
      ['edit', source + '\nEdited source', true]
    ]) {
      const ms = await page.evaluate(
        async ({ text, reuse }) => {
          window.__long = []
          return window.renderReading(text, reuse)
        },
        { text, reuse }
      )
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const state = await page.evaluate(() => ({
        nodes: document.querySelectorAll('*').length,
        longTasks: window.__long,
        last: document.querySelector('[data-cf-root]')?.textContent.slice(-50)
      }))
      if (cdp) await cdp.send('HeapProfiler.collectGarbage')
      const mem = cdp ? await cdp.send('Runtime.getHeapUsage') : undefined
      await expect(page.locator('.cf-content code.language-ts')).toHaveCount(sections)
      await expect(page.locator('.cf-content table')).toHaveCount(sections)
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
      assert.ok(state.last.includes(`End marker ${sections}`))
      console.log(
        JSON.stringify({
          browser: browserName,
          sections,
          kind,
          ms: Math.round(ms),
          ...state,
          heapMiB: mem ? Math.round(mem.usedSize / 1024 / 1024) : null
        })
      )
    }
    const edited = source + '\nLatest burst revision'
    const burstMs = await page.evaluate(
      async ({ source, edited }) => {
        const started = performance.now()
        for (let revision = 0; revision < 3; revision++) {
          void window.renderReading(source + '\nSuperseded revision ' + revision, true)
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
        await window.renderReading(edited, true)
        return performance.now() - started
      },
      { source, edited }
    )
    await expect(page.locator('[data-cf-root]')).toContainText('Latest burst revision')
    console.log(JSON.stringify({ browser: browserName, sections, kind: 'burst', ms: Math.round(burstMs) }))
  }
  assert.deepEqual(errors, [])
  await page.evaluate(() => window.disposeReading())
  if (cdp) {
    await cdp.send('HeapProfiler.collectGarbage')
    const mem = await cdp.send('Runtime.getHeapUsage')
    console.log(JSON.stringify({ stage: 'unmounted', heapMiB: Math.round(mem.usedSize / 1024 / 1024) }))
  }
} finally {
  await browser?.close()
  await server?.close()
  await rm(root, { recursive: true, force: true })
}
