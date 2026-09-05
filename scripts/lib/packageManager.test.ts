import { describe, expect, it } from 'vitest'
import { packageManagerInvocationFor } from './packageManager.mjs'

describe('packageManagerInvocationFor', () => {
  it('runs the Windows command shim through cmd.exe', () => {
    expect(packageManagerInvocationFor(['pack'], 'win32')).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', 'pack']
    })

    expect(packageManagerInvocationFor(['pack'], 'win32', 'C:\\Windows\\System32\\cmd.exe')).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', 'pack']
    })
  })

  it('runs pnpm directly on Unix platforms', () => {
    expect(packageManagerInvocationFor(['pack'], 'darwin')).toEqual({
      command: 'pnpm',
      args: ['pack']
    })
    expect(packageManagerInvocationFor(['pack'], 'linux')).toEqual({
      command: 'pnpm',
      args: ['pack']
    })
  })
})
