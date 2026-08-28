import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { mapConcurrent } from '../utils/concurrency'
import { resolveOutputPath } from '../utils/paths'
import { fingerprintBytes } from './fingerprint'
import type { OutputFileState } from './types'

const OUTPUT_IO_CONCURRENCY = 16

function portablePath(root: string, path: string) {
  return relative(resolve(root), resolve(path)).replace(/\\/g, '/')
}

async function outputFilesUnder(root: string): Promise<string[]> {
  async function walk(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true })
    return (
      await Promise.all(
        entries.map(async (entry) => {
          const path = resolve(directory, entry.name)
          if (entry.isSymbolicLink()) throw new Error(`Generated output must not be a symbolic link: ${path}`)
          if (entry.isDirectory()) return walk(path)
          return entry.isFile() ? [path] : []
        })
      )
    ).flat()
  }
  return walk(root)
}

export async function captureBuildOutputs(outputRoot: string): Promise<Record<string, OutputFileState>> {
  const files = (await outputFilesUnder(outputRoot)).sort()
  const entries = await mapConcurrent(files, OUTPUT_IO_CONCURRENCY, async (path) => {
    const contents = await readFile(path)
    return [
      portablePath(outputRoot, path),
      { fingerprint: fingerprintBytes(contents), size: contents.byteLength }
    ] as const
  })
  return Object.fromEntries(entries)
}

export async function verifyBuildOutputs(outputRoot: string, outputs: Record<string, OutputFileState>) {
  try {
    const expectedPaths = Object.keys(outputs).sort()
    const actualPaths = (await outputFilesUnder(outputRoot))
      .map((path) => portablePath(outputRoot, path))
      .sort()
    if (
      actualPaths.length !== expectedPaths.length ||
      actualPaths.some((path, index) => path !== expectedPaths[index])
    ) {
      return false
    }
    const valid = await mapConcurrent(
      Object.entries(outputs),
      OUTPUT_IO_CONCURRENCY,
      async ([path, expected]) => {
        const target = resolveOutputPath(outputRoot, path, `cached output ${path}`)
        const metadata = await stat(target)
        if (!metadata.isFile() || metadata.size !== expected.size) return false
        return fingerprintBytes(await readFile(target)) === expected.fingerprint
      }
    )
    return valid.every(Boolean)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function copyBuildOutputs(
  sourceRoot: string,
  targetRoot: string,
  outputs: Record<string, OutputFileState>
) {
  await mapConcurrent(Object.keys(outputs), OUTPUT_IO_CONCURRENCY, async (path) => {
    const source = resolveOutputPath(sourceRoot, path, `cached output ${path}`)
    const target = resolveOutputPath(targetRoot, path, `staged output ${path}`)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(source, target)
  })
}
