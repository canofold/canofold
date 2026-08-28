import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const relativeImportPattern = /(?:from\s*|import\s*)["'](\.\.?\/[^"']+)["']/g
const relativeDynamicImportPattern = /import\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g

export async function moduleGraph(root, entry, includeDynamic = false, seen = new Set()) {
  const path = resolve(root, entry)
  if (seen.has(path)) return seen
  seen.add(path)

  const source = await readFile(path, 'utf8')
  const specifiers = [...source.matchAll(relativeImportPattern)]
  if (includeDynamic) specifiers.push(...source.matchAll(relativeDynamicImportPattern))

  for (const match of specifiers) {
    await moduleGraph(root, join(dirname(entry), match[1]), includeDynamic, seen)
  }
  return seen
}
