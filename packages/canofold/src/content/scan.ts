import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { mapConcurrent } from '../utils/concurrency'
import { isMarkdownPath } from './fileKinds'

const FILE_READ_CONCURRENCY = 32

export async function scanMarkdownFiles(
  root: string
): Promise<Array<{ path: string; raw: string; mtimeMs: number }>> {
  async function walk(dir: string): Promise<string[]> {
    const files: string[] = []
    const pending = [dir]
    while (pending.length > 0) {
      const current = pending.pop()
      if (!current) continue
      const entries = await readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(current, entry.name)
        if (entry.isSymbolicLink()) {
          throw new Error(`Documentation content must not use symbolic links: ${relative(root, fullPath)}`)
        }
        if (entry.isDirectory()) pending.push(fullPath)
        else if (entry.isFile() && isMarkdownPath(entry.name)) files.push(fullPath)
      }
    }
    return files
  }

  const files = await walk(root)
  const scanned = await mapConcurrent(files, FILE_READ_CONCURRENCY, async (fullPath) => {
    const [fileStat, raw] = await Promise.all([stat(fullPath), readFile(fullPath, 'utf8')])
    return { path: relative(root, fullPath), raw, mtimeMs: fileStat.mtimeMs }
  })
  return scanned.sort((a, b) => a.path.localeCompare(b.path))
}
