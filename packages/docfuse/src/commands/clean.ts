import { readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { resolveBuildCacheRoot, resolveBuildTemporaryRoot, withBuildLock } from '../build/cache'
import { resolveSafeOutputRoot } from '../build/safety'
import { loadConfig } from '../config/load'
import { logInfo } from '../utils/logger'

export async function runClean({ cwd }: { cwd: string }) {
  const config = await loadConfig(cwd)
  const cacheRoot = resolveBuildCacheRoot(cwd)
  const outputRoot = await resolveSafeOutputRoot(cwd, config, cacheRoot)
  await withBuildLock(cacheRoot, async () => {
    const outputParent = dirname(outputRoot)
    const escapedName = basename(outputRoot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const atomicBuildResidue = new RegExp(
      `^\\.${escapedName}\\.(?:backup|(?:tmp|backup)-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`,
      'i'
    )
    const entries = await readdir(outputParent, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      }
    )
    await Promise.all(
      entries
        .filter((entry) => atomicBuildResidue.test(entry.name))
        .map((entry) => rm(join(outputParent, entry.name), { recursive: true, force: true }))
    )
    await rm(outputRoot, { recursive: true, force: true })
    await rm(cacheRoot, { recursive: true, force: true })
    await rm(resolveBuildTemporaryRoot(cwd), { recursive: true, force: true })
  })
  logInfo(`Removed ${config.outputDir}, .docfuse/cache, and temporary or interrupted build files`)
}
