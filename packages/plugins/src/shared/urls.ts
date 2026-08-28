export function hostnameOf(href: string) {
  try {
    return new URL(href).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

export function isInternalHost(host: string, internalHosts: readonly string[]) {
  return internalHosts.some((internal) => host === internal || host.endsWith(`.${internal}`))
}
