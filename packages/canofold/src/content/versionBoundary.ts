import { realpath } from 'node:fs/promises'
import { isInside, resolveProjectPath } from '../utils/paths'
import type { DocPage } from './types'

/** Historical page code must travel with its version, not reference the current source tree. */
export async function assertVersionLocalDependencies(cwd: string, page: DocPage, paths: string[]) {
  const root = await realpath(
    resolveProjectPath(cwd, page.docsDir, `versions.items[${page.version}].docsDir`)
  )
  for (const path of paths) {
    if (!isInside(root, await realpath(path))) {
      throw new Error(
        `Historical page depends on a file outside ${page.docsDir}: ${page.sourceRelativePath} -> ${path}`
      )
    }
  }
}
