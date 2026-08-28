import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceSupervisor,
  pipePrefixedOutput,
  workspaceProcessConfigs
} from './workspaceSupervisor.mjs'

class FakeChild extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  kill = vi.fn((signal: NodeJS.Signals) => {
    this.signalCode = signal
    queueMicrotask(() => this.emit('exit', null, signal))
    return true
  })
}

describe('pipePrefixedOutput', () => {
  it('prefixes complete and partial output lines', async () => {
    const source = new PassThrough()
    const target = new PassThrough()
    let output = ''
    target.on('data', (chunk) => {
      output += chunk
    })

    pipePrefixedOutput(source, target, '[markdown]')
    source.write('first\nsec')
    source.end('ond')
    await new Promise((resolve) => source.once('end', resolve))

    expect(output).toBe('[markdown] first\n[markdown] second\n')
  })
})

describe('workspaceProcessConfigs', () => {
  it('enables the inspector only for debug sessions and forwards the site port', () => {
    const regular = workspaceProcessConfigs({
      env: { DOCFUSE_DEV_INSPECT: '9999' },
      port: '34567',
      workspaceId: 'regular-workspace'
    })
    const debug = workspaceProcessConfigs({
      debug: true,
      env: {},
      port: '34567',
      workspaceId: 'debug-workspace'
    })

    expect(regular).toHaveLength(3)
    expect(regular.every((config) => config.env.PORT === '34567')).toBe(true)
    expect(regular.every((config) => config.env.DOCFUSE_DEV_WORKSPACE_ID === 'regular-workspace')).toBe(true)
    expect(regular.every((config) => config.env.DOCFUSE_DEV_INSPECT === undefined)).toBe(true)
    expect(debug.every((config) => config.env.DOCFUSE_DEV_INSPECT === '9230')).toBe(true)
  })
})

describe('createWorkspaceSupervisor', () => {
  it('starts all workers and closes them together without reporting expected exits', async () => {
    const children: FakeChild[] = []
    const spawnProcess = vi.fn(() => {
      const child = new FakeChild()
      children.push(child)
      return child
    })
    const onUnexpectedExit = vi.fn()
    const supervisor = createWorkspaceSupervisor({
      processes: workspaceProcessConfigs({ env: {} }),
      spawnProcess,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      onUnexpectedExit
    })

    expect(spawnProcess).toHaveBeenCalledTimes(3)
    await supervisor.close()
    expect(children.every((child) => child.kill.mock.calls[0]?.[0] === 'SIGTERM')).toBe(true)
    expect(onUnexpectedExit).not.toHaveBeenCalled()
  })

  it('stops workers that started before a later spawn fails', () => {
    const firstChild = new FakeChild()
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(firstChild)
      .mockImplementationOnce(() => {
        throw new Error('spawn configuration failed')
      })

    expect(() =>
      createWorkspaceSupervisor({
        processes: workspaceProcessConfigs({ env: {} }),
        spawnProcess,
        stdout: new PassThrough(),
        stderr: new PassThrough()
      })
    ).toThrow('spawn configuration failed')
    expect(firstChild.kill).toHaveBeenCalledWith('SIGTERM')
  })
})
