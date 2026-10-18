function supportsColor(stream: NodeJS.WriteStream) {
  return Boolean(stream.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb')
}

export function formatLogMessage(
  message: string,
  level: 'info' | 'success' | 'error',
  interactive = supportsColor(level === 'error' ? process.stderr : process.stdout)
) {
  if (!interactive) return `[canofold] ${message}`
  const color = { info: 36, success: 32, error: 31 }[level]
  const label = { info: '●', success: '✓', error: '✖' }[level]
  return `\u001b[${color}m${label} canofold\u001b[0m ${message}`
}

export function logInfo(message: string) {
  console.log(formatLogMessage(message, 'info'))
}

export function logSuccess(message: string) {
  console.log(formatLogMessage(message, 'success'))
}

export function formatTerminalUrl(url: string, interactive = supportsColor(process.stdout)) {
  if (!interactive) return url
  return `\u001b]8;;${url}\u001b\\\u001b[36;4m${url}\u001b[0m\u001b]8;;\u001b\\`
}

export function logError(message: string, ...details: unknown[]) {
  console.error(formatLogMessage(message, 'error'), ...details)
}
