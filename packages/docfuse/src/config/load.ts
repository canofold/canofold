import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { assertRoutePath } from '../content/routes'
import { pathExists, portablePathKey } from '../utils/paths'
import { defaultConfig } from './defaults'
import { configInputSchema } from './schema'
import type { DocfuseConfig, DocfuseConfigInput } from './types'

const CONFIG_FILE_NAMES = [
  'docfuse.config.ts',
  'docfuse.config.mts',
  'docfuse.config.cts',
  'docfuse.config.js',
  'docfuse.config.mjs',
  'docfuse.config.cjs'
] as const

function cloneDefaultConfig(): DocfuseConfig {
  return structuredClone(defaultConfig)
}

function mergeConfig(input: DocfuseConfigInput): DocfuseConfig {
  const base = cloneDefaultConfig()
  const docsDir = input.docsDir ?? base.docsDir
  const versions = input.versions
    ? {
        current: input.versions.current,
        items: input.versions.items.map((item) => ({ ...item }))
      }
    : {
        current: 'current',
        items: [{ id: 'current', label: 'Current', docsDir, base: '/' }]
      }
  const currentDocsDir = versions.items.find((item) => item.id === versions.current)?.docsDir ?? docsDir
  return {
    ...base,
    ...input,
    docsDir: currentDocsDir,
    styles: input.styles ? [...input.styles] : base.styles,
    layout: {
      header: input.layout?.header ?? base.layout.header
    },
    markdown: {
      html: input.markdown?.html ?? base.markdown.html,
      code: {
        ...base.markdown.code,
        ...input.markdown?.code,
        themes: {
          ...base.markdown.code.themes,
          ...input.markdown?.code?.themes
        }
      },
      features: {
        ...base.markdown.features,
        ...input.markdown?.features
      },
      labels: {
        ...base.markdown.labels,
        ...input.markdown?.labels
      },
      // Plugin entries hold functions; pass them through untouched.
      plugins: input.markdown?.plugins ? [...input.markdown.plugins] : base.markdown.plugins
    },
    theme: {
      ...base.theme,
      ...input.theme,
      tokens: {
        colors: {
          light: {
            ...base.theme.tokens.colors?.light,
            ...input.theme?.tokens?.colors?.light
          },
          dark: {
            ...base.theme.tokens.colors?.dark,
            ...input.theme?.tokens?.colors?.dark
          }
        },
        typography: { ...base.theme.tokens.typography, ...input.theme?.tokens?.typography },
        layout: { ...base.theme.tokens.layout, ...input.theme?.tokens?.layout },
        geometry: { ...base.theme.tokens.geometry, ...input.theme?.tokens?.geometry },
        motion: { ...base.theme.tokens.motion, ...input.theme?.tokens?.motion }
      }
    },
    search: {
      enabled: input.search?.enabled ?? base.search.enabled,
      provider: input.search?.provider ?? base.search.provider
    },
    extensions: (input.extensions ?? base.extensions).map((extension) => ({
      ...extension,
      ...(extension.options ? { options: structuredClone(extension.options) } : {})
    })),
    navigation: Object.fromEntries(
      Object.entries(input.navigation ?? base.navigation).map(([locale, items]) => [
        locale,
        items.map((item) => ({ ...item }))
      ])
    ),
    versions,
    redirects: { ...base.redirects, ...input.redirects },
    ...(input.advertising ? { advertising: { ...input.advertising } } : {}),
    i18n: {
      ...base.i18n,
      ...input.i18n,
      locales: input.i18n?.locales ? [...input.i18n.locales] : base.i18n.locales,
      localeNames: {
        ...base.i18n.localeNames,
        ...input.i18n?.localeNames
      },
      messages: {
        ...base.i18n.messages,
        ...input.i18n?.messages
      }
    },
    ai: { ...base.ai, ...input.ai }
  }
}

function assertI18nConfig(config: DocfuseConfig) {
  const { defaultLocale, locales, localeNames = {}, messages = {} } = config.i18n
  if (!locales.includes(defaultLocale)) {
    throw new Error(`i18n.defaultLocale "${defaultLocale}" must be included in i18n.locales`)
  }
  if (new Set(locales.map((locale) => locale.toLowerCase())).size !== locales.length) {
    throw new Error('i18n.locales must not contain duplicate locales')
  }
  for (const locale of locales) {
    try {
      Intl.getCanonicalLocales(locale)
    } catch {
      throw new Error(`Invalid locale identifier in i18n.locales: "${locale}"`)
    }
  }
  const localeSet = new Set(locales)
  for (const key of [...Object.keys(localeNames), ...Object.keys(messages)]) {
    if (!localeSet.has(key)) {
      throw new Error(`i18n resource key "${key}" must be included in i18n.locales`)
    }
  }
  for (const locale of Object.keys(config.navigation)) {
    if (!localeSet.has(locale)) {
      throw new Error(`navigation key "${locale}" must be included in i18n.locales`)
    }
  }
}

function assertVersionConfig(config: DocfuseConfig) {
  const ids = config.versions.items.map((item) => item.id)
  const bases = config.versions.items.map((item) => item.base)
  if (!ids.includes(config.versions.current)) {
    throw new Error(`versions.current "${config.versions.current}" must match a versions.items id`)
  }
  if (new Set(ids.map(portablePathKey)).size !== ids.length) {
    throw new Error('versions.items must not contain portable-duplicate version ids')
  }
  if (new Set(bases.map(portablePathKey)).size !== bases.length) {
    throw new Error('versions.items must not contain duplicate bases')
  }
  for (const item of config.versions.items) {
    try {
      assertRoutePath(item.base)
    } catch {
      throw new Error(`Version base "${item.base}" must be a safe absolute route ending in /`)
    }
    if (!item.base.endsWith('/') || item.base.includes('//')) {
      throw new Error(`Version base "${item.base}" must be an absolute path ending in /`)
    }
  }
  const current = config.versions.items.find((item) => item.id === config.versions.current)
  if (current?.base !== '/') {
    throw new Error('The current documentation version must use base "/"')
  }
}

function assertEffectiveInput(input: DocfuseConfigInput) {
  if (input.docsDir !== undefined && input.versions !== undefined) {
    throw new Error('docsDir cannot be combined with versions; set docsDir on each versions.items entry')
  }
  if (input.theme?.logoDark && !input.theme.logo) {
    throw new Error('theme.logoDark requires theme.logo')
  }
  if (input.theme?.logoDark && input.theme.darkMode !== true) {
    throw new Error('theme.logoDark requires theme.darkMode: true')
  }
}

export async function findConfigPath(cwd: string) {
  const matches: string[] = []
  for (const name of CONFIG_FILE_NAMES) {
    const path = join(cwd, name)
    if (await pathExists(path)) matches.push(path)
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple Docfuse configuration files found: ${matches.map((path) => path.split(/[\\/]/).at(-1)).join(', ')}`
    )
  }
  return matches[0]
}

export async function loadConfig(cwd: string): Promise<DocfuseConfig> {
  const configPath = await findConfigPath(cwd)
  if (!configPath) {
    return cloneDefaultConfig()
  }

  const temporaryRoot = join(cwd, '.docfuse/tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const temporaryDirectory = await mkdtemp(join(temporaryRoot, 'config-'))
  const temporaryPath = join(temporaryDirectory, `${randomUUID()}.mjs`)
  let loaded: { default?: unknown }
  try {
    let docfuseEntry: string
    try {
      docfuseEntry = fileURLToPath(import.meta.resolve('docfuse'))
    } catch {
      // Vitest's module runner does not implement import.meta.resolve. Its
      // source execution path can be bundled directly by esbuild instead.
      docfuseEntry = fileURLToPath(new URL('../index.ts', import.meta.url))
    }
    const result = await build({
      entryPoints: [configPath],
      absWorkingDir: cwd,
      alias: { docfuse: docfuseEntry },
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      // Keep official plugins package-relative. They may resolve optional
      // binaries or assets from import.meta.url and stop working when inlined.
      // Other config helpers remain bundled so reloads bypass Node's cache.
      external: ['@docfuse/plugins'],
      write: false,
      sourcemap: 'inline'
    })
    const bundled = result.outputFiles[0]
    if (!bundled) throw new Error('Failed to bundle docfuse.config.ts')
    await writeFile(temporaryPath, bundled.contents)
    loaded = await import(`${pathToFileURL(temporaryPath).href}?t=${Date.now()}`)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
  const parsed = configInputSchema.parse(loaded.default ?? {})
  assertEffectiveInput(parsed)
  const config = mergeConfig(parsed)
  assertI18nConfig(config)
  assertVersionConfig(config)
  return config
}
