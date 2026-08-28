import { copyFile, cp, lstat, mkdir, readFile, readdir, realpath, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, posix, relative, resolve } from 'node:path'
import type { DocfuseConfig } from '../config/types'
import type { DocPage } from '../content/types'
import { RESERVED_OUTPUT_DIRECTORIES } from '../output/plan'
import { isInside, portablePathKey, resolveOutputPath, resolveProjectPath } from '../utils/paths'
import { analyzeMarkdown } from '@docfuse/markdown/server/analyze'
import type {
  MarkdownAssets,
  MarkdownPluginClientAsset,
  MarkdownPluginClientResourceDirectory,
  MarkdownPluginStyleAsset
} from '@docfuse/markdown/server'

const require = createRequire(import.meta.url)

async function copyJavaScriptDirectory(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    filter: async (sourcePath) => (await stat(sourcePath)).isDirectory() || sourcePath.endsWith('.js')
  })
}

export async function copyMarkdownClient(outputRoot: string) {
  const entry = require.resolve('@docfuse/markdown/client')
  const target = join(outputRoot, 'assets/docfuse-markdown')
  await copyJavaScriptDirectory(dirname(entry), target)
}

const pluginAssetIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function registerPluginAsset<T extends { id: string; module: string }>(
  assets: Map<string, T>,
  asset: T,
  kind: string
) {
  if (!pluginAssetIdPattern.test(asset.id)) {
    throw new Error(`Invalid Markdown plugin ${kind} id: ${asset.id}`)
  }
  const existing = assets.get(asset.id)
  if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) {
    throw new Error(
      `Markdown plugin ${kind} id "${asset.id}" is declared by both "${existing.module}" and "${asset.module}"`
    )
  }
  assets.set(asset.id, asset)
}

function assertSafePluginResourcePath(path: string, label: string) {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid Markdown plugin ${label} path: ${path}`)
  }
}

async function copyPluginResourceDirectory(
  source: string,
  target: string,
  descriptor: MarkdownPluginClientResourceDirectory
): Promise<void> {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Markdown plugin resources must not use symbolic links: ${join(source, entry.name)}`)
    }
    const sourcePath = join(source, entry.name)
    const targetPath = join(target, entry.name)
    if (entry.isDirectory()) {
      await copyPluginResourceDirectory(sourcePath, targetPath, descriptor)
    } else if (
      entry.isFile() &&
      (!descriptor.extensions || descriptor.extensions.some((extension) => entry.name.endsWith(extension)))
    ) {
      await copyFile(sourcePath, targetPath)
    }
  }
}

async function copyMarkdownPluginClient(target: string, asset: MarkdownPluginClientAsset) {
  const clientEntry = require.resolve(asset.module)
  await copyFile(clientEntry, join(target, `${asset.id}.js`))
  if (!asset.resources?.length) return

  const resourceRoot = join(target, asset.id)
  const resolveFromClient = createRequire(clientEntry)
  for (const resource of asset.resources) {
    assertSafePluginResourcePath(resource.output, 'resource output')
    const resourceEntry = resolveFromClient.resolve(resource.module)
    const resourceTarget = resolve(resourceRoot, resource.output)
    if (!isInside(resourceRoot, resourceTarget)) {
      throw new Error(`Markdown plugin resource output escapes its client directory: ${resource.output}`)
    }
    await mkdir(dirname(resourceTarget), { recursive: true })
    await copyFile(resourceEntry, resourceTarget)

    for (const directory of resource.directories ?? []) {
      assertSafePluginResourcePath(directory.source, 'resource source')
      assertSafePluginResourcePath(directory.output, 'resource directory output')
      const sourceRoot = dirname(resourceEntry)
      const sourceDirectory = resolve(sourceRoot, directory.source)
      const outputDirectory = resolve(resourceRoot, directory.output)
      if (!isInside(sourceRoot, sourceDirectory) || !isInside(resourceRoot, outputDirectory)) {
        throw new Error(`Markdown plugin resource directory escapes its declared root: ${directory.source}`)
      }
      await copyPluginResourceDirectory(sourceDirectory, outputDirectory, directory)
    }
  }
}

export function registerPluginAssets(
  assets: MarkdownAssets,
  clients: Map<string, MarkdownPluginClientAsset>,
  styles: Map<string, MarkdownPluginStyleAsset>
) {
  assets.pluginClients.forEach((asset) => registerPluginAsset(clients, asset, 'client'))
  assets.pluginStyles.forEach((asset) => registerPluginAsset(styles, asset, 'style'))
}

export async function copyMarkdownPluginAssets(
  outputRoot: string,
  clients: ReadonlyMap<string, MarkdownPluginClientAsset>,
  styles: ReadonlyMap<string, MarkdownPluginStyleAsset>
) {
  const target = join(outputRoot, 'assets/docfuse-plugins')
  await rm(target, { recursive: true, force: true })
  if (clients.size === 0 && styles.size === 0) return
  await mkdir(target, { recursive: true })
  await Promise.all([
    ...[...clients.values()].map((asset) => copyMarkdownPluginClient(target, asset)),
    ...[...styles.values()].map((asset) =>
      copyFile(require.resolve(asset.module), join(target, `${asset.id}.css`))
    )
  ])
}

export async function copyRequiredMathFonts(source: string, target: string) {
  try {
    await cp(source, target, { recursive: true, force: true })
  } catch (error) {
    throw new Error(`Failed to copy required KaTeX fonts from ${source}`, { cause: error })
  }
}

export interface AssetCopy {
  source: string
  outputPath: string
}

export async function collectPublicAssets(cwd: string, config: DocfuseConfig): Promise<AssetCopy[]> {
  const assets: AssetCopy[] = []
  async function walk(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        throw new Error(`Public assets must not be symbolic links: ${posix.join(prefix, entry.name)}`)
      }
      const source = join(directory, entry.name)
      const outputPath = posix.join(prefix, entry.name)
      if (entry.isDirectory()) await walk(source, outputPath)
      else if (entry.isFile()) assets.push({ source, outputPath })
    }
  }
  const docsDirs = new Set(config.versions.items.map((version) => version.docsDir))
  for (const docsDir of docsDirs) {
    const publicDir = join(resolveProjectPath(cwd, docsDir, `public directory for ${docsDir}`), 'public')
    try {
      await walk(publicDir, '')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return assets
}

function relativeAssetTargets(markdown: string) {
  const analysis = analyzeMarkdown(markdown)
  return [...new Set([...analysis.images, ...analysis.links])]
    .map((target) => (target.split('#')[0] ?? '').split('?')[0] ?? '')
    .filter(
      (target) =>
        target &&
        !target.startsWith('/') &&
        !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target) &&
        !/\.mdx?$/i.test(target)
    )
}

function decodeRelativeUrlPath(target: string) {
  return target
    .split('/')
    .map((segment) => {
      const decoded = decodeURIComponent(segment)
      if (decoded.includes('/') || decoded.includes('\\')) {
        throw new Error(`Invalid relative asset path: ${target}`)
      }
      return decoded
    })
    .join('/')
}

export async function collectPageAssets(cwd: string, pages: DocPage[]): Promise<AssetCopy[]> {
  const assets: AssetCopy[] = []
  for (const page of pages) {
    const docsRoot = resolveProjectPath(cwd, page.docsDir, 'docsDir')
    const realDocsRoot = await realpath(docsRoot)
    for (const target of relativeAssetTargets(page.body)) {
      const decodedTarget = decodeRelativeUrlPath(target)
      const source = resolve(dirname(page.sourcePath), decodedTarget)
      let sourceStat
      try {
        sourceStat = await lstat(source)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      if (sourceStat.isSymbolicLink()) {
        throw new Error(`Relative assets must not use symbolic links: ${target}`)
      }
      if (!sourceStat.isFile()) continue
      const realSource = await realpath(source)
      const expectedRealSource = resolve(realDocsRoot, relative(docsRoot, source))
      if (portablePathKey(realSource) !== portablePathKey(expectedRealSource)) {
        throw new Error(`Relative assets must not use symbolic links: ${target}`)
      }
      if (!isInside(realDocsRoot, realSource)) {
        throw new Error(`Relative asset must stay inside docsDir: ${target}`)
      }
      assets.push({
        source: realSource,
        outputPath: posix.resolve('/', posix.dirname(page.outputPath), decodedTarget).slice(1)
      })
    }
  }
  return assets
}

export interface PreviousPageOutput {
  outputPath: string
  markdownOutputPath: string
  body?: string
  assetOutputPaths?: string[]
}

export function pageAssetOutputPathsFor(
  pages: ReadonlyArray<Pick<DocPage, 'body' | 'outputPath'> | Pick<PreviousPageOutput, 'assetOutputPaths'>>
) {
  const paths = new Set<string>()
  for (const page of pages) {
    if ('assetOutputPaths' in page && page.assetOutputPaths) {
      page.assetOutputPaths.forEach((path) => paths.add(path))
      continue
    }
    if (!('body' in page)) continue
    for (const target of relativeAssetTargets(page.body)) {
      const decodedTarget = decodeRelativeUrlPath(target)
      paths.add(posix.resolve('/', posix.dirname(page.outputPath), decodedTarget).slice(1))
    }
  }
  return paths
}

export async function removeStalePageAssets(
  outputRoot: string,
  previousPages: PreviousPageOutput[],
  currentPages: DocPage[],
  protectedPaths: Iterable<string>
) {
  if (!previousPages.length) return
  const currentKeys = new Set(
    [...pageAssetOutputPathsFor(currentPages), ...protectedPaths].map(portablePathKey)
  )
  const stalePaths = [...pageAssetOutputPathsFor(previousPages)].filter(
    (path) => !currentKeys.has(portablePathKey(path))
  )
  await Promise.all(
    stalePaths.map((path) =>
      rm(resolveOutputPath(outputRoot, path, `stale page asset ${path}`), { force: true })
    )
  )
}

export async function copyStaticAssets(outputRoot: string, assets: AssetCopy[], generatedPaths: Set<string>) {
  const generatedKeys = new Set([...generatedPaths].map(portablePathKey))
  const ancestorsOf = (path: string) => {
    const ancestors: string[] = []
    let parent = posix.dirname(path)
    while (parent !== '.') {
      ancestors.push(parent)
      parent = posix.dirname(parent)
    }
    return ancestors
  }
  const generatedAncestorKeys = new Set([...generatedKeys].flatMap((path) => ancestorsOf(path)))
  const reservedDirectoryKeys = RESERVED_OUTPUT_DIRECTORIES.map(portablePathKey)
  const copied = new Map<string, string>()
  const copiedAncestorKeys = new Set<string>()
  for (const asset of assets) {
    const outputKey = portablePathKey(asset.outputPath)
    const outputAncestorKeys = ancestorsOf(outputKey)
    if (
      generatedKeys.has(outputKey) ||
      generatedAncestorKeys.has(outputKey) ||
      outputAncestorKeys.some((ancestor) => generatedKeys.has(ancestor)) ||
      reservedDirectoryKeys.some(
        (directory) => outputKey === directory || outputKey.startsWith(`${directory}/`)
      )
    ) {
      throw new Error(`Static asset conflicts with generated output: ${asset.outputPath}`)
    }
    const previousSource = copied.get(outputKey)
    if (previousSource && previousSource !== asset.source) {
      const [previousContents, contents] = await Promise.all([
        readFile(previousSource),
        readFile(asset.source)
      ])
      if (!previousContents.equals(contents)) {
        throw new Error(`Multiple static assets target the same output path: ${asset.outputPath}`)
      }
    }
    if (previousSource) continue
    if (copiedAncestorKeys.has(outputKey) || outputAncestorKeys.some((ancestor) => copied.has(ancestor))) {
      throw new Error(`Multiple static assets target overlapping output paths: ${asset.outputPath}`)
    }
    copied.set(outputKey, asset.source)
    for (const ancestor of outputAncestorKeys) copiedAncestorKeys.add(ancestor)
    const target = resolveOutputPath(outputRoot, asset.outputPath, `static asset ${asset.outputPath}`)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(asset.source, target)
  }
}

export async function readCustomStyles(cwd: string, styles: string[]): Promise<string> {
  if (!styles.length) return ''
  const sources = await Promise.all(
    styles.map(async (stylePath) => {
      const source = await readFile(resolveProjectPath(cwd, stylePath, 'styles entry'), 'utf8')
      return `/* User style: ${stylePath} */\n${source}`
    })
  )
  return sources.join('\n')
}
