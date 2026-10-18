import { startDevServer } from '../server/devServer'
import { formatTerminalUrl, logSuccess } from '../utils/logger'

export async function runDev({ cwd, port = 3333 }: { cwd: string; port?: number }) {
  const server = await startDevServer({ cwd, port })
  logSuccess(
    `Dev server running at ${formatTerminalUrl(`http://127.0.0.1:${server.port}${server.basePath}`)}`
  )
  return server
}
