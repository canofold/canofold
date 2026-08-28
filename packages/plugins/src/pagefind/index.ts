import type { SearchProvider } from 'docfuse'

const PLUGIN_VERSION = '1'
const unusedPagefindUiFiles = [
  'pagefind-ui.js',
  'pagefind-ui.css',
  'pagefind-modular-ui.js',
  'pagefind-component-ui.js',
  'pagefind-component-ui.css',
  'pagefind-highlight.js'
]

export interface PagefindOptions {
  includeCharacters?: string
  keepIndexUrl?: boolean
  writePlayground?: boolean
}

interface PagefindProviderPage {
  search: boolean
  outputPath: string
  routePath: string
  sourceRelativePath: string
}

export interface PagefindProviderContext {
  cwd?: string
  config?: unknown
  outputRoot: string
  graph: { pages: PagefindProviderPage[] }
  publicPathFor(routePath: string): string
  resolveOutputPath(outputPath: string, label: string): string
}

export interface PagefindProvider {
  readonly id: 'pagefind'
  readonly client: 'pagefind'
  readonly version: string
  readonly cacheKey: Readonly<Required<PagefindOptions>>
  write(context: PagefindProviderContext): Promise<void>
}

function assertPagefind(errors: string[], action: string) {
  if (errors.length) throw new Error(`Pagefind ${action} failed:\n${errors.join('\n')}`)
}

interface PagefindIndex {
  addHTMLFile(input: { url: string; content: string }): Promise<{ errors: string[] }>
  writeFiles(input: { outputPath: string }): Promise<{ errors: string[] }>
  deleteIndex(): Promise<void>
}

interface PagefindApi {
  createIndex(options: {
    includeCharacters: string
    keepIndexUrl: boolean
    writePlayground: boolean
  }): Promise<{ errors: string[]; index?: PagefindIndex }>
  close(): Promise<void>
}

interface PagefindDependencies {
  pagefindApi: PagefindApi
  readFile(path: string, encoding: 'utf8'): Promise<string>
  rm(path: string, options: { recursive?: boolean; force?: boolean }): Promise<void>
  join(...paths: string[]): string
}

async function loadPagefindDependencies(): Promise<PagefindDependencies> {
  const filesystemModule = 'node:fs/promises'
  const pathModule = 'node:path'
  const pagefindModule = 'pagefind'
  const [filesystem, paths, pagefindApi] = await Promise.all([
    import(filesystemModule),
    import(pathModule),
    import(pagefindModule)
  ])
  return {
    pagefindApi: pagefindApi as PagefindApi,
    readFile: filesystem.readFile as PagefindDependencies['readFile'],
    rm: filesystem.rm,
    join: paths.join
  }
}

export async function writePagefindIndex(
  context: PagefindProviderContext,
  resolved: Required<PagefindOptions>,
  loadDependencies: () => Promise<PagefindDependencies> = loadPagefindDependencies
) {
  let pagefindApi: PagefindApi | undefined
  let index: PagefindIndex | undefined
  try {
    const dependencies = await loadDependencies()
    pagefindApi = dependencies.pagefindApi
    const { join, readFile, rm } = dependencies
    const pagefindRoot = join(context.outputRoot, 'pagefind')
    await rm(pagefindRoot, { recursive: true, force: true })
    await rm(join(context.outputRoot, 'search'), { recursive: true, force: true })

    const created = await pagefindApi.createIndex(resolved)
    assertPagefind(created.errors, 'initialization')
    if (!created.index) throw new Error('Pagefind did not return an index')
    index = created.index

    for (const page of context.graph.pages.filter((candidate) => candidate.search)) {
      const htmlPath = context.resolveOutputPath(page.outputPath, `search page ${page.outputPath}`)
      const result = await index.addHTMLFile({
        url: context.publicPathFor(page.routePath),
        content: await readFile(htmlPath, 'utf8')
      })
      assertPagefind(result.errors, `indexing ${page.sourceRelativePath}`)
    }
    const written = await index.writeFiles({ outputPath: pagefindRoot })
    assertPagefind(written.errors, 'write')
    await Promise.all(unusedPagefindUiFiles.map((file) => rm(join(pagefindRoot, file), { force: true })))
  } finally {
    try {
      await index?.deleteIndex()
    } finally {
      await pagefindApi?.close()
    }
  }
}

export function pagefind(options: PagefindOptions = {}): PagefindProvider {
  const resolved = {
    includeCharacters: options.includeCharacters ?? '._-',
    keepIndexUrl: options.keepIndexUrl ?? false,
    writePlayground: options.writePlayground ?? false
  }

  const provider: PagefindProvider = Object.freeze({
    id: 'pagefind',
    client: 'pagefind',
    version: PLUGIN_VERSION,
    cacheKey: resolved,
    async write(context: PagefindProviderContext) {
      await writePagefindIndex(context, resolved)
    }
  })
  return provider satisfies SearchProvider
}
