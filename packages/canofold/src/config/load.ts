import { randomUUID } from 'node:crypto'
import { resolve as resolveModule } from 'import-meta-resolve'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { assertRoutePath } from '../content/routes'
import { pathExists, portablePathKey } from '../utils/paths'
import { defaultConfig } from './defaults'
import { configInputSchema } from './schema'
import type { CanofoldConfig, CanofoldConfigInput } from './types'

const CONFIG_FILE_NAMES = [
  'canofold.config.ts',
  'canofold.config.mts',
  'canofold.config.cts',
  'canofold.config.js',
  'canofold.config.mjs',
  'canofold.config.cjs'
] as const

function cloneDefaultConfig(): CanofoldConfig {
  return structuredClone(defaultConfig)
}

function mergeConfig(input: CanofoldConfigInput): CanofoldConfig {
  const base = cloneDefaultConfig()
  const docsDir = input.docsDir ?? base.docsDir
  const versions = (input.versions ?? base.versions).map((item) => ({ ...item }))
  const currentDocsDir = versions[0]?.docsDir ?? docsDir
  const config: CanofoldConfig = {
    ...base,
    ...input,
    docsDir: currentDocsDir,
    styles: input.styles ? [...input.styles] : base.styles,
    themes: [...(input.themes ?? base.themes)],
    demos: {
      engine: input.demos?.engine ?? base.demos.engine,
      setup: input.demos?.setup ?? base.demos.setup
    },
    layout: {
      header: input.layout?.header ?? base.layout.header,
      sidebarWidth: input.layout?.sidebarWidth ?? base.layout.sidebarWidth,
      outlineWidth: input.layout?.outlineWidth ?? base.layout.outlineWidth
    },
    seo: {
      robots: input.seo?.robots ?? base.seo.robots
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
    branding: {
      ...base.branding,
      ...input.branding
    },
    search: {
      enabled: input.search?.enabled ?? base.search.enabled,
      provider: input.search?.provider ?? base.search.provider
    },
    checks: { rules: { ...base.checks.rules, ...input.checks?.rules } },
    extensions: (input.extensions ?? base.extensions).map((extension) => ({
      ...extension,
      ...(extension.options ? { options: structuredClone(extension.options) } : {})
    })),
    navigation: Object.fromEntries(
      Object.entries(input.navigation ?? base.navigation).map(([locale, items]) => [
        locale,
        items.map((item) => ({
          ...item,
          ...(item.activePaths ? { activePaths: [...item.activePaths] } : {})
        }))
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
  // A custom light logo without a matching dark logo should be reused in both themes,
  // not paired with Canofold's built-in dark logo.
  if (input.branding?.logo && !input.branding.logoDark) delete config.branding.logoDark
  return config
}

function assertI18nConfig(config: CanofoldConfig) {
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

function assertVersionConfig(config: CanofoldConfig) {
  const ids = config.versions.map((item) => item.id)
  const bases = config.versions.map((item) => item.base)
  if (new Set(ids.map(portablePathKey)).size !== ids.length) {
    throw new Error('versions must not contain portable-duplicate version ids')
  }
  if (new Set(bases.map(portablePathKey)).size !== bases.length) {
    throw new Error('versions must not contain duplicate bases')
  }
  for (const item of config.versions) {
    try {
      assertRoutePath(item.base)
    } catch {
      throw new Error(`Version base "${item.base}" must be a safe absolute route ending in /`)
    }
    if (!item.base.endsWith('/') || item.base.includes('//')) {
      throw new Error(`Version base "${item.base}" must be an absolute path ending in /`)
    }
  }
  const current = config.versions[0]
  if (current && current.base !== '/') {
    throw new Error('The first (current) documentation version must use base "/"')
  }
  if (current?.status === 'archived') {
    throw new Error('The first/current documentation version cannot be archived')
  }
}

function assertEffectiveInput(input: CanofoldConfigInput) {
  const themes = input.themes ?? defaultConfig.themes
  const themeIds = themes.map((theme) => theme.id)
  if (new Set(themeIds).size !== themeIds.length) {
    throw new Error('themes must not contain duplicate theme ids')
  }
  if (input.docsDir !== undefined && input.versions?.length) {
    throw new Error('docsDir cannot be combined with versions; set docsDir on each versions entry')
  }
  if (input.branding?.logoDark && !input.branding.logo) {
    throw new Error('branding.logoDark requires branding.logo')
  }
  if (
    input.branding?.logoDark &&
    !themes.some((theme) => theme.appearances.some((appearance) => appearance.colorScheme === 'dark'))
  ) {
    throw new Error('branding.logoDark requires a configured theme with a dark appearance')
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
      `Multiple Canofold configuration files found: ${matches.map((path) => path.split(/[\\/]/).at(-1)).join(', ')}`
    )
  }
  return matches[0]
}

export async function loadConfig(cwd: string): Promise<CanofoldConfig> {
  const configPath = await findConfigPath(cwd)
  if (!configPath) {
    return cloneDefaultConfig()
  }

  const temporaryRoot = join(cwd, '.canofold/tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const temporaryDirectory = await mkdtemp(join(temporaryRoot, 'config-'))
  const temporaryPath = join(temporaryDirectory, `${randomUUID()}.mjs`)
  let loaded: { default?: unknown }
  try {
    const canofoldEntry = fileURLToPath(resolveModule('canofold', import.meta.url))
    const themesEntry = fileURLToPath(resolveModule('@canofold/themes', import.meta.url))
    const result = await build({
      entryPoints: [configPath],
      absWorkingDir: cwd,
      // Resolve Canofold's public config helpers from the CLI installation. This
      // keeps config loading deterministic under strict package managers while
      // third-party theme packages continue to resolve from the user's project.
      alias: { canofold: canofoldEntry, '@canofold/themes': themesEntry },
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      // Keep official plugins package-relative. They may resolve optional
      // binaries or assets from import.meta.url and stop working when inlined.
      // Other config helpers remain bundled so reloads bypass Node's cache.
      external: ['@canofold/plugins', '@canofold/vite'],
      write: false,
      sourcemap: 'inline'
    })
    const bundled = result.outputFiles[0]
    if (!bundled) throw new Error('Failed to bundle canofold.config.ts')
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
