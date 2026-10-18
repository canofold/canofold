import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatLogMessage, formatTerminalUrl, logError, logInfo } from './logger'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logger', () => {
  it('distinguishes levels on a terminal while keeping redirected output plain', () => {
    expect(formatLogMessage('Ready', 'success', false)).toBe('[canofold] Ready')
    expect(formatLogMessage('Ready', 'success', true)).toContain('\u001b[32m')
    expect(formatLogMessage('Failed', 'error', true)).toContain('\u001b[31m')
    expect(formatLogMessage('Starting', 'info', true)).toContain('\u001b[36m')
    vi.stubEnv('NO_COLOR', '')
    expect(formatLogMessage('Ready', 'success')).not.toContain('\u001b')
    vi.unstubAllEnvs()
  })
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

  it('makes an interactive local URL visually distinct and clickable without polluting piped logs', () => {
    const url = 'http://127.0.0.1:3333/'

    expect(formatTerminalUrl(url, false)).toBe(url)
    expect(formatTerminalUrl(url, true)).toBe(
      `\u001b]8;;${url}\u001b\\\u001b[36;4m${url}\u001b[0m\u001b]8;;\u001b\\`
    )
  })
})
