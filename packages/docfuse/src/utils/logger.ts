export function logInfo(message: string) {
  console.log(`[docfuse] ${message}`)
}

export function logError(message: string, ...details: unknown[]) {
  console.error(`[docfuse] ${message}`, ...details)
}
