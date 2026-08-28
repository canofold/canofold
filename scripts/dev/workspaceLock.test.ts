import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireWorkspaceLock } from './workspaceLock.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('acquireWorkspaceLock', () => {
  it('rejects a second active development session and releases its own lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'docfuse-workspace-lock-'))
    temporaryDirectories.push(directory)
    const lockPath = join(directory, 'workspace.lock')
    const first = acquireWorkspaceLock(lockPath, {
      pid: 101,
      workspaceId: 'first',
      isProcessAlive: () => true
    })

    expect(() =>
      acquireWorkspaceLock(lockPath, {
        pid: 202,
        workspaceId: 'second',
        isProcessAlive: () => true
      })
    ).toThrow('Docfuse development is already running (PID 101)')

    first.release()
    const second = acquireWorkspaceLock(lockPath, {
      pid: 202,
      workspaceId: 'second',
      isProcessAlive: () => true
    })
    second.release()
  })

  it('replaces a stale lock from a process that no longer exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'docfuse-stale-workspace-lock-'))
    temporaryDirectories.push(directory)
    const lockPath = join(directory, 'workspace.lock')
    acquireWorkspaceLock(lockPath, {
      pid: 101,
      workspaceId: 'stale',
      isProcessAlive: () => true
    })

    const current = acquireWorkspaceLock(lockPath, {
      pid: 202,
      workspaceId: 'current',
      isProcessAlive: () => false
    })
    current.release()
  })
})
