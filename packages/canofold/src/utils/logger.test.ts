import { afterEach, describe, expect, it, vi } from 'vitest'
import { logError, logInfo } from './logger'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logger', () => {
  it('applies the project prefix without discarding structured error details', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('build failed')

    logError('Static server error:', error)

    expect(consoleError).toHaveBeenCalledWith('[canofold] Static server error:', error)
  })

  it('applies the project prefix to informational messages', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    logInfo('Built dist')

    expect(consoleLog).toHaveBeenCalledWith('[canofold] Built dist')
  })
})
