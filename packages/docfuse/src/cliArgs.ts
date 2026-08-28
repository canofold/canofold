export function portFromArgs(args: string[]) {
  const options = args.slice(1)
  const portIndexes = options.flatMap((value, index) => (value === '--port' ? [index] : []))
  if (portIndexes.length > 1) throw new Error('--port may only be specified once')
  const portIndex = portIndexes[0]
  if (portIndex === undefined) {
    if (options.length) throw new Error(`Unknown option: ${options[0]}`)
    return undefined
  }

  if (portIndex !== 0) throw new Error(`Unknown option: ${options[0]}`)
  const rawPort = options[portIndex + 1]
  if (!rawPort || rawPort.startsWith('-')) {
    throw new Error('Missing value for --port')
  }
  if (options.length > 2) throw new Error(`Unknown option: ${options[2]}`)
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${rawPort}`)
  }
  return port
}

export function buildOptionsFromArgs(args: string[]) {
  const options = args.slice(1)
  if (!options.length) return { noCache: false }
  if (options[0] !== '--no-cache') throw new Error(`Unknown option: ${options[0]}`)
  if (options.length > 1) throw new Error(`Unknown option: ${options[1]}`)
  return { noCache: true }
}

export interface InitCliOptions {
  targetDir?: string
  locale?: string
  locales?: string[]
  docsDir?: string
}

function canonicalLocale(locale: string) {
  try {
    const canonical = Intl.getCanonicalLocales(locale)[0]
    if (!canonical) throw new Error('Missing canonical locale')
    return canonical
  } catch {
    throw new Error(`Invalid locale: ${locale}`)
  }
}

export function initOptionsFromArgs(args: string[]): InitCliOptions {
  const result: InitCliOptions = {}
  const options = args.slice(1)
  const seenOptions = new Set<string>()

  for (let index = 0; index < options.length; index += 1) {
    const value = options[index]
    if (!value) continue
    if (!value.startsWith('-')) {
      if (result.targetDir) throw new Error(`Unknown option: ${value}`)
      result.targetDir = value
      continue
    }

    if (value !== '--locale' && value !== '--locales' && value !== '--docs-dir') {
      throw new Error(`Unknown option: ${value}`)
    }
    if (seenOptions.has(value)) throw new Error(`${value} may only be specified once`)
    seenOptions.add(value)
    const optionValue = options[index + 1]
    if (!optionValue || optionValue.startsWith('-')) {
      throw new Error(`Missing value for ${value}`)
    }
    index += 1

    if (value === '--locale') result.locale = optionValue
    if (value === '--locales') {
      const locales = optionValue.split(',').map((locale) => locale.trim())
      if (locales.some((locale) => !locale)) {
        throw new Error('--locales must be a comma-separated list of locale identifiers')
      }
      result.locales = locales
    }
    if (value === '--docs-dir') result.docsDir = optionValue
  }

  if (result.locale) result.locale = canonicalLocale(result.locale)
  if (result.locales) {
    result.locales = result.locales.map(canonicalLocale)
    if (new Set(result.locales).size !== result.locales.length) {
      throw new Error('--locales must not contain duplicate locales')
    }
    if (result.locale && !result.locales.includes(result.locale)) {
      throw new Error(`--locale ${result.locale} must be included in --locales`)
    }
    result.locale ??= result.locales[0]
  }

  return result
}
