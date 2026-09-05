import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { fingerprint, fingerprintBytes } from '../build/fingerprint'
import type { CanofoldExtensionDescriptor } from '../config/types'
import type { DocPage } from '../content/types'
import { canofoldVersion } from '../version'
import { assertProjectPath, pathExists, portablePathKey, resolveOutputPath } from '../utils/paths'
import {
  CANOFOLD_EXTENSION_API_VERSION,
  type CanofoldExtension,
  type CanofoldExtensionFactory,
  type CanofoldExtensionPage,
  type CanofoldExtensionPagePatch,
  type CanofoldExtensionSourceContext
} from './types'

const allowedDefinitionKeys = new Set([
  'apiVersion',
  'name',
  'outputs',
  'transformSource',
  'extendPage',
  'generate'
])
const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb']

interface LoadedExtension {
  definition: CanofoldExtension
  fingerprint: string
  declaredOutputs: Set<string>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function extensionPage(page: DocPage): CanofoldExtensionPage {
  return {
    sourceRelativePath: page.sourceRelativePath,
    relativePath: page.relativePath,
    version: page.version,
    locale: page.locale,
    routePath: page.routePath,
    title: page.title,
    description: page.description,
    status: page.status,
    search: page.search,
    ai: page.ai,
    body: page.body,
    searchText: page.searchText,
    frontmatter: structuredClone(page.frontmatter)
  }
}

function normalizeDeclaredOutput(name: string, path: string) {
  if (!path || path.includes('\\') || path.startsWith('/') || path !== posix.normalize(path)) {
    throw new Error(`Extension "${name}" output must be a normalized relative POSIX path: "${path}"`)
  }
  if (path.split('/').some((segment) => segment === '.' || segment === '..' || !segment)) {
    throw new Error(`Extension "${name}" output must not contain empty, . or .. segments: "${path}"`)
  }
  return path
}

function assertDefinition(value: unknown, descriptor: CanofoldExtensionDescriptor): CanofoldExtension {
  if (!value || typeof value !== 'object') {
    throw new Error(`Extension ${descriptor.resolve} must export an extension object or factory`)
  }
  const definition = value as Partial<CanofoldExtension> & Record<string, unknown>
  const unknownKey = Object.keys(definition).find((key) => !allowedDefinitionKeys.has(key))
  if (unknownKey) throw new Error(`Extension ${descriptor.resolve} has unknown key "${unknownKey}"`)
  if (definition.apiVersion !== CANOFOLD_EXTENSION_API_VERSION) {
    throw new Error(
      `Extension ${descriptor.resolve} uses unsupported apiVersion ${String(definition.apiVersion)}; expected ${CANOFOLD_EXTENSION_API_VERSION}`
    )
  }
  if (typeof definition.name !== 'string' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(definition.name)) {
    throw new Error(`Extension ${descriptor.resolve} name must be a lowercase portable slug`)
  }
  for (const hook of ['transformSource', 'extendPage', 'generate'] as const) {
    if (definition[hook] !== undefined && typeof definition[hook] !== 'function') {
      throw new Error(`Extension "${definition.name}" hook ${hook} must be a function`)
    }
  }
  if (definition.outputs !== undefined && !Array.isArray(definition.outputs)) {
    throw new Error(`Extension "${definition.name}" outputs must be an array`)
  }
  if (definition.generate && !definition.outputs?.length) {
    throw new Error(`Extension "${definition.name}" with generate() must declare outputs`)
  }
  if (!definition.generate && definition.outputs?.length) {
    throw new Error(`Extension "${definition.name}" declares outputs without generate()`)
  }
  return definition as CanofoldExtension
}

function assertPagePatch(name: string, patch: unknown): CanofoldExtensionPagePatch {
  if (patch === undefined) return {}
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error(`Extension "${name}" extendPage() must return an object or undefined`)
  }
  const allowed = new Set(['title', 'description', 'searchText', 'search', 'ai'])
  const unknownKey = Object.keys(patch).find((key) => !allowed.has(key))
  if (unknownKey) throw new Error(`Extension "${name}" extendPage() returned unknown key "${unknownKey}"`)
  const typed = patch as Record<string, unknown>
  for (const field of ['title', 'description', 'searchText']) {
    if (typed[field] !== undefined && typeof typed[field] !== 'string') {
      throw new Error(`Extension "${name}" extendPage() field ${field} must be a string`)
    }
  }
  for (const field of ['search', 'ai']) {
    if (typed[field] !== undefined && typeof typed[field] !== 'boolean') {
      throw new Error(`Extension "${name}" extendPage() field ${field} must be a boolean`)
    }
  }
  return patch as CanofoldExtensionPagePatch
}

async function lockfileFingerprint(cwd: string) {
  const entries: Array<{ path: string; fingerprint: string }> = []
  for (const name of lockfiles) {
    const path = join(cwd, name)
    if (await pathExists(path))
      entries.push({ path: name, fingerprint: fingerprintBytes(await readFile(path)) })
  }
  return fingerprint(entries)
}

async function loadOneExtension(
  cwd: string,
  temporaryRoot: string,
  descriptor: CanofoldExtensionDescriptor
): Promise<LoadedExtension> {
  const entryPath = resolve(cwd, descriptor.resolve)
  await assertProjectPath(cwd, entryPath, `extension ${descriptor.resolve}`)
  if (!(await pathExists(entryPath))) throw new Error(`Extension module not found: ${descriptor.resolve}`)
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    write: false,
    sourcemap: 'inline',
    plugins: [
      {
        name: 'canofold-extension-api',
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /^canofold$/ }, () => ({
            path: 'canofold-extension-api',
            namespace: 'canofold-extension-api'
          }))
          pluginBuild.onLoad({ filter: /.*/, namespace: 'canofold-extension-api' }, () => ({
            loader: 'js',
            contents: `
              export const CANOFOLD_EXTENSION_API_VERSION = ${JSON.stringify(CANOFOLD_EXTENSION_API_VERSION)}
              export const canofoldVersion = ${JSON.stringify(canofoldVersion)}
              export const defineExtension = (factory) => factory
            `
          }))
        }
      }
    ]
  })
  const bundled = result.outputFiles[0]
  if (!bundled) throw new Error(`Failed to bundle extension ${descriptor.resolve}`)
  await mkdir(temporaryRoot, { recursive: true })
  const temporaryPath = join(temporaryRoot, `extension-${randomUUID()}.mjs`)
  await writeFile(temporaryPath, bundled.contents)
  try {
    const module = (await import(`${pathToFileURL(temporaryPath).href}?t=${Date.now()}`)) as {
      default?: unknown
    }
    const exported = module.default
    const value =
      typeof exported === 'function'
        ? await (exported as CanofoldExtensionFactory)(structuredClone(descriptor.options ?? {}))
        : exported
    const definition = assertDefinition(value, descriptor)
    const outputs = (definition.outputs ?? []).map((path) => normalizeDeclaredOutput(definition.name, path))
    if (new Set(outputs.map(portablePathKey)).size !== outputs.length) {
      throw new Error(`Extension "${definition.name}" declares duplicate portable output paths`)
    }
    return {
      definition,
      declaredOutputs: new Set(outputs),
      fingerprint: fingerprint({
        descriptor,
        bundle: fingerprintBytes(bundled.contents)
      })
    }
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export interface ExtensionHost {
  readonly fingerprint: string
  readonly publicOutputPaths: readonly string[]
  transformSource(context: CanofoldExtensionSourceContext): Promise<string>
  extendPage(page: DocPage): Promise<DocPage>
  generate(outputRoot: string, pages: readonly DocPage[]): Promise<void>
}

export async function loadExtensionHost(
  cwd: string,
  temporaryRoot: string,
  descriptors: readonly CanofoldExtensionDescriptor[]
): Promise<ExtensionHost> {
  const loaded: LoadedExtension[] = []
  for (const descriptor of descriptors) {
    try {
      loaded.push(await loadOneExtension(cwd, temporaryRoot, descriptor))
    } catch (error) {
      throw new Error(`Failed to load extension ${descriptor.resolve}: ${errorMessage(error)}`, {
        cause: error
      })
    }
  }
  const names = new Set<string>()
  for (const extension of loaded) {
    if (names.has(extension.definition.name)) {
      throw new Error(`Duplicate extension name "${extension.definition.name}"`)
    }
    names.add(extension.definition.name)
  }
  const dependencyFingerprint = loaded.length
    ? await lockfileFingerprint(cwd)
    : fingerprint({ lockfiles: [] })
  const publicOutputPaths = loaded.flatMap(({ definition, declaredOutputs }) =>
    [...declaredOutputs].map(
      (path) => `/extensions/${definition.name}/${path.split('/').map(encodeURIComponent).join('/')}`
    )
  )

  return {
    fingerprint: fingerprint({
      apiVersion: CANOFOLD_EXTENSION_API_VERSION,
      dependencyFingerprint,
      extensions: loaded.map((extension) => ({
        name: extension.definition.name,
        fingerprint: extension.fingerprint
      }))
    }),
    publicOutputPaths,
    async transformSource(initialContext) {
      let source = initialContext.source
      for (const { definition } of loaded) {
        if (!definition.transformSource) continue
        try {
          const next = await definition.transformSource({ ...initialContext, source })
          if (typeof next !== 'string') {
            throw new Error('transformSource() must return a string')
          }
          source = next
        } catch (error) {
          throw new Error(
            `Extension "${definition.name}" transformSource failed for ${initialContext.sourceRelativePath}: ${errorMessage(error)}`,
            { cause: error }
          )
        }
      }
      return source
    },
    async extendPage(initialPage) {
      let page = initialPage
      for (const { definition } of loaded) {
        if (!definition.extendPage) continue
        try {
          const patch = assertPagePatch(definition.name, await definition.extendPage(extensionPage(page)))
          page = { ...page, ...patch }
        } catch (error) {
          throw new Error(
            `Extension "${definition.name}" extendPage failed for ${page.sourceRelativePath}: ${errorMessage(error)}`,
            { cause: error }
          )
        }
      }
      return page
    },
    async generate(outputRoot, pages) {
      for (const { definition, declaredOutputs } of loaded) {
        if (!definition.generate) continue
        const emitted = new Set<string>()
        try {
          await definition.generate({
            pages: pages.map(extensionPage),
            emitFile: async (path, content) => {
              const normalized = normalizeDeclaredOutput(definition.name, path)
              if (!declaredOutputs.has(normalized)) {
                throw new Error(`generate() emitted undeclared output "${normalized}"`)
              }
              if (emitted.has(normalized))
                throw new Error(`generate() emitted "${normalized}" more than once`)
              emitted.add(normalized)
              const target = resolveOutputPath(
                outputRoot,
                posix.join('extensions', definition.name, normalized),
                `extension ${definition.name} output`
              )
              await mkdir(dirname(target), { recursive: true })
              await writeFile(target, content)
            }
          })
          const missing = [...declaredOutputs].filter((path) => !emitted.has(path))
          if (missing.length)
            throw new Error(`generate() did not emit declared outputs: ${missing.join(', ')}`)
        } catch (error) {
          throw new Error(`Extension "${definition.name}" generate failed: ${errorMessage(error)}`, {
            cause: error
          })
        }
      }
    }
  }
}
