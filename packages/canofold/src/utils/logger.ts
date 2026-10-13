export function logInfo(message: string) {
  console.log(`[canofold] ${message}`)
}

export function formatTerminalUrl(
  url: string,
  interactive = Boolean(
    process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'
  )
) {
  if (!interactive) return url
  return `\u001b]8;;${url}\u001b\\\u001b[36;4m${url}\u001b[0m\u001b]8;;\u001b\\`
}

export function logError(message: string, ...details: unknown[]) {
  console.error(`[canofold] ${message}`, ...details)
}
