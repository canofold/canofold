import { fork, spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const canofoldRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (!process.argv[2]) throw new Error('Usage: node scripts/dev-playground.mjs <project-directory>')
const projectRoot = resolve(process.cwd(), process.argv[2])
if (!(await stat(projectRoot)).isDirectory()) throw new Error('Playground must be a project directory')
const cliPath = join(canofoldRoot, 'packages/canofold/dist/cli.js')
const stylesPath = join(canofoldRoot, 'packages/markdown/dist/base.css')
let port = Number(process.env.CANOFOLD_DEV_PORT ?? 3333)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('CANOFOLD_DEV_PORT must be a valid TCP port')
}

const packageSignals = new Set([
  'themes',
  'canofold',
  'canofold-shell',
  'markdown-library',
  'markdown-client',
  'vite',
  'plugins-node',
  'plugins-client'
])
const serverSignals = new Set(['themes', 'canofold', 'markdown-library', 'vite', 'plugins-node'])
const seenSignals = new Map()
const readySignals = new Set()
const signalDirectory = await mkdtemp(join(tmpdir(), 'canofold-dev-watch-'))
await mkdir(dirname(stylesPath), { recursive: true })

const oldStyles = await stat(stylesPath).catch((error) => {
  if (error.code === 'ENOENT') return undefined
  throw error
})
let stylesRevision = oldStyles ? `${oldStyles.mtimeMs}:${oldStyles.size}` : undefined
let stylesReady = Boolean(oldStyles)
let packages
let site
let signalWatcher
let stylesWatcher
let closing = false
let draining = false
let restartRequested = false
let refreshRequested = false
const packageOutputTail = []
const parentPid = process.ppid
const parentCheck = setInterval(() => {
  if (process.ppid !== parentPid) void shutdown(1)
}, 1000)
parentCheck.unref()

function report(error) {
  console.error('[canofold-dev]', error instanceof Error ? error.message : String(error))
}

function fail(error) {
  report(error)
  void shutdown(1)
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolveExit) => child.once('exit', resolveExit))
}

async function stopSite() {
  const current = site
  if (!current) return
  site = undefined
  if (current.exitCode !== null || current.signalCode !== null) return
  const exited = waitForExit(current)
  try {
    if (current.connected) current.send({ type: 'shutdown' })
    else current.kill('SIGTERM')
  } catch {
    current.kill('SIGTERM')
  }
  const fallback = setTimeout(() => current.kill('SIGKILL'), 10_000)
  fallback.unref()
  await exited
  clearTimeout(fallback)
}

async function startSite() {
  const child = fork(cliPath, ['dev', '--port', String(port)], {
    cwd: projectRoot,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  })
  site = child
  try {
    await new Promise((resolveReady, rejectReady) => {
      const timeout = setTimeout(
        () => rejectReady(new Error('Canofold dev server did not become ready')),
        60_000
      )
      timeout.unref()
      const onMessage = (message) => {
        if (message?.type !== 'ready') return
        port = message.port
        cleanup()
        resolveReady()
      }
      const onExit = (code) => {
        cleanup()
        rejectReady(new Error(`Canofold dev server exited before ready (${code ?? 'signal'})`))
      }
      function cleanup() {
        clearTimeout(timeout)
        child.off('message', onMessage)
        child.off('exit', onExit)
      }
      child.on('message', onMessage)
      child.once('exit', onExit)
    })
  } catch (error) {
    await stopSite()
    throw error
  }
  child.once('exit', (code) => {
    if (site !== child || closing) return
    site = undefined
    report(`Canofold dev server stopped (${code ?? 'signal'})`)
    void shutdown(1)
  })
}

async function drain() {
  if (draining || closing || !stylesReady || readySignals.size !== packageSignals.size) return
  draining = true
  try {
    while (!closing) {
      if (!site || restartRequested) {
        restartRequested = false
        await stopSite()
        await startSite()
      }
      if (refreshRequested) {
        refreshRequested = false
        site?.send({ type: 'refresh' })
      }
      if (!restartRequested && !refreshRequested) break
    }
  } catch (error) {
    report(error)
    void shutdown(1)
  } finally {
    draining = false
    if (!closing && (restartRequested || refreshRequested)) void drain()
  }
}

function completed(name) {
  if (closing) return
  if (name === 'markdown-styles') {
    stylesReady = true
    if (readySignals.size === packageSignals.size && !site) void drain()
    else if (site) {
      refreshRequested = true
      void drain()
    }
    return
  }
  if (!readySignals.has(name)) {
    readySignals.add(name)
    if (readySignals.size === packageSignals.size && stylesReady) {
      void drain()
    }
    return
  }
  if (serverSignals.has(name)) restartRequested = true
  else refreshRequested = true
  void drain()
}

async function scanSignals() {
  for (const name of packageSignals) {
    let revision
    try {
      revision = await readFile(join(signalDirectory, name), 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (seenSignals.get(name) === revision) continue
    seenSignals.set(name, revision)
    completed(name)
  }
}

async function scanStyles() {
  let output
  try {
    output = await stat(stylesPath)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  const revision = `${output.mtimeMs}:${output.size}`
  if (revision === stylesRevision) {
    if (!stylesReady) {
      stylesReady = true
      if (readySignals.size === packageSignals.size) void drain()
    }
    return
  }
  stylesRevision = revision
  completed('markdown-styles')
}

async function shutdown(code = 0) {
  if (closing) return
  closing = true
  clearInterval(parentCheck)
  signalWatcher?.close()
  stylesWatcher?.close()
  await stopSite()
  if (packages?.pid) {
    const exited = waitForExit(packages)
    try {
      packages.kill('SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
    await exited
  }
  await rm(signalDirectory, { recursive: true, force: true })
  process.exitCode = code
}

signalWatcher = watch(signalDirectory, () => {
  void scanSignals().catch(fail)
})
stylesWatcher = watch(dirname(stylesPath), () => {
  void scanStyles().catch(fail)
})
signalWatcher.on('error', fail)
stylesWatcher.on('error', fail)
void scanSignals().catch(fail)
void scanStyles().catch(fail)
console.log('[canofold-dev] Watching Core packages; the documentation server starts after their first build.')
packages = spawn('pnpm', ['--dir', canofoldRoot, 'dev'], {
  cwd: projectRoot,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, CANOFOLD_WATCH_SIGNAL_DIR: signalDirectory }
})
for (const stream of [packages.stdout, packages.stderr]) {
  createInterface({ input: stream }).on('line', (line) => {
    if (closing) return
    packageOutputTail.push(line)
    if (packageOutputTail.length > 12) packageOutputTail.shift()
    if (
      (stream === packages.stderr && !line.startsWith('$ ')) ||
      /\b(?:error|failed|warn(?:ing)?)\b|✘|ELIFECYCLE|ERR_/i.test(line)
    ) {
      console.error(line)
    }
  })
}
packages.once('error', (error) => {
  report(error)
  void shutdown(1)
})
packages.once('exit', (code) => {
  if (closing) return
  report(`Package watch processes stopped (${code ?? 'signal'})`)
  for (const line of packageOutputTail) console.error(line)
  void shutdown(code || 1)
})
process.once('SIGINT', () => void shutdown(130))
process.once('SIGTERM', () => void shutdown(143))
