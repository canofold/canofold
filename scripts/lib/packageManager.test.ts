import { describe, expect, it } from 'vitest'
import { packageManagerCommandFor } from './packageManager.mjs'

describe('packageManagerCommandFor', () => {
  it('uses the Windows command shim only on win32', () => {
    expect(packageManagerCommandFor('win32')).toBe('pnpm.cmd')
    expect(packageManagerCommandFor('darwin')).toBe('pnpm')
    expect(packageManagerCommandFor('linux')).toBe('pnpm')
  })
})
