import { randomUUID } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Notify a local dev orchestrator only after a watcher has finished writing its output. */
export async function signalWatchBuild(name: string) {
  const directory = process.env.CANOFOLD_WATCH_SIGNAL_DIR
  if (!directory) return
  const temporaryPath = join(directory, `.${name}-${randomUUID()}`)
  await writeFile(temporaryPath, randomUUID())
  await rename(temporaryPath, join(directory, name))
}
