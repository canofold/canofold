import { access, readFile, realpath } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { build } from 'esbuild'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import type { MarkdownAssets } from '@docfuse/markdown/server'
import type { MarkdownPlugin } from '@docfuse/markdown'
import { detectMarkdownAssets, type MdxImportDeclaration } from '@docfuse/markdown/server/analyze'
import { isAllowedDocsImport } from '../markdown/importBoundary'

type LocalImport = MdxImportDeclaration

const extensions = ['.tsx', '.ts', '.jsx', '.js']
const localComponentRuntime = {
  react: React,
  'react/jsx-runtime': jsxRuntime
}

function requireLocalComponentRuntime(name: string) {
  if (Object.hasOwn(localComponentRuntime, name)) {
    return localComponentRuntime[name as keyof typeof localComponentRuntime]
  }
  throw new Error(`External import is not allowed in local docs components: ${name}`)
}

function isInsideRoot(root: string, path: string) {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function assertInsideProjectRoot(modulePath: string, projectRoot?: string) {
  const realModule = await realpath(modulePath)
  if (!projectRoot) return realModule
  const realRoot = await realpath(projectRoot)
  const rel = relative(realRoot, realModule)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Local component import escapes the project root: ${modulePath}`)
  }
  return realModule
}

async function resolveLocalModule(sourcePath: string, specifier: string, projectRoot?: string) {
  const base = resolve(dirname(sourcePath), specifier)
  const explicitExtension = extname(base)
  if (explicitExtension && !extensions.includes(explicitExtension)) {
    throw new Error(`Unsupported local component import: ${specifier}`)
  }
  if (explicitExtension && (await fileExists(base))) {
    return assertInsideProjectRoot(base, projectRoot)
  }
  for (const extension of extensions) {
    const candidate = `${base}${extension}`
    if (await fileExists(candidate)) {
      return assertInsideProjectRoot(candidate, projectRoot)
    }
  }
  for (const extension of extensions) {
    const candidate = resolve(base, `index${extension}`)
    if (await fileExists(candidate)) {
      return assertInsideProjectRoot(candidate, projectRoot)
    }
  }
  throw new Error(`Local component import not found: ${specifier}`)
}

interface LocalComponentBundle {
  code: string
  sourcePaths: string[]
}

async function bundleLocalModule(entryPoint: string, projectRoot?: string): Promise<LocalComponentBundle> {
  const realRoot = projectRoot ? await realpath(projectRoot) : undefined
  const localSourcePaths = new Set([entryPoint])
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    outfile: 'local-component.js',
    write: false,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    jsx: 'automatic',
    plugins: [
      {
        name: 'docfuse-components-alias',
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /^(?:react|react\/jsx-runtime)$/ }, (args) => ({
            path: args.path,
            external: true
          }))
          pluginBuild.onResolve({ filter: /.*/ }, async (args) => {
            if (!isAbsolute(args.path) || !args.importer) return undefined
            const localImporter = realRoot
              ? isInsideRoot(realRoot, args.importer)
              : localSourcePaths.has(args.importer)
            if (!localImporter) return undefined
            const modulePath = await resolveLocalModule(args.importer, args.path, projectRoot)
            localSourcePaths.add(modulePath)
            return { path: modulePath }
          })
          pluginBuild.onResolve({ filter: /^\./ }, async (args) => {
            if (
              args.importer &&
              !(realRoot ? isInsideRoot(realRoot, args.importer) : localSourcePaths.has(args.importer))
            ) {
              return undefined
            }
            const modulePath = await resolveLocalModule(args.importer, args.path, projectRoot)
            localSourcePaths.add(modulePath)
            return { path: modulePath }
          })
          pluginBuild.onLoad({ filter: /\.(?:[jt]sx?)$/ }, async (args) => {
            const modulePath = await realpath(args.path)
            if (realRoot ? isInsideRoot(realRoot, modulePath) : localSourcePaths.has(modulePath)) {
              localSourcePaths.add(modulePath)
            }
            return undefined
          })
          pluginBuild.onResolve({ filter: /^react-dom$/ }, (args) => {
            const localImporter = args.importer
              ? realRoot
                ? isInsideRoot(realRoot, args.importer)
                : localSourcePaths.has(args.importer)
              : false
            return localImporter
              ? {
                  errors: [{ text: 'External import is not allowed in local docs components: react-dom' }]
                }
              : undefined
          })
          pluginBuild.onResolve({ filter: /^[^./].*/ }, (args) => {
            if (isAllowedDocsImport(args.path)) return undefined
            return {
              errors: [{ text: `External import is not allowed in local docs components: ${args.path}` }]
            }
          })
        }
      }
    ]
  })
  const output = result.outputFiles.find((file) => extname(file.path) === '.js')
  if (!output) throw new Error(`Failed to bundle local component: ${entryPoint}`)
  return { code: output.text, sourcePaths: [...localSourcePaths] }
}

async function importBundle(bundle: LocalComponentBundle): Promise<Record<string, unknown>> {
  const module: { exports: Record<string, unknown> } = { exports: {} }
  const evaluate = new Function('module', 'exports', 'require', bundle.code) as (
    module: { exports: Record<string, unknown> },
    exports: Record<string, unknown>,
    require: (name: string) => unknown
  ) => void
  evaluate(module, module.exports, requireLocalComponentRuntime)
  return module.exports
}

function localImports(value: readonly LocalImport[]) {
  return value.filter((entry) => entry.specifier.startsWith('.'))
}

async function bundleLocalImports(source: readonly LocalImport[], sourcePath?: string, projectRoot?: string) {
  const imports = localImports(source)
  if (!imports.length) return []
  if (!sourcePath) {
    throw new Error('Local MDX component imports require the Markdown source file path')
  }
  const modules = new Map<string, Promise<LocalComponentBundle>>()

  return Promise.all(
    imports.map(async (localImport) => {
      const modulePath = await resolveLocalModule(sourcePath, localImport.specifier, projectRoot)
      let bundlePromise = modules.get(modulePath)
      if (!bundlePromise) {
        bundlePromise = bundleLocalModule(modulePath, projectRoot)
        modules.set(modulePath, bundlePromise)
      }
      return { localImport, bundle: await bundlePromise }
    })
  )
}

/** Resolve every project-local source file that contributes to one MDX page. */
export async function localComponentDependencyPaths(
  source: readonly LocalImport[],
  sourcePath?: string,
  projectRoot?: string
) {
  const bundles = await bundleLocalImports(source, sourcePath, projectRoot)
  return [...new Set(bundles.flatMap(({ bundle }) => bundle.sourcePaths))].sort()
}

async function componentsFromBundles(
  values: Awaited<ReturnType<typeof bundleLocalImports>>
): Promise<Record<string, unknown>> {
  const loaded: Record<string, unknown> = {}
  const modules = new Map<LocalComponentBundle, Promise<Record<string, unknown>>>()

  for (const { localImport, bundle } of values) {
    let modulePromise = modules.get(bundle)
    if (!modulePromise) {
      modulePromise = importBundle(bundle)
      modules.set(bundle, modulePromise)
    }
    const module = await modulePromise

    for (const binding of localImport.bindings) {
      if (binding.namespace) {
        loaded[binding.local] = module
      } else {
        if (!Object.hasOwn(module, binding.imported)) {
          throw new Error(
            `Local module ${JSON.stringify(localImport.specifier)} does not export ${JSON.stringify(binding.imported)}`
          )
        }
        loaded[binding.local] = module[binding.imported]
      }
    }
  }

  return loaded
}

function mergeAssets(target: MarkdownAssets, source: MarkdownAssets) {
  target.behaviors = [...new Set([...target.behaviors, ...source.behaviors])]
  target.math ||= source.math
  target.pluginClients = [
    ...new Map([...target.pluginClients, ...source.pluginClients].map((asset) => [asset.id, asset])).values()
  ]
  target.pluginStyles = [
    ...new Map([...target.pluginStyles, ...source.pluginStyles].map((asset) => [asset.id, asset])).values()
  ]
}

function emptyAssets(): MarkdownAssets {
  return {
    behaviors: [],
    math: false,
    pluginClients: [],
    pluginStyles: []
  }
}

async function assetsFromBundles(
  values: Awaited<ReturnType<typeof bundleLocalImports>>,
  plugins: readonly MarkdownPlugin[] = []
) {
  const assets = emptyAssets()
  const visited = new Set<string>()
  for (const { bundle } of values) {
    for (const sourcePath of bundle.sourcePaths) {
      if (visited.has(sourcePath)) continue
      visited.add(sourcePath)
      mergeAssets(assets, detectMarkdownAssets(await readFile(sourcePath, 'utf8'), plugins, 'mdx'))
    }
  }
  return assets
}

/** Bundle, inspect, and evaluate the local component graph exactly once for a rendered MDX page. */
export async function loadLocalComponentBundle(
  source: readonly LocalImport[],
  sourcePath?: string,
  projectRoot?: string,
  plugins: readonly MarkdownPlugin[] = []
) {
  const bundles = await bundleLocalImports(source, sourcePath, projectRoot)
  const [components, assets] = await Promise.all([
    componentsFromBundles(bundles),
    assetsFromBundles(bundles, plugins)
  ])
  return { components, assets }
}
