import { loadConfig } from '../config/load'
import { startStaticServer } from '../server/staticServer'
import { formatTerminalUrl, logInfo } from '../utils/logger'
import { resolveOutputRoot } from '../utils/paths'

export async function runPreview({ cwd, port = 4173 }: { cwd: string; port?: number }) {
  const config = await loadConfig(cwd)
  const server = await startStaticServer({
    root: resolveOutputRoot(cwd, config.outputDir),
    port,
    basePath: config.basePath
  })
  logInfo(`Preview running at ${formatTerminalUrl(`http://127.0.0.1:${server.port}${config.basePath}`)}`)
  return server
}
