import assert from 'node:assert/strict'
import { execFile, fork } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { promisify } from 'node:util'
import { chromium, expect } from '@playwright/test'
import { writeDemoFixture } from './lib/demoFixture.mjs'

const workspace = resolve(import.meta.dirname, '..')
const pages = Number(process.env.CANOFOLD_BENCHMARK_PAGES ?? 76)
const demosPerPage = Number(process.env.CANOFOLD_BENCHMARK_DEMOS ?? 6)
const observeSlow = process.argv.includes('--observe-slow')
const exceededStartupLimit = new Set()
assert.ok(Number.isInteger(pages) && pages >= 4, 'The workload requires at least four component families')
assert.ok(
  Number.isInteger(demosPerPage) && demosPerPage >= 4,
  'The workload requires at least four Demos per page'
)
const fixture = await mkdtemp(join(tmpdir(), 'canofold-demo-benchmark-'))
const cli = join(workspace, 'packages/canofold/dist/cli.js')
const run = promisify(execFile)
const iframeIndex = demosPerPage - 1
const reportPath = join(fixture, '.canofold/cache/build-report.json')
const measurements = {}
let child
let browser
let output = ''
let serviceReady = false
const browserMessages = []

async function stop() {
  const current = child
  child = undefined
  if (!current || current.exitCode !== null || current.signalCode !== null) return
  const exited = once(current, 'exit')
  current.kill('SIGTERM')
  const fallback = setTimeout(() => current.kill('SIGKILL'), 10000)
  try {
    const [code, signal] = await exited
    if (serviceReady) {
      assert.equal(signal, null, `Demo server required forced termination: ${signal}`)
      assert.equal(code, 0, output)
    } else {
      assert.notEqual(signal, 'SIGKILL', 'Startup cleanup required forced termination')
    }
  } finally {
    clearTimeout(fallback)
  }
}

async function start(stage) {
  const started = performance.now()
  output = ''
  serviceReady = false
  if (stage === 'cold') {
    for (const path of ['.canofold', 'node_modules/.vite']) {
      await assert.rejects(access(join(fixture, path)), { code: 'ENOENT' })
    }
  }
  child = fork(cli, ['dev', '--port', '3347'], {
    cwd: fixture,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, CANOFOLD_BENCHMARK_REPORT: '1' }
  })
  child.stdout.on('data', (data) => {
    output += data
  })
  child.stderr.on('data', (data) => {
    output += data
  })
  const port = await new Promise((resolveReady, reject) => {
    let timeout = setTimeout(() => {
      exceededStartupLimit.add(stage)
      console.log(
        JSON.stringify({
          pages,
          demos: pages * demosPerPage,
          stage,
          status: 'exceeded-60s',
          elapsedMs: Math.round(performance.now() - started)
        })
      )
      if (observeSlow) {
        // Diagnostic continuation does not relax the normal startup limit.
        // Collect warm-start measurements, then fail explicitly below.
        timeout = setTimeout(() => {
          cleanup()
          reject(new Error(`Slow-start observation exceeded 180 seconds:\n${output}`))
        }, 120000)
      } else {
        cleanup()
        reject(new Error(`Demo startup did not become ready within 60 seconds:\n${output}`))
      }
    }, 60000)
    const onMessage = (message) => {
      if (message?.type !== 'ready') return
      serviceReady = true
      cleanup()
      resolveReady(message.port)
    }
    const onExit = (code) => {
      cleanup()
      reject(new Error(`Demo server exited (${code}):\n${output}`))
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    function cleanup() {
      clearTimeout(timeout)
      child.off('message', onMessage)
      child.off('exit', onExit)
      child.off('error', onError)
    }
    child.on('message', onMessage)
    child.once('exit', onExit)
    child.once('error', onError)
  })
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  assert.equal(report.pages, pages)
  assert.equal(report.cacheHit, stage !== 'cold')
  assert.doesNotMatch(output, /is deprecated|Preview failed|Build failed/)
  const readyMs = Math.round(performance.now() - started)
  const rss =
    process.platform === 'win32'
      ? undefined
      : Number((await run('ps', ['-o', 'rss=', '-p', String(child.pid)])).stdout.trim()) / 1024
  const peak =
    stage === 'cold'
      ? JSON.parse(await readFile(join(fixture, '.canofold/dist/.benchmark.json'), 'utf8')).maxRssBytes /
        1024 /
        1024
      : undefined
  measurements[stage] = {
    readyMs,
    buildMs: report.durationMs,
    serverRssMiB: rss && Math.round(rss),
    buildPeakRssMiB: peak && Math.round(peak),
    startupLimitExceeded: exceededStartupLimit.has(stage)
  }
  console.log(JSON.stringify({ pages, demos: pages * demosPerPage, stage, ...measurements[stage] }))
  return `http://127.0.0.1:${port}`
}

async function changedReport(expectedPages) {
  await expect
    .poll(
      async () => {
        const report = JSON.parse(await readFile(reportPath, 'utf8'))
        return report.mode === 'incremental' ? report.changedPages.length : 0
      },
      { timeout: 15000 }
    )
    .toBe(expectedPages)
  return JSON.parse(await readFile(reportPath, 'utf8'))
}

try {
  await mkdir(join(fixture, 'node_modules/@canofold'), { recursive: true })
  await Promise.all(
    Object.entries({
      canofold: 'packages/canofold',
      '@canofold/vite': 'packages/vite',
      react: 'packages/vite/node_modules/react',
      'react-dom': 'packages/vite/node_modules/react-dom',
      'lucide-react': 'packages/markdown/node_modules/lucide-react',
      vite: 'packages/vite/node_modules/vite'
    }).map(([name, path]) =>
      symlink(
        join(workspace, path),
        join(fixture, 'node_modules', name),
        process.platform === 'win32' ? 'junction' : 'dir'
      )
    )
  )
  await writeFile(
    join(fixture, 'package.json'),
    JSON.stringify({ name: 'demo-benchmark', type: 'module', version: '1.0.0' })
  )
  await writeFile(
    join(fixture, 'canofold.config.ts'),
    "import { vite } from '@canofold/vite'; export default { demos: { engine: vite() } }"
  )
  await writeFile(join(fixture, 'vite.config.ts'), 'export default { server: { hmr: { overlay: true } } }')
  const workload = await writeDemoFixture(fixture, pages, demosPerPage)
  console.log(
    JSON.stringify({
      workload,
      runtime: { node: process.version, platform: process.platform, arch: process.arch }
    })
  )
  const coldBase = await start('cold')
  browser = await chromium.launch()
  const coldPage = await browser.newPage()
  const coldErrors = []
  coldPage.on('pageerror', (error) => coldErrors.push(error.message))
  const coldPageStarted = performance.now()
  await coldPage.goto(coldBase)
  await expect(coldPage.getByRole('button', { name: 'Example 0-0: Option 0-0-0', exact: true })).toBeVisible()
  await expect(
    coldPage
      .frameLocator('iframe')
      .first()
      .getByRole('button', { name: `Example 0-${iframeIndex}: Option 0-${iframeIndex}-0`, exact: true })
  ).toBeVisible()
  await expect(coldPage.frameLocator('iframe').first().locator('html')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)'
  )
  await coldPage.locator('[data-cf-demo-source-toggle]').first().click()
  await expect(coldPage.locator('[data-cf-demo-source]').first()).toBeVisible()
  assert.ok(
    await coldPage.locator('[data-cf-demo-source] code span[style]').count(),
    'Cold source must retain actual syntax highlighting'
  )
  measurements.coldPage = {
    readyMs: Math.round(performance.now() - coldPageStarted),
    serverRssMiB: Math.round(
      Number((await run('ps', ['-o', 'rss=', '-p', String(child.pid)])).stdout.trim()) / 1024
    )
  }
  assert.deepEqual(coldErrors, [])
  console.log(JSON.stringify({ stage: 'coldPage', ...measurements.coldPage }))
  await coldPage.close()
  await stop()
  await start('restart')
  await stop()
  const base = await start('restartAgain')
  const page = await browser.newPage()
  const browserSession = await page.context().newCDPSession(page)
  const errors = []
  page.on('console', async (message) => {
    const frameUrl = message.text().includes('[vite]')
      ? await message
          .args()[0]
          ?.evaluate(() => location.href)
          .catch(() => undefined)
      : undefined
    browserMessages.push(`${frameUrl ? `${frameUrl}: ` : ''}${message.text()}`)
  })
  page.on('requestfailed', (request) =>
    browserMessages.push(`FAILED ${request.url()} ${request.failure()?.errorText}`)
  )
  page.on('response', (response) => {
    if (response.url().includes('/src/style.css')) {
      browserMessages.push(`CSS ${response.request().frame().url()} ${response.status()} ${response.url()}`)
    }
  })
  const sockets = new Set()
  const connected = new Set()
  page.on('websocket', (socket) => {
    sockets.add(socket)
    socket.on('framereceived', ({ payload }) => {
      if (String(payload).includes('"type":"connected"')) connected.add(socket)
      if (String(payload).includes('style.css')) browserMessages.push(`HMR ${String(payload)}`)
    })
    socket.on('close', () => {
      sockets.delete(socket)
      connected.delete(socket)
    })
  })
  const requestedDemos = new Set()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/src/demos/')) requestedDemos.add(path)
  })
  const firstLoad = performance.now()
  await page.goto(base)
  const button = page.getByRole('button', { name: 'Example 0-0: Option 0-0-0', exact: true })
  await expect(button).toBeVisible()
  await button.click()
  await expect(page.getByRole('button', { name: 'Example 0-0: Option 0-0-1', exact: true })).toBeVisible()
  const sourceToggle = page.locator('[data-cf-demo-source-toggle]').first()
  await sourceToggle.click()
  await expect(page.locator('[data-cf-demo-source]').first()).toBeVisible()
  const isolated = page.frameLocator('iframe').first()
  await expect(
    isolated.getByRole('button', { name: `Example 0-${iframeIndex}: Option 0-${iframeIndex}-0`, exact: true })
  ).toBeVisible()
  measurements.firstPage = {
    readyMs: Math.round(performance.now() - firstLoad),
    requestedDemos: requestedDemos.size,
    heapMiB: Math.round((await browserSession.send('Runtime.getHeapUsage')).usedSize / 1024 / 1024)
  }
  assert.equal(requestedDemos.size, demosPerPage, 'Opening one page must not eagerly request every Demo')
  await isolated
    .getByRole('button', { name: `Example 0-${iframeIndex}: Option 0-${iframeIndex}-0`, exact: true })
    .click()
  await expect(
    isolated.getByRole('button', { name: `Example 0-${iframeIndex}: Option 0-${iframeIndex}-1`, exact: true })
  ).toBeVisible()
  const example = page.getByRole('region', { name: 'Example 0-0', exact: true })
  await example.getByRole('textbox', { name: 'Filter rows', exact: true }).fill('Option 0-0-11')
  await expect(example.getByRole('row')).toHaveCount(2)
  await example.getByRole('textbox', { name: 'Filter rows', exact: true }).fill('')
  await example.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(example.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled()
  await example.getByRole('button', { name: 'Toggle lazy details', exact: true }).click()
  await expect(example.getByRole('heading', { name: 'Lazy details 0', exact: true })).toBeVisible()
  const demoPath = join(fixture, 'src/demos/0-0.tsx')
  const before = await readFile(demoPath, 'utf8')
  let started = performance.now()
  await writeFile(demoPath, before.replace('Example 0-0:', 'Updated 0-0:'))
  await expect(page.getByRole('button', { name: /Updated 0-0:/ })).toBeVisible()
  await expect(page.locator('[data-cf-demo-source]').first()).toContainText('Updated 0-0:')
  const edit = await changedReport(1)
  measurements.demoEdit = { readyMs: Math.round(performance.now() - started), buildMs: edit.durationMs }
  const documentPath = join(fixture, 'docs/index.md')
  // Hold one old iframe CSS response across the next edit. A frame that is
  // still importing must discard that stale graph instead of missing HMR.
  let releaseFrameCss
  let frameCssHeld = false
  let frameCssFetched = false
  const frameCssGate = new Promise((resolve) => {
    releaseFrameCss = resolve
  })
  await page.route('**/src/style.css*', async (route) => {
    if (route.request().frame().parentFrame() && !frameCssHeld) {
      frameCssHeld = true
      const response = await route.fetch()
      frameCssFetched = true
      await frameCssGate
      await route.fulfill({ response })
    } else await route.continue()
  })
  started = performance.now()
  await writeFile(documentPath, `${await readFile(documentPath, 'utf8')}\n\nUpdated component guide.\n`)
  await expect(page.getByText('Updated component guide.', { exact: true })).toBeVisible()
  const documentReport = JSON.parse(await readFile(reportPath, 'utf8'))
  assert.equal(documentReport.changedPages.length, 1)
  measurements.documentEdit = {
    readyMs: Math.round(performance.now() - started),
    buildMs: documentReport.durationMs
  }
  console.log(
    JSON.stringify({ stage: 'edits', measurements, sockets: sockets.size, connected: connected.size })
  )
  started = performance.now()
  await expect.poll(() => frameCssFetched).toBe(true)
  await writeFile(
    join(fixture, 'src/style.css'),
    'button { color: rgb(220, 20, 60) } body { background: rgb(12, 34, 56) }'
  )
  await expect(page.getByRole('button', { name: /Updated 0-0:/ })).toHaveCSS('color', 'rgb(220, 20, 60)')
  releaseFrameCss()
  await expect(isolated.getByRole('button', { name: new RegExp(`Example 0-${iframeIndex}:`) })).toHaveCSS(
    'color',
    'rgb(220, 20, 60)'
  )
  await expect(isolated.locator('body')).toHaveCSS('background-color', 'rgb(12, 34, 56)')
  measurements.sharedEdit = { readyMs: Math.round(performance.now() - started), handledBy: 'vite-hmr' }
  await page.unrouteAll({ behavior: 'wait' })
  const continuous = []
  const initialDocument = await readFile(documentPath, 'utf8')
  for (let round = 0; round < 12; round += 1) {
    started = performance.now()
    const kind = round % 2 === 0 ? 'document' : 'demo'
    if (kind === 'document') {
      await writeFile(documentPath, `${initialDocument}\n\nContinuous guide ${round}.\n`)
      await expect(page.getByText(`Continuous guide ${round}.`, { exact: true })).toBeVisible()
    } else {
      await writeFile(demoPath, before.replace('Example 0-0:', `Continuous ${round}:`))
      await expect(page.getByRole('button', { name: new RegExp(`Continuous ${round}:`) })).toBeVisible()
      await expect(page.locator('[data-cf-demo-source]').first()).toContainText(`Continuous ${round}:`)
    }
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(report.changedPages.length, 1)
    const rss = Number((await run('ps', ['-o', 'rss=', '-p', String(child.pid)])).stdout.trim()) / 1024
    continuous.push({
      round,
      kind,
      readyMs: Math.round(performance.now() - started),
      buildMs: report.durationMs,
      rssMiB: Math.round(rss),
      browserHeapMiB: Math.round((await browserSession.send('Runtime.getHeapUsage')).usedSize / 1024 / 1024)
    })
  }
  // Saves arriving while the previous build is active must converge on the last
  // revision. Do not wait for a build/iframe handshake between these saves.
  started = performance.now()
  for (let revision = 0; revision < 8; revision += 1) {
    await writeFile(documentPath, `${initialDocument}\n\nBurst revision ${revision}.\n`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  await expect(page.getByText('Burst revision 7.', { exact: true })).toBeVisible()
  measurements.burstEdit = { readyMs: Math.round(performance.now() - started), revisions: 8 }
  await writeFile(documentPath, `---\ntitle: [\n---\n${initialDocument}`)
  const overlay = page.locator('dialog').filter({ hasText: 'Build error:' })
  await expect(overlay).toBeVisible()
  await expect(page.getByText('Burst revision 7.', { exact: true })).toBeVisible()
  await writeFile(documentPath, `${initialDocument}\n\nRecovered guide.\n`)
  await expect(page.getByText('Recovered guide.', { exact: true })).toBeVisible()
  await expect(overlay).toHaveCount(0)
  measurements.continuousEdits = continuous
  measurements.failureRecovery = 'last good page retained; corrected revision visible'
  const componentPath = join(fixture, 'src/components/component-0/parts.tsx')
  const componentSource = await readFile(componentPath, 'utf8')
  await writeFile(componentPath, 'export const Broken = <div')
  await writeFile(documentPath, `${initialDocument}\n\nComponent recovered guide.\n`)
  await expect(overlay).toBeVisible()
  await writeFile(componentPath, componentSource)
  await expect(page.getByText('Component recovered guide.', { exact: true })).toBeVisible()
  await expect(overlay).toHaveCount(0)
  measurements.componentFailureRecovery = 'imported component repaired while documentation build was failed'
  await writeFile(demoPath, before.replace('Example 0-0:', 'Updated 0-0:'))
  await expect(page.getByRole('button', { name: /Updated 0-0:/ })).toBeVisible()
  await expect(page.locator('[data-cf-demo-source]').first()).toContainText('Updated 0-0:')
  const manifestPath = join(fixture, '.canofold/cache/build-manifest.json')
  const manifestAfterContinuousEdits = await readFile(manifestPath, 'utf8')
  for (const [index, verify] of [
    [
      1,
      async (region) => {
        await region.getByRole('button', { name: 'Save form', exact: true }).click()
        await expect(region.getByRole('alert')).toHaveCount(2)
        await region.getByRole('textbox', { name: 'name', exact: true }).fill('Ada')
        await region.getByRole('textbox', { name: 'email', exact: true }).fill('ada@example.test')
        await region.getByRole('button', { name: 'Save form', exact: true }).click()
        await expect(region.getByText('Form saved', { exact: true })).toBeVisible()
      }
    ],
    [
      2,
      async (region) => {
        await region.getByRole('button', { name: 'Group 0', exact: true }).click()
        await expect(region.getByRole('checkbox')).toHaveCount(12)
      }
    ],
    [
      3,
      async (region) => {
        await region.getByRole('button', { name: 'Open dialog', exact: true }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
      }
    ]
  ]) {
    await page.goto(`${base}/component-${index}/`)
    await verify(page.getByRole('region', { name: `Example ${index}-0`, exact: true }))
  }
  await page.goto(`${base}/component-${pages - 1}/`)
  await expect(page.getByRole('button', { name: new RegExp(`Example ${pages - 1}-0:`) })).toBeVisible()
  await expect(
    page
      .frameLocator('iframe')
      .first()
      .getByRole('button', { name: new RegExp(`Example ${pages - 1}-${iframeIndex}:`) })
  ).toBeVisible()
  await page.goto(base)
  await expect(page.getByRole('button', { name: /Updated 0-0:/ })).toBeVisible()
  assert.equal(
    await readFile(manifestPath, 'utf8'),
    manifestAfterContinuousEdits,
    'Opening already prepared routes must not invalidate build inputs or outputs'
  )
  assert.deepEqual(errors, [])
  assert.doesNotMatch(output, /is deprecated|Preview failed|Build failed/)
  console.log(
    JSON.stringify(
      {
        pages,
        demos: pages * demosPerPage,
        workload,
        measurements,
        browser: 'Chromium: inline/iframe, interaction, source, edits, navigation passed',
        startupLimitExceeded: [...exceededStartupLimit]
      },
      null,
      2
    )
  )
  assert.equal(
    exceededStartupLimit.size,
    0,
    `Startup exceeded the unchanged 60-second limit in: ${[...exceededStartupLimit].join(', ')}. Diagnostic completion is not a passing performance result.`
  )
} catch (error) {
  const report = await readFile(reportPath, 'utf8')
    .then(JSON.parse)
    .catch(() => undefined)
  console.error(
    JSON.stringify({
      serverOutput: output.slice(-12000),
      browserMessages: browserMessages.slice(-40),
      frameStyles: await Promise.all(
        (
          browser
            ?.contexts()
            .flatMap((context) => context.pages())
            .at(-1)
            ?.frames() ?? []
        ).map(async (frame) => ({
          url: frame.url(),
          styles: await frame
            .evaluate(() =>
              [...document.querySelectorAll('style[data-vite-dev-id]')]
                .filter((style) => style.getAttribute('data-vite-dev-id')?.endsWith('/src/style.css'))
                .map((style) => ({ id: style.getAttribute('data-vite-dev-id'), text: style.textContent }))
            )
            .catch(() => [])
        }))
      ),
      report: report && {
        mode: report.mode,
        durationMs: report.durationMs,
        changedPages: report.changedPages
      }
    })
  )
  console.error(
    JSON.stringify({ status: 'incomplete', measurements, startupLimitExceeded: [...exceededStartupLimit] })
  )
  throw error
} finally {
  try {
    await browser?.close()
  } finally {
    try {
      await stop()
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  }
}
