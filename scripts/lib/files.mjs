import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export async function filesUnder(directory) {
  const files = []
  const pending = [directory]
  while (pending.length) {
    const current = pending.pop()
    if (!current) continue
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  return files
}
