import { mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import type { CanofoldConfig } from '../config/types'
import { isMarkdownPath, stripMarkdownExtension } from '../content/fileKinds'
import { logInfo } from '../utils/logger'
import { createInitFiles } from '../templates/initScaffold'
import { assertProjectPath, pathExists, resolveProjectPath } from '../utils/paths'

export interface InitOptions {
  cwd: string
  targetDir?: string
  locale?: string
  locales?: string[]
  docsDir?: string
  localePrompt?: () => Promise<string[]>
}

interface PlannedFile {
  relativePath: string
  content: string
  fullPath: string
}

interface InitPlan {
  mode: 'create' | 'adopt' | 'configured'
  createFiles: PlannedFile[]
  keepFiles: string[]
  warnings: string[]
}

type InitFileWriter = (path: string, content: string, options: { flag: 'wx' }) => Promise<void>

interface InitRuntime {
  writeFile?: InitFileWriter
}

interface LocaleReadline {
  question(prompt: string): Promise<string>
  close(): void
}

async function listMarkdownFiles(directory: string, prefix = ''): Promise<string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const files: string[] = []
  for (const entry of entries) {
    const relativePath = prefix ? join(prefix, entry.name) : entry.name
    if (entry.isFile() && isMarkdownPath(entry.name)) files.push(relativePath)
    if (entry.isDirectory() && (prefix || entry.name !== 'public')) {
      for (const file of await listMarkdownFiles(join(directory, entry.name), relativePath)) {
        files.push(file)
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right))
}

function validateLocaleSelection(defaultLocale: string, locales: string[]) {
  for (const locale of locales) {
    try {
      Intl.getCanonicalLocales(locale)
    } catch {
      throw new Error(`Invalid locale: ${locale}`)
    }
  }
  if (new Set(locales.map((locale) => locale.toLowerCase())).size !== locales.length) {
    throw new Error('Locales must not contain duplicates')
  }
  if (!locales.some((locale) => locale.toLowerCase() === defaultLocale.toLowerCase())) {
    throw new Error(`Default locale ${defaultLocale} must be included in locales`)
  }
}

export async function promptForLocales(
  readline: LocaleReadline = createInterface({ input: process.stdin, output: process.stdout })
) {
  try {
    const answer = await readline.question(
      'Existing documents found. Enter their locale, or a comma-separated locale list (default: zh): '
    )
    const locales = (answer.trim() || 'zh').split(',').map((locale) => locale.trim())
    if (locales.some((locale) => !locale)) {
      throw new Error('Locales must be a comma-separated list of locale identifiers')
    }
    return locales
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ABORT_ERR') {
      throw new Error('Canofold initialization cancelled')
    }
    throw error
  } finally {
    readline.close()
  }
}

function sameLocales(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((locale, index) => locale.toLowerCase() === right[index]?.toLowerCase())
  )
}

function assertOptionsMatchConfig(options: InitOptions, config: CanofoldConfig) {
  if (options.docsDir && options.docsDir !== config.docsDir) {
    throw new Error(`--docs-dir ${options.docsDir} conflicts with configured docsDir ${config.docsDir}`)
  }
  if (options.locale && options.locale.toLowerCase() !== config.i18n.defaultLocale.toLowerCase()) {
    throw new Error(
      `--locale ${options.locale} conflicts with configured defaultLocale ${config.i18n.defaultLocale}`
    )
  }
  if (options.locales && !sameLocales(options.locales, config.i18n.locales)) {
    throw new Error(
      `--locales ${options.locales.join(',')} conflicts with configured locales ${config.i18n.locales.join(',')}`
    )
  }
}

function portablePageKey(path: string) {
  return stripMarkdownExtension(path.replace(/\\/g, '/')).normalize('NFC').toLocaleLowerCase('en-US')
}

function existingContentWarnings(paths: string[], defaultLocale: string, docsDir: string) {
  if (!paths.length) return []
  const warnings: string[] = []
  const normalized = paths.map((path) => path.replace(/\\/g, '/'))
  const displayPath = (path: string) => (docsDir === '.' ? path : `${docsDir.replace(/\\/g, '/')}/${path}`)
  const defaultLocaleKey = defaultLocale.normalize('NFC').toLocaleLowerCase('en-US')
  const hasHome = normalized.some((path) => {
    const key = portablePageKey(path)
    return key === 'index' || key === `${defaultLocaleKey}/index`
  })
  if (!hasHome) {
    warnings.push(`no default-language index.md or index.mdx was found in ${docsDir}`)
  }

  const rootPageKeys = new Map<string, string>()
  for (const path of normalized) {
    if (!path.startsWith(`${defaultLocale}/`)) rootPageKeys.set(portablePageKey(path), path)
  }
  for (const path of normalized) {
    if (!path.startsWith(`${defaultLocale}/`)) continue
    const counterpart = path.slice(defaultLocale.length + 1)
    const rootPath = rootPageKeys.get(portablePageKey(counterpart))
    if (rootPath) {
      warnings.push(
        `${displayPath(rootPath)} and ${displayPath(path)} map to the same default-language page; keep only one source`
      )
    }
  }
  return warnings
}

async function createMissingDirectoryChain(directory: string, createdDirectories: string[]) {
  const missing: string[] = []
  let current = directory
  while (!(await pathExists(current))) {
    missing.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  for (const path of missing.reverse()) {
    try {
      await mkdir(path)
      createdDirectories.push(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}

export async function runInit(options: InitOptions, runtime: InitRuntime = {}) {
  const root = options.targetDir ? join(options.cwd, options.targetDir) : options.cwd
  const { findConfigPath, loadConfig } = await import('../config/load')
  const hasExistingConfig = Boolean(await findConfigPath(root))
  const existingConfig = hasExistingConfig ? await loadConfig(root) : undefined
  if (existingConfig) assertOptionsMatchConfig(options, existingConfig)
  const docsDir = existingConfig?.docsDir ?? options.docsDir ?? 'docs'
  if (isAbsolute(docsDir)) throw new Error('docsDir must be a relative path')
  const docsRoot = resolveProjectPath(root, docsDir, 'docsDir')
  await assertProjectPath(root, docsRoot, 'docsDir')
  const existingDocuments = await listMarkdownFiles(docsRoot)
  const hasExistingDocuments = existingDocuments.length > 0
  let locales = options.locales
  if (hasExistingDocuments && !hasExistingConfig && !options.locale && !locales) {
    const localePrompt =
      options.localePrompt ?? (process.stdin.isTTY && process.stdout.isTTY ? promptForLocales : undefined)
    if (!localePrompt) {
      const examplePath = existingDocuments[0] ?? ''
      throw new Error(
        `Found ${existingDocuments.length} existing Markdown file(s) in "${docsDir}" (e.g. "${examplePath}"), ` +
          `but cannot determine their language in a non-interactive environment. ` +
          `Specify the locale explicitly: canofold init --locale <locale> (e.g. --locale zh)`
      )
    }
    locales = await localePrompt()
  }
  const defaultLocale = existingConfig?.i18n.defaultLocale ?? options.locale ?? locales?.[0] ?? 'zh'
  locales = existingConfig?.i18n.locales ?? locales ?? [defaultLocale]
  validateLocaleSelection(defaultLocale, locales)
  const files = createInitFiles({
    docsDir,
    defaultLocale,
    locales,
    includeContent: !hasExistingDocuments,
    includeConfig: !hasExistingConfig
  })
  const createFiles: PlannedFile[] = []
  const keepFiles: string[] = []
  const warnings = existingContentWarnings(existingDocuments, defaultLocale, docsDir)
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(root, relativePath)
    try {
      const existing = await readFile(fullPath, 'utf8')
      keepFiles.push(relativePath)
      if (existing !== content) warnings.push(`${relativePath} already exists with different content`)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EISDIR') {
        throw new Error(`Cannot create ${relativePath} because a directory exists at that path`)
      }
      if (code !== 'ENOENT') throw error
      createFiles.push({ relativePath, content, fullPath })
    }
  }
  const plan: InitPlan = {
    mode: hasExistingConfig ? 'configured' : hasExistingDocuments ? 'adopt' : 'create',
    createFiles,
    keepFiles,
    warnings
  }

  if (!plan.createFiles.length) {
    for (const warning of plan.warnings) logInfo(`Warning: ${warning}`)
    logInfo(`Canofold is already initialized in ${root}`)
    return
  }

  const createdFiles: string[] = []
  const writeInitFile: InitFileWriter =
    runtime.writeFile ?? ((path, content, writeOptions) => writeFile(path, content, writeOptions))
  const directories = [...new Set(plan.createFiles.map((target) => dirname(target.fullPath)))].sort(
    (a, b) => a.length - b.length
  )
  const createdDirectories: string[] = []
  try {
    for (const directory of directories) {
      await createMissingDirectoryChain(directory, createdDirectories)
    }

    for (const target of plan.createFiles) {
      await writeInitFile(target.fullPath, target.content, { flag: 'wx' })
      createdFiles.push(target.fullPath)
    }
  } catch (error) {
    await Promise.all(createdFiles.map((file) => rm(file, { force: true })))
    for (const directory of createdDirectories.sort((a, b) => b.length - a.length)) {
      try {
        await rmdir(directory)
      } catch {
        // Keep pre-existing or non-empty parent directories intact.
      }
    }
    throw error
  }

  for (const target of plan.createFiles) logInfo(`Created ${target.relativePath}`)
  for (const kept of plan.keepFiles) logInfo(`Kept existing ${kept}`)
  for (const warning of plan.warnings) logInfo(`Warning: ${warning}`)
  if (plan.mode === 'adopt') {
    const noun = existingDocuments.length === 1 ? 'document' : 'documents'
    logInfo(`Adopted ${existingDocuments.length} existing ${noun} in ${root}`)
    logInfo(`Kept ${existingDocuments.length} existing ${noun} unchanged`)
    logInfo('Next: canofold check')
  } else if (plan.mode === 'configured') {
    logInfo(`Created missing documentation files in ${root}`)
    logInfo('Next: canofold dev')
  } else {
    logInfo(`Created Canofold docs in ${root}`)
    logInfo('Next: canofold dev')
  }
  logInfo('Add .canofold/ to .gitignore if this directory is versioned.')
}
