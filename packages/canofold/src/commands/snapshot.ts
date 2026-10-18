import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { loadConfig } from '../config/load'
import { documentationVersions } from '../config/versions'
import { buildContentGraph } from '../content/graph'
import { isMdxPath } from '../content/fileKinds'
import { assertVersionLocalDependencies } from '../content/versionBoundary'
import { prepareMdxSource } from '../markdown/importBoundary'
import { localComponentDependencyPaths } from '../render/localComponents'
import { loadExtensionHost } from '../extensions/host'
import { prepareDemoManifest } from '../demos/prepare'
import { assertProjectPath, isInside, pathExists, resolveProjectPath } from '../utils/paths'

async function copySnapshot(source: string, target: string) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) {
      await mkdir(to)
      await copySnapshot(from, to)
    } else if (entry.isFile()) {
      await copyFile(from, to)
    } else {
      throw new Error(`Snapshot does not support symbolic links or special files: ${from}`)
    }
  }
}

export async function runSnapshot({ cwd, id }: { cwd: string; id: string }) {
  if (!/^[a-z\d][a-z\d._-]*$/i.test(id) || id === '.' || id === '..') {
    throw new Error('Snapshot ID must be a path-safe version identifier')
  }
  const config = await loadConfig(cwd)
  const versions = documentationVersions(config)
  if (versions.some((item) => item.id === id)) {
    throw new Error(`Version ${id} already exists in canofold.config.ts`)
  }
  const current = versions[0]!
  const source = resolveProjectPath(cwd, current.docsDir, 'current docsDir')
  const docsDir = `versions/${id}`
  const target = resolveProjectPath(cwd, docsDir, 'snapshot docsDir')
  await assertProjectPath(cwd, target, 'snapshot docsDir')
  if (isInside(source, target) || isInside(target, source)) {
    throw new Error('Snapshot directory must not overlap the current documentation directory')
  }
  if (await pathExists(target)) throw new Error(`Snapshot destination already exists: ${docsDir}`)

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'canofold-snapshot-'))
  try {
    const extensions = await loadExtensionHost(cwd, temporaryRoot, config.extensions)
    const graph = await buildContentGraph(cwd, config, extensions, { includeDrafts: true })
    const pages = graph.pages.filter((page) => page.version === current.id)
    const draft = pages.find((page) => page.status === 'draft')
    if (draft) throw new Error(`Publish or remove drafts before snapshotting: ${draft.sourceRelativePath}`)
    const manifest = await prepareDemoManifest({ cwd, config, graph, mode: 'analyze' })
    if (config.demos.setup && pages.some((page) => page.demos.length > 0)) {
      throw new Error('Move demos.setup into version-local demos before snapshotting')
    }
    for (const page of pages) {
      if (page.origin) {
        await assertVersionLocalDependencies(
          cwd,
          page,
          page.origin.dependencies.map((dependency) => join(cwd, dependency.path))
        )
      }
      if (isMdxPath(page.relativePath)) {
        const mdxPaths = await localComponentDependencyPaths(
          prepareMdxSource(page.body).imports,
          page.sourcePath,
          cwd
        )
        await assertVersionLocalDependencies(cwd, page, mdxPaths)
      }
      for (const reference of page.demos) {
        if (reference.specifier.startsWith('/')) {
          throw new Error(`Use a relative Demo src before snapshotting: ${page.sourceRelativePath}`)
        }
        const demo = manifest?.demos[reference.id]
        if (!demo?.dependencyPaths) {
          throw new Error(`Demo engine must report snapshot dependencies: ${page.sourceRelativePath}`)
        }
        await assertVersionLocalDependencies(cwd, page, [demo.modulePath, ...demo.dependencyPaths])
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }

  await mkdir(join(cwd, 'versions'), { recursive: true })
  await mkdir(target)
  try {
    await copySnapshot(source, target)
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
  console.log(`Created ${docsDir} from ${relative(cwd, source)}.`)
  console.log(
    `Append { id: ${JSON.stringify(id)}, label: ${JSON.stringify(id)}, docsDir: ${JSON.stringify(docsDir)}, base: ${JSON.stringify(`/` + id + `/`)} } after the current entry in the versions array in canofold.config.ts. The configuration was not modified.`
  )
}
