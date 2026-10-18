import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const canofoldRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = resolve(canofoldRoot, '../vite-component-playground')
const manifest = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))

async function availablePort() {
  const server = createServer()
  await new Promise((resolveReady, rejectReady) => {
    server.once('error', rejectReady)
    server.listen(0, '127.0.0.1', resolveReady)
  })
  const port = server.address().port
  await new Promise((resolveClosed) => server.close(resolveClosed))
  return port
}

function processes() {
  const output = execFileSync('ps', ['-A', '-o', 'pid=,pgid=,stat=,command='], {
    encoding: 'utf8'
  })
  return new Map(
    output
      .trim()
      .split('\n')
      .map((line) => {
        const [pid, group, state, ...command] = line.trim().split(/\s+/)
        return [Number(pid), { group: Number(group), state, command: command.join(' ') }]
      })
  )
}

function liveGroupMembers(group) {
  return [...processes()]
    .filter(([, entry]) => entry.group === group && !entry.state.startsWith('Z'))
    .map(([pid]) => pid)
}

function siteProcess(group) {
  return [...processes()].find(
    ([, entry]) =>
      entry.group === group && !entry.state.startsWith('Z') && entry.command.includes('cli.js dev --port ')
  )?.[0]
}

async function waitUntil(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`Condition was not met within ${timeoutMs} ms`)
}

async function responds(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/button/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(2000)
    })
    return response.status === 200
  } catch {
    return false
  }
}

test(
  'dev survives an occupied port, keeps its address across restarts, and stops without false errors',
  {
    skip: process.platform === 'win32' && 'requires POSIX process-group cleanup',
    timeout: 120_000
  },
  async (t) => {
    assert.equal(manifest.scripts.dev, 'canofold dev')
    let port = await availablePort()
    const occupiedPort = port
    const occupied = createServer((socket) => socket.end())
    await new Promise((resolveReady) => occupied.listen(port, '127.0.0.1', resolveReady))
    t.after(() => new Promise((resolveClosed) => occupied.close(resolveClosed)))
    const probeName = `__canofold_dev_probe_${port}`
    const probePath = resolve(projectRoot, 'docs', `${probeName}.md`)
    const coreSourcePath = resolve(projectRoot, '../canofold/packages/canofold/src/version.ts')
    const originalCoreSourceStat = await stat(coreSourcePath)
    const themeSourcePath = resolve(projectRoot, '../canofold/packages/themes/src/neumorphism/theme.css')
    const originalThemeSourceStat = await stat(themeSourcePath)
    const themeDefinitionSourcePath = resolve(
      projectRoot,
      '../canofold/packages/themes/src/themes/neumorphism.ts'
    )
    const originalThemeDefinitionSourceStat = await stat(themeDefinitionSourcePath)
    let touchedCoreSource = false
    let touchedThemeSource = false
    let touchedThemeDefinitionSource = false
    const child = spawn(process.execPath, ['scripts/dev-playground.mjs', projectRoot], {
      cwd: canofoldRoot,
      detached: true,
      env: { ...process.env, CANOFOLD_DEV_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    let exitResult
    let spawnError
    const capture = (chunk) => {
      output = `${output}${chunk}`.slice(-12_000)
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.once('exit', (code, signal) => {
      exitResult = { code, signal }
    })
    child.once('error', (error) => {
      spawnError = error
    })

    try {
      await waitUntil(async () => {
        if (spawnError) throw spawnError
        if (exitResult) throw new Error(`Dev process exited before its page was ready:\n${output}`)
        const ready = output.match(/Dev server running at http:\/\/127\.0\.0\.1:(\d+)\//)
        if (!ready) return false
        port = Number(ready[1])
        return responds(port)
      }, 90_000)

      await waitUntil(
        () => output.includes(`[canofold] Dev server running at http://127.0.0.1:${port}/`),
        5_000
      )
      assert.equal(
        output.split(`http://127.0.0.1:${port}/`).length - 1,
        1,
        'the preview address should appear once on initial startup'
      )
      assert.doesNotMatch(output, /packages\/canofold dev: ESM dist\//)
      assert.ok(port > occupiedPort, 'the preview must not use the occupied port')
      assert.equal(occupied.listening, true, 'the original server must stay running')
      assert.doesNotMatch(output, /Outputs:|versions current|sends diagram source/)
      const probeRoute = `http://127.0.0.1:${port}/${probeName}/`

      const markdownHtml = await (await fetch(`http://127.0.0.1:${port}/markdown/`)).text()
      assert.match(
        markdownHtml,
        /<iframe[^>]*src="\/examples\/embed-preview\.html"[^>]*sandbox=""/,
        "the standalone HTML example must retain the renderer's secure default sandbox"
      )
      for (const label of [
        'Canofold · 浅色',
        'Canofold · 深色',
        '玻璃拟态',
        '铅笔手绘风',
        '手绘涂鸦风',
        '极简扁平风',
        '包豪斯风格',
        '新野兽派',
        '新拟物派',
        '孟菲斯',
        '赛博中华',
        '像素动漫',
        '多巴胺设计',
        '少女漫画',
        'Outrun 复古未来'
      ]) {
        assert.match(markdownHtml, new RegExp(`>${label}<\\/button>`))
      }

      const englishMarkdownHtml = await (await fetch(`http://127.0.0.1:${port}/en/markdown/`)).text()
      for (const label of [
        'Canofold · Light',
        'Canofold · Dark',
        'Glassmorphism',
        'Sketch Style',
        'Hand-Drawn Doodle',
        'Minimalist Flat',
        'Bauhaus',
        'Neo-Brutalist',
        'Neumorphism',
        'Memphis',
        'Cyber Chinese',
        'Pixel Anime',
        'Dopamine Design',
        'Shoujo Manga',
        'Outrun'
      ]) {
        assert.match(englishMarkdownHtml, new RegExp(`>${label}<\\/button>`))
      }

      const embeddedHtml = await (await fetch(`http://127.0.0.1:${port}/examples/embed-preview.html`)).text()
      assert.match(embeddedHtml, /data-canofold-live-reload="off"/)
      assert.doesNotMatch(embeddedHtml, /__canofold\/events/)

      assert.ok(
        liveGroupMembers(child.pid).length > 1,
        'package watchers and documentation server must be running'
      )

      const updateStarted = performance.now()
      await writeFile(probePath, `# ${probeName}\n\nLive content update`)
      await waitUntil(async () => {
        try {
          const response = await fetch(probeRoute, {
            signal: AbortSignal.timeout(2000)
          })
          return response.ok && (await response.text()).includes('Live content update')
        } catch {
          return false
        }
      }, 15_000)
      t.diagnostic(`new Markdown page visible after ${Math.round(performance.now() - updateStarted)} ms`)
      await rm(probePath)
      await waitUntil(async () => {
        try {
          return (await fetch(probeRoute, { signal: AbortSignal.timeout(2000) })).status === 404
        } catch {
          return false
        }
      }, 15_000)

      const previousSitePid = siteProcess(child.pid)
      assert.ok(previousSitePid, 'the Canofold site process must be observable')
      const coreUpdateStarted = performance.now()
      await utimes(coreSourcePath, originalCoreSourceStat.atime, new Date())
      touchedCoreSource = true
      await waitUntil(async () => {
        const nextSitePid = siteProcess(child.pid)
        return nextSitePid && nextSitePid !== previousSitePid && (await responds(port))
      }, 30_000)
      t.diagnostic(
        `Core source watch rebuilt and preview was reachable after ${Math.round(performance.now() - coreUpdateStarted)} ms`
      )

      const previousThemeSitePid = siteProcess(child.pid)
      assert.ok(previousThemeSitePid, 'the restarted site process must be observable')
      const themeUpdateStarted = performance.now()
      await utimes(themeSourcePath, originalThemeSourceStat.atime, new Date())
      touchedThemeSource = true
      await waitUntil(async () => {
        const nextSitePid = siteProcess(child.pid)
        return nextSitePid && nextSitePid !== previousThemeSitePid && (await responds(port))
      }, 30_000)
      t.diagnostic(
        `Theme source watch rebuilt and preview was reachable after ${Math.round(performance.now() - themeUpdateStarted)} ms`
      )

      const previousThemeDefinitionSitePid = siteProcess(child.pid)
      assert.ok(previousThemeDefinitionSitePid, 'the theme CSS restart must remain observable')
      const themeDefinitionUpdateStarted = performance.now()
      await utimes(themeDefinitionSourcePath, originalThemeDefinitionSourceStat.atime, new Date())
      touchedThemeDefinitionSource = true
      await waitUntil(async () => {
        const nextSitePid = siteProcess(child.pid)
        return nextSitePid && nextSitePid !== previousThemeDefinitionSitePid && (await responds(port))
      }, 30_000)
      t.diagnostic(
        `Theme definition watch rebuilt and preview was reachable after ${Math.round(performance.now() - themeDefinitionUpdateStarted)} ms`
      )

      child.kill('SIGTERM')
      await waitUntil(() => Boolean(exitResult), 20_000)
      assert.deepEqual(exitResult, { code: 143, signal: null })
      await waitUntil(async () => !(await responds(port)), 10_000)
      await waitUntil(() => liveGroupMembers(child.pid).length === 0, 10_000)
      assert.doesNotMatch(output, /ELIFECYCLE|ERR_PNPM|Command failed|dev:.*Failed/)
    } catch (error) {
      error.message += `\nRemaining test processes: ${JSON.stringify(liveGroupMembers(child.pid))}`
      error.message += `\nRecent dev output:\n${output}`
      throw error
    } finally {
      await rm(probePath, { force: true })
      if (!exitResult) child.kill('SIGTERM')
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
      }
      if (touchedCoreSource) {
        await utimes(coreSourcePath, originalCoreSourceStat.atime, originalCoreSourceStat.mtime)
      }
      if (touchedThemeSource) {
        await utimes(themeSourcePath, originalThemeSourceStat.atime, originalThemeSourceStat.mtime)
      }
      if (touchedThemeDefinitionSource) {
        await utimes(
          themeDefinitionSourcePath,
          originalThemeDefinitionSourceStat.atime,
          originalThemeDefinitionSourceStat.mtime
        )
      }
    }
  }
)
