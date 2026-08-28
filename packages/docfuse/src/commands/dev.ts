import { startDevServer } from '../server/devServer'
import { logInfo } from '../utils/logger'

export async function runDev({ cwd, port = 3333 }: { cwd: string; port?: number }) {
  const server = await startDevServer({ cwd, port })
  logInfo(`Dev server running at http://127.0.0.1:${server.port}/`)
  return server
}
