import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPollingWatcher, readDevState } from './packageBuildWatcher.mjs'
import { createLinkedSiteReconciler } from './linkedSiteRunner.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const stateDirectory = join(repoRoot, '.canofold-dev')
const statePaths = [join(stateDirectory, 'markdown.json'), join(stateDirectory, 'canofold.json')]
const siteRoot = join(repoRoot, 'site')
const cliPath = join(repoRoot, 'packages/canofold/dist/cli.js')
const configuredPort = process.env.PORT
const configuredInspectPort = process.env.CANOFOLD_DEV_INSPECT
const workspaceId = process.env.CANOFOLD_DEV_WORKSPACE_ID

if (!workspaceId) throw new Error('CANOFOLD_DEV_WORKSPACE_ID is required')

if (configuredPort) {
  const port = Number(configuredPort)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${configuredPort}`)
  }
}
if (configuredInspectPort) {
  const inspectPort = Number(configuredInspectPort)
  if (!Number.isInteger(inspectPort) || inspectPort < 1 || inspectPort > 65_535) {
    throw new Error(`Invalid CANOFOLD_DEV_INSPECT: ${configuredInspectPort}`)
  }
}

function startSite(onUnexpectedExit) {
  const args = [cliPath, 'dev']
  if (configuredPort) args.push('--port', configuredPort)
  const execArgv = ['--enable-source-maps']
  if (configuredInspectPort) execArgv.push(`--inspect=${configuredInspectPort}`)
  const child = spawn(process.execPath, [...execArgv, ...args], {
    cwd: siteRoot,
    env: process.env,
    stdio: 'inherit'
  })
  let stopping = false
  let ended = false
  let resolveExit
  const exit = new Promise((resolveExitPromise) => {
    resolveExit = resolveExitPromise
  })
  const finish = (error, code, signal) => {
    if (ended) return
    ended = true
    resolveExit()
    if (stopping) return
    if (error) console.error('[canofold:site]', error)
    else console.error(`[canofold:site] exited unexpectedly (${signal ?? code ?? 'unknown'})`)
    onUnexpectedExit()
  }
  child.once('error', (error) => finish(error))
  child.once('exit', (code, signal) => finish(undefined, code, signal))
  console.log(`[canofold:site] starting ${siteRoot}`)
  return { child, exit, markStopping: () => (stopping = true) }
}

async function stopSite(handle) {
  console.log('[canofold:site] stopping until package builds are ready')
  handle.markStopping()
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) return
  handle.child.kill('SIGTERM')
  const timedOut = await new Promise((resolveTimeout) => {
    const timer = setTimeout(() => resolveTimeout(true), 5_000)
    handle.exit.then(() => {
      clearTimeout(timer)
      resolveTimeout(false)
    })
  })
  if (timedOut) {
    handle.child.kill('SIGKILL')
    await handle.exit
  }
}

await mkdir(stateDirectory, { recursive: true })
console.log('[canofold:site] waiting for Markdown and Canofold build states')
const reconciler = createLinkedSiteReconciler({
  readStates: () => Promise.all(statePaths.map((statePath) => readDevState(statePath))),
  startSite,
  stopSite,
  workspaceId,
  onError: (error) => console.error('[canofold:site]', error)
})
const watcher = await createPollingWatcher(statePaths)
watcher.on('all', () => void reconciler.reconcile())
watcher.on('error', (error) => console.error('[canofold:site]', error))
const siteWatcher = await createPollingWatcher([join(siteRoot, 'docs'), join(siteRoot, 'canofold.config.ts')])
siteWatcher.on('all', () => void reconciler.retry())
siteWatcher.on('error', (error) => console.error('[canofold:site]', error))
const leaseTimer = setInterval(() => void reconciler.reconcile(), 5_000)
await reconciler.reconcile()

let closing = false
const close = async () => {
  if (closing) return
  closing = true
  clearInterval(leaseTimer)
  await Promise.all([watcher.close(), siteWatcher.close()])
  await reconciler.close()
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
