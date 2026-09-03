export function logInfo(message: string) {
  console.log(`[canofold] ${message}`)
}

export function logError(message: string, ...details: unknown[]) {
  console.error(`[canofold] ${message}`, ...details)
}
