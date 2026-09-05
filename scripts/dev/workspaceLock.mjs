import { randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function readLock(lockPath) {
  try {
    const value = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (value && Number.isInteger(value.pid) && value.pid > 0 && typeof value.workspaceId === 'string') {
      return value
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  return undefined
}

function unlinkIfPresent(lockPath) {
  try {
    unlinkSync(lockPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

export function acquireWorkspaceLock(
  lockPath,
  { pid = process.pid, workspaceId = randomUUID(), isProcessAlive = processIsAlive } = {}
) {
  mkdirSync(dirname(lockPath), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, 'wx')
      try {
        writeFileSync(descriptor, `${JSON.stringify({ pid, workspaceId })}\n`)
      } finally {
        closeSync(descriptor)
      }
      let released = false
      return {
        workspaceId,
        release() {
          if (released) return
          released = true
          if (readLock(lockPath)?.workspaceId === workspaceId) unlinkIfPresent(lockPath)
        }
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const existing = readLock(lockPath)
      if (existing && isProcessAlive(existing.pid)) {
        throw new Error(`Canofold development is already running (PID ${existing.pid})`)
      }
      unlinkIfPresent(lockPath)
    }
  }
  throw new Error('Could not acquire the Canofold development lock')
}
