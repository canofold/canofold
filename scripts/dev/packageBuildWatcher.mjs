import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync, unlinkSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

function isDevState(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value.package === 'markdown' || value.package === 'canofold') &&
    (value.status === 'building' || value.status === 'ready' || value.status === 'error') &&
    Number.isInteger(value.generation) &&
    value.generation >= 0 &&
    typeof value.sessionId === 'string' &&
    (value.workspaceId === undefined || typeof value.workspaceId === 'string') &&
    typeof value.heartbeatAt === 'string'
  )
}

export async function readDevState(statePath) {
  try {
    const value = JSON.parse(await readFile(statePath, 'utf8'))
    return isDevState(value) ? value : undefined
  } catch (error) {
    if (error instanceof SyntaxError || error?.code === 'ENOENT') return undefined
    throw error
  }
}

export async function writeDevState(statePath, state) {
  await mkdir(dirname(statePath), { recursive: true })
  const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state)}\n`)
    await rename(temporaryPath, statePath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export async function removeOwnDevState(statePath, sessionId) {
  const state = await readDevState(statePath)
  if (state?.sessionId !== sessionId) return
  try {
    await unlink(statePath)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

function removeOwnDevStateSync(statePath, sessionId) {
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    if (state?.sessionId === sessionId) unlinkSync(statePath)
  } catch (error) {
    if (!(error instanceof SyntaxError) && error?.code !== 'ENOENT') throw error
  }
}

export async function startIncrementalBuildState({
  packageName,
  statePath,
  workspaceId,
  settleMs = 350,
  heartbeatMs = 5_000,
  onError = console.error,
  log = console.log
}) {
  const sessionId = randomUUID()
  const previousState = await readDevState(statePath)
  let generation = (previousState?.generation ?? 0) + 1
  let status = 'building'
  let stateWrites = Promise.resolve()
  let settleTimer
  let closed = false
  const activeTasks = new Set()
  const failedTasks = new Map()

  const persistState = () => {
    stateWrites = stateWrites.catch(onError).then(() =>
      writeDevState(statePath, {
        package: packageName,
        status,
        generation,
        sessionId,
        workspaceId,
        heartbeatAt: new Date().toISOString()
      })
    )
    return stateWrites
  }

  const publishStatus = async (nextStatus) => {
    if (status === nextStatus) return persistState()
    status = nextStatus
    await persistState()
    log(`[canofold:${packageName}] ${status} generation ${generation}`)
  }

  const cancelSettlement = () => {
    if (!settleTimer) return
    clearTimeout(settleTimer)
    settleTimer = undefined
  }

  const scheduleSettlement = () => {
    cancelSettlement()
    settleTimer = setTimeout(() => {
      settleTimer = undefined
      if (closed || activeTasks.size > 0) return
      void publishStatus(failedTasks.size > 0 ? 'error' : 'ready').catch(onError)
    }, settleMs)
  }

  await persistState()
  const heartbeat = setInterval(() => {
    if (!closed) void persistState().catch(onError)
  }, heartbeatMs)

  return {
    start(task) {
      if (closed) return
      cancelSettlement()
      if (status !== 'building') {
        generation += 1
        status = 'building'
        log(`[canofold:${packageName}] building generation ${generation}`)
        void persistState().catch(onError)
      }
      activeTasks.add(task)
      failedTasks.delete(task)
    },
    succeed(task) {
      if (closed) return
      activeTasks.delete(task)
      failedTasks.delete(task)
      scheduleSettlement()
    },
    fail(task, error) {
      if (closed) return
      activeTasks.delete(task)
      failedTasks.set(task, error)
      onError(error)
      scheduleSettlement()
    },
    invalidateState() {
      removeOwnDevStateSync(statePath, sessionId)
    },
    async close() {
      if (closed) return
      closed = true
      cancelSettlement()
      clearInterval(heartbeat)
      await stateWrites.catch(onError)
      await removeOwnDevState(statePath, sessionId)
    }
  }
}

async function snapshotPath(path) {
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink()) return `link:${path}:${info.ino}:${info.ctimeMs}:${info.mtimeMs}`
    if (!info.isDirectory()) {
      return `file:${path}:${info.ino}:${info.size}:${info.ctimeMs}:${info.mtimeMs}`
    }
    const entries = await readdir(path, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    const children = await Promise.all(entries.map((entry) => snapshotPath(join(path, entry.name))))
    return `directory:${path}:${children.join('|')}`
  } catch (error) {
    if (error?.code === 'ENOENT') return `missing:${path}`
    throw error
  }
}

export async function createPollingWatcher(paths, { intervalMs = 250 } = {}) {
  const events = new EventEmitter()
  let snapshots = await Promise.all(paths.map(snapshotPath))
  let activeScan
  let closed = false
  const scan = async () => {
    if (closed || activeScan) return
    activeScan = (async () => {
      try {
        const nextSnapshots = await Promise.all(paths.map(snapshotPath))
        if (nextSnapshots.some((snapshot, index) => snapshot !== snapshots[index])) {
          snapshots = nextSnapshots
          events.emit('all', 'change')
        }
      } catch (error) {
        events.emit('error', error)
      } finally {
        activeScan = undefined
      }
    })()
    await activeScan
  }
  const timer = setInterval(() => void scan(), intervalMs)

  return {
    on(eventName, listener) {
      events.on(eventName, listener)
      return this
    },
    async close() {
      closed = true
      clearInterval(timer)
      await activeScan
      events.removeAllListeners()
    }
  }
}

export function createPackageBuildScheduler({
  build,
  publishState,
  onError = console.error,
  debounceMs = 80,
  initialGeneration = 0
}) {
  let generation = initialGeneration
  let timer
  let active
  let pending = false
  let closed = false

  const launch = () => {
    if (closed) return Promise.resolve()
    if (active) {
      pending = true
      return active
    }

    generation += 1
    const currentGeneration = generation
    active = (async () => {
      try {
        await publishState({ status: 'building', generation: currentGeneration })
        await build()
        await publishState({ status: 'ready', generation: currentGeneration })
      } catch (error) {
        try {
          await publishState({ status: 'error', generation: currentGeneration })
        } catch (stateError) {
          onError(stateError)
        }
        onError(error)
      } finally {
        active = undefined
        if (pending && !closed) {
          pending = false
          void launch()
        }
      }
    })()
    return active
  }

  return {
    start: launch,
    schedule() {
      if (closed) return
      if (active) {
        pending = true
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void launch()
      }, debounceMs)
    },
    async close() {
      closed = true
      pending = false
      if (timer) clearTimeout(timer)
      timer = undefined
      await active
    }
  }
}

export function runCommand(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited unexpectedly (${signal ?? code ?? 'unknown'})`))
    })
  })
}

export async function startPackageBuildWatcher({
  packageName,
  statePath,
  workspaceId,
  watchPaths,
  createWatcher,
  build,
  debounceMs = 80,
  heartbeatMs = 5_000,
  onError = console.error,
  log = console.log
}) {
  const sessionId = randomUUID()
  const previousState = await readDevState(statePath)
  let currentStatus = 'building'
  const previousGeneration = previousState?.generation ?? 0
  let currentGeneration = previousGeneration + 1
  let stateWrites = Promise.resolve()
  let closed = false

  const persistState = () => {
    stateWrites = stateWrites.catch(onError).then(() =>
      writeDevState(statePath, {
        package: packageName,
        status: currentStatus,
        generation: currentGeneration,
        sessionId,
        workspaceId,
        heartbeatAt: new Date().toISOString()
      })
    )
    return stateWrites
  }

  const scheduler = createPackageBuildScheduler({
    build,
    debounceMs,
    initialGeneration: previousGeneration,
    onError,
    publishState: async ({ status, generation }) => {
      currentStatus = status
      currentGeneration = generation
      await persistState()
      log(`[canofold:${packageName}] ${status} generation ${generation}`)
    }
  })
  await persistState()
  let watcher
  try {
    watcher = await createWatcher(watchPaths)
    watcher.on('error', onError)
    watcher.on('all', () => scheduler.schedule())
  } catch (error) {
    await scheduler.close()
    await stateWrites.catch(onError)
    await removeOwnDevState(statePath, sessionId)
    throw error
  }
  const heartbeat = setInterval(() => {
    if (!closed) void persistState().catch(onError)
  }, heartbeatMs)
  await scheduler.start()

  return {
    invalidateState() {
      removeOwnDevStateSync(statePath, sessionId)
    },
    async close() {
      if (closed) return
      closed = true
      clearInterval(heartbeat)
      await watcher.close()
      await scheduler.close()
      await stateWrites.catch(onError)
      await removeOwnDevState(statePath, sessionId)
    }
  }
}

export function installSignalCleanup(controller) {
  let closing = false
  const close = async () => {
    if (closing) return
    closing = true
    try {
      controller.invalidateState?.()
      await controller.close()
    } catch (error) {
      console.error(error)
      process.exitCode = 1
    }
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
