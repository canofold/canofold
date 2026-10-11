import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const runGit = promisify(execFile)

/** Resolve committed content dates in one history walk. Untracked or dirty files have no reliable date. */
export async function gitContentDates(cwd: string, docsDirs: string[]): Promise<Map<string, string>> {
  const dates = new Map<string, string>()
  let root: string
  let projectRoot: string
  try {
    projectRoot = await realpath(cwd)
    root = (await runGit('git', ['rev-parse', '--show-toplevel'], { cwd: projectRoot })).stdout.trim()
    // A shallow boundary is reported as a root commit, attributing unchanged
    // files to that commit. Without complete history these dates are unknown.
    const shallow = await runGit('git', ['rev-parse', '--is-shallow-repository'], { cwd: root })
    if (shallow.stdout.trim() === 'true') return dates
  } catch {
    return dates
  }

  const paths = docsDirs.map((dir) => relative(root, resolve(projectRoot, dir)).split(sep).join('/'))
  const args = ['--', ...paths]
  let history: string
  let status: string
  try {
    ;[history, status] = await Promise.all([
      runGit('git', ['log', '-z', '--format=%x1e%cI%x00', '--name-only', ...args], {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024
      }).then((result) => result.stdout),
      runGit('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', ...args], {
        cwd: root,
        maxBuffer: 16 * 1024 * 1024
      }).then((result) => result.stdout)
    ])
  } catch {
    return dates
  }

  const dirty = new Set<string>()
  const statusEntries = status.split('\0')
  for (let index = 0; index < statusEntries.length; index += 1) {
    const entry = statusEntries[index]
    if (!entry) continue
    dirty.add(entry.slice(3))
    if (/[RC]/.test(entry.slice(0, 2))) {
      const previousPath = statusEntries[++index]
      if (previousPath) dirty.add(previousPath)
    }
  }

  for (const record of history.split('\x1e')) {
    const separator = record.indexOf('\0')
    if (separator < 0) continue
    const committedAt = record.slice(0, separator).trim()
    const timestamp = Date.parse(committedAt)
    if (!Number.isFinite(timestamp)) continue
    for (const path of record
      .slice(separator + 1)
      .replace(/^\0?\n/, '')
      .split('\0')) {
      if (!path || dirty.has(path) || dates.has(path)) continue
      dates.set(path, new Date(timestamp).toISOString())
    }
  }

  return new Map(
    [...dates].map(([path, date]) => [relative(projectRoot, resolve(root, path)).split(sep).join('/'), date])
  )
}
