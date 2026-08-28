import { access, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

type AccessPath = (path: string) => Promise<unknown>

export async function pathExists(path: string, accessPath: AccessPath = access) {
  try {
    await accessPath(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** Case- and normalization-insensitive key for paths that must remain portable across file systems. */
export function portablePathKey(path: string) {
  return path.normalize('NFC').toLocaleLowerCase('en-US')
}

export function isInside(parent: string, child: string) {
  const relativePath = relative(resolve(parent), resolve(child))
  return (
    relativePath === '' ||
    (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  )
}

export function resolveProjectPath(cwd: string, path: string, field: string) {
  const projectRoot = resolve(cwd)
  const target = resolve(projectRoot, path)
  const relativeTarget = relative(projectRoot, target)

  if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
    throw new Error(`${field} must resolve to a path inside the project root`)
  }

  return target
}

export function resolveOutputRoot(cwd: string, outputDir: string) {
  const projectRoot = resolve(cwd)
  const outputRoot = resolveProjectPath(projectRoot, outputDir, 'outputDir')
  const relativeOutput = relative(projectRoot, outputRoot)

  if (!relativeOutput) {
    throw new Error('outputDir must resolve to a directory inside the project root')
  }

  return outputRoot
}

async function canonicalPath(path: string) {
  let current = resolve(path)
  const missingSegments: string[] = []

  while (true) {
    try {
      return resolve(await realpath(current), ...missingSegments)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
      const parent = dirname(current)
      if (parent === current) throw error
      missingSegments.unshift(basename(current))
      current = parent
    }
  }
}

export async function assertProjectPath(cwd: string, target: string, field: string) {
  const [projectRoot, canonicalTarget] = await Promise.all([canonicalPath(cwd), canonicalPath(target)])
  if (!isInside(projectRoot, canonicalTarget)) {
    throw new Error(`${field} must resolve to a path inside the project root`)
  }
}

export async function assertDisjointPaths(
  outputRoot: string,
  inputPath: string,
  field: string,
  outputField = 'outputDir'
) {
  const [realOutputRoot, realInputPath] = await Promise.all([
    canonicalPath(outputRoot),
    canonicalPath(inputPath)
  ])
  if (isInside(realOutputRoot, realInputPath) || isInside(realInputPath, realOutputRoot)) {
    throw new Error(`${field} must not overlap ${outputField}`)
  }
}

export function resolveOutputPath(outputRoot: string, path: string, field: string) {
  const target = resolve(outputRoot, path)
  if (!isInside(outputRoot, target)) {
    throw new Error(`${field} must stay inside outputDir`)
  }
  return target
}
