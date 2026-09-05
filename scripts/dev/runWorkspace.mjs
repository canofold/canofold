import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorkspaceSupervisor, workspaceProcessConfigs } from './workspaceSupervisor.mjs'
import { acquireWorkspaceLock } from './workspaceLock.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

async function main() {
  const options = process.argv.slice(2)
  const unknownOption = options.find((option) => option !== '--debug')
  if (unknownOption) throw new Error(`Unknown option: ${unknownOption}`)
  const debug = options.includes('--debug')
  let closing = false
  let exitCode = 0
  let supervisor
  const workspaceLock = acquireWorkspaceLock(join(repoRoot, '.canofold-dev/workspace.lock'))

  const close = async (code = exitCode) => {
    if (closing) return
    closing = true
    exitCode = code
    await supervisor?.close()
    workspaceLock.release()
    process.exitCode = exitCode
  }

  try {
    supervisor = createWorkspaceSupervisor({
      processes: workspaceProcessConfigs({ debug, workspaceId: workspaceLock.workspaceId }),
      onUnexpectedExit(name, error) {
        console.error(`[workspace] ${name} worker failed`, error)
        void close(1)
      }
    })
  } catch (error) {
    workspaceLock.release()
    throw error
  }

  console.log(
    debug
      ? '[workspace] development workers started; attach a Node debugger to 127.0.0.1:9230'
      : '[workspace] development workers started'
  )
  const closeFromSignal = () => {
    void close()
  }
  process.once('SIGINT', closeFromSignal)
  process.once('SIGTERM', closeFromSignal)
  process.once('exit', () => workspaceLock.release())
}

await main().catch((error) => {
  console.error(`[workspace] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
