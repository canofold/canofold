import type { MarkdownPlugin, MarkdownPluginContext } from './types'
import { stableJson } from './stableJson'

const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const JAVASCRIPT_EXPORT_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function assertPluginName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !PLUGIN_NAME_PATTERN.test(name)) {
    throw new Error(
      `Markdown plugin names must be lowercase kebab-case slugs (e.g. "external-links"), got ${JSON.stringify(name)}`
    )
  }
}

function assertPluginCacheKey(plugin: MarkdownPlugin) {
  if (plugin.cacheKey !== undefined && stableJson(plugin.cacheKey) === undefined) {
    throw new Error(`Markdown plugin "${plugin.name}" cacheKey must be JSON-serializable`)
  }
}

function assertPluginBrowserCompiler(plugin: MarkdownPlugin) {
  const browserCompiler = plugin.browserCompiler
  if (!browserCompiler) return
  if (typeof browserCompiler.module !== 'string' || browserCompiler.module.trim() === '') {
    throw new Error(`Markdown plugin "${plugin.name}" browserCompiler.module must be a non-empty string`)
  }
  if (
    typeof browserCompiler.exportName !== 'string' ||
    !JAVASCRIPT_EXPORT_PATTERN.test(browserCompiler.exportName)
  ) {
    throw new Error(
      `Markdown plugin "${plugin.name}" browserCompiler.exportName must be a named JavaScript export`
    )
  }
  if (browserCompiler.options !== undefined && stableJson(browserCompiler.options) === undefined) {
    throw new Error(`Markdown plugin "${plugin.name}" browserCompiler.options must be JSON-serializable`)
  }
}

function normalizedDirectiveNames(plugin: MarkdownPlugin) {
  return (plugin.directiveNames ?? []).map((name) => {
    const normalized = name.trim().toLowerCase()
    if (name !== normalized || !PLUGIN_NAME_PATTERN.test(normalized)) {
      throw new Error(
        `Markdown plugin "${plugin.name}" directive names must be lowercase kebab-case slugs, got ${JSON.stringify(name)}`
      )
    }
    return normalized
  })
}

/** Validate plugin names and reject duplicates before the plan consumes them. */
export function normalizeMarkdownPlugins(plugins: readonly MarkdownPlugin[] = []): readonly MarkdownPlugin[] {
  const seen = new Set<string>()
  const fenceOwners = new Map<string, string>()
  const directiveOwners = new Map<string, string>()
  for (const plugin of plugins) {
    assertPluginName(plugin?.name)
    assertPluginCacheKey(plugin)
    assertPluginBrowserCompiler(plugin)
    if (seen.has(plugin.name)) {
      throw new Error(`Markdown plugins must have unique names, got "${plugin.name}" twice`)
    }
    seen.add(plugin.name)
    for (const language of plugin.fenceLanguages ?? []) {
      const normalized = language.trim().toLowerCase()
      if (!normalized) continue
      const owner = fenceOwners.get(normalized)
      if (owner && owner !== plugin.name) {
        throw new Error(`Fence language "${normalized}" is owned by both "${owner}" and "${plugin.name}"`)
      }
      fenceOwners.set(normalized, plugin.name)
    }
    for (const name of normalizedDirectiveNames(plugin)) {
      const owner = directiveOwners.get(name)
      if (owner && owner !== plugin.name) {
        throw new Error(`Directive "${name}" is owned by both "${owner}" and "${plugin.name}"`)
      }
      directiveOwners.set(name, plugin.name)
    }
  }
  return plugins
}

/**
 * Serializable identity used by render caches and build fingerprints. Plugin
 * functions cannot be fingerprinted, so `name`, `version` and `cacheKey` form
 * the invalidation contract: bump `version` when the transform changes and
 * derive `cacheKey` from resolved options.
 */
export function markdownPluginsIdentity(plugins: readonly MarkdownPlugin[] = []) {
  return plugins.map((plugin) => ({
    name: plugin.name,
    version: plugin.version ?? '',
    cacheKey: plugin.cacheKey ?? null
  }))
}

/** Typed identity helper that validates the plugin shape eagerly. */
export function defineMarkdownPlugin(plugin: MarkdownPlugin): MarkdownPlugin {
  assertPluginName(plugin?.name)
  assertPluginCacheKey(plugin)
  assertPluginBrowserCompiler(plugin)
  normalizedDirectiveNames(plugin)
  return plugin
}

/** Resolve the plugins that apply to one source document. */
export function activeMarkdownPlugins(
  plugins: readonly MarkdownPlugin[],
  context: MarkdownPluginContext
): readonly MarkdownPlugin[] {
  return plugins.filter((plugin) => plugin.appliesTo?.(context) !== false)
}

/** Collect normalized fenced-code labels owned by the active plugins. */
export function markdownPluginFenceLanguages(plugins: readonly MarkdownPlugin[]): ReadonlySet<string> {
  const languages = new Set<string>()
  for (const plugin of plugins) {
    for (const language of plugin.fenceLanguages ?? []) {
      const normalized = language.trim().toLowerCase()
      if (normalized) languages.add(normalized)
    }
  }
  return languages
}

/** Collect normalized directive names owned by the active plugins. */
export function markdownPluginDirectiveNames(plugins: readonly MarkdownPlugin[]): ReadonlySet<string> {
  return new Set(plugins.flatMap((plugin) => normalizedDirectiveNames(plugin)))
}
