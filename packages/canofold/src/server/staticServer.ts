import { createServer } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { isInside } from '../utils/paths'
import { logError } from '../utils/logger'

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pagefind': 'application/wasm'
}

export function contentTypeFor(path: string) {
  return contentTypes[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

interface ReloadClient {
  write: (chunk: string) => void
  end: () => void
}

const RELOAD_HEARTBEAT_MS = 15_000

export interface DevReloadUpdate {
  protocol: 1
  type: 'update'
  mode: 'page' | 'full'
  routes: string[]
}

export function closeReloadClients(clients: Set<ReloadClient>) {
  for (const client of clients) client.end()
  clients.clear()
}

function writeReloadClients(clients: Set<ReloadClient>, chunk: string) {
  for (const client of clients) {
    try {
      client.write(chunk)
    } catch {
      clients.delete(client)
      try {
        client.end()
      } catch {
        // The stream is already unusable; removing the reference is sufficient.
      }
    }
  }
}

export function heartbeatReloadClients(clients: Set<ReloadClient>) {
  writeReloadClients(clients, ':keepalive\n\n')
}

export function formatServerSentEvent(event: string, data = '') {
  const dataLines = data.replace(/\r\n?/g, '\n').split('\n')
  return `event: ${event}\n${dataLines.map((line) => `data: ${line}`).join('\n')}\n\n`
}

export function injectLiveReloadScript(html: string, eventsPath = '/__canofold/events') {
  const script = `<script type="module">
const source=new EventSource(${JSON.stringify(eventsPath)});
let connected=false,disconnected=false;
let overlay=null;
function showError(msg){
  if(!overlay){overlay=document.createElement('dialog');overlay.style.cssText='all:initial;position:fixed;inset:0;width:100%;height:100%;border:none;background:rgba(15,15,20,.92);color:#f87171;font:14px/1.6 monospace;padding:2rem;box-sizing:border-box;z-index:2147483647;overflow:auto;white-space:pre-wrap;word-break:break-all;';document.documentElement.appendChild(overlay);}
  overlay.textContent='\u26a0\ufe0f Build error:\\n\\n'+msg;
  if(!overlay.open)overlay.showModal();
}
function clearError(){if(overlay&&overlay.open){overlay.close();overlay.remove();overlay=null;}}
function normalizeRoute(value){const path=value.split(/[?#]/,1)[0]||'/';return path.endsWith('/')?path:path+'/';}
async function applyPageUpdate(update){
  const currentRoute=normalizeRoute(location.pathname);
  if(!update.routes.some((route)=>normalizeRoute(route)===currentRoute))return true;
  const response=await fetch(location.href,{cache:'no-store',headers:{accept:'text/html'}});
  if(!response.ok||!(response.headers.get('content-type')||'').includes('text/html'))return false;
  const nextDocument=new DOMParser().parseFromString(await response.text(),'text/html');
  if(typeof window.__canofoldApplyPageDocument!=='function')return false;
  return window.__canofoldApplyPageDocument(nextDocument,{mode:'update'});
}
source.onopen=()=>{if(connected&&disconnected){clearError();location.reload();}connected=true;disconnected=false;};
source.onerror=()=>{if(connected)disconnected=true;};
source.onmessage=()=>{clearError();location.reload();};
source.addEventListener('update',async(event)=>{
  clearError();
  try{
    const update=JSON.parse(event.data);
    if(update.protocol!==1||update.type!=='update'||update.mode!=='page'){location.reload();return;}
    if(!await applyPageUpdate(update))location.reload();
  }catch{location.reload();}
});
source.addEventListener('build-error',(e)=>showError(e.data));
source.addEventListener('build-ok',()=>clearError());
</script>`
  return html.replace('</body>', `${script}</body>`)
}

export function resolveMountedRequestPath(pathname: string, basePath = '/') {
  if (basePath === '/') return pathname
  const prefix = basePath.replace(/\/$/, '')
  if (pathname === prefix) return '/'
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) || '/' : undefined
}

function resolveRequestCandidates(root: string, pathname: string) {
  const resolvedRoot = resolve(root)
  const decodedSegments = pathname.split('/').map((segment) => {
    const decoded = decodeURIComponent(segment)
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      /[\u0000-\u001f]/.test(decoded)
    ) {
      throw new Error('Forbidden')
    }
    return decoded
  })
  const normalized = normalize(decodedSegments.join('/'))
  if (normalized.split(/[\\/]/).includes('..')) {
    throw new Error('Forbidden')
  }
  const directPath = resolve(join(resolvedRoot, normalized))
  const candidates = normalized.endsWith('/')
    ? [join(directPath, 'index.html')]
    : extname(normalized) === ''
      ? [directPath, join(directPath, 'index.html')]
      : [directPath]

  for (const filePath of candidates) {
    const relativePath = relative(resolvedRoot, filePath)
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error('Forbidden')
    }
  }
  return candidates
}

export function resolveRequestPath(root: string, pathname: string) {
  return resolveRequestCandidates(root, pathname).at(-1)!
}

export async function resolveExistingRequestPath(root: string, filePath: string) {
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(filePath)])
  if (!isInside(realRoot, realFile)) throw new Error('Forbidden')
  return realFile
}

export async function readGeneratedNotFound(root: string) {
  try {
    const filePath = await resolveExistingRequestPath(root, join(root, '404.html'))
    return await readFile(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export async function startStaticServer({
  root,
  port,
  liveReload = false,
  basePath = '/'
}: {
  root: string | (() => string)
  port: number
  liveReload?: boolean
  basePath?: string | (() => string)
}) {
  const reloadClients = new Set<ReloadClient>()
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' })
      response.end('Method not allowed')
      return
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const currentBasePath = typeof basePath === 'function' ? basePath() : basePath
    const basePrefix = currentBasePath === '/' ? '' : currentBasePath.replace(/\/$/, '')
    const eventsPath = `${basePrefix}/__canofold/events`
    if (liveReload && url.pathname === eventsPath) {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      })
      response.write(':connected\n\n')
      reloadClients.add(response)
      const removeClient = () => reloadClients.delete(response)
      request.once('close', removeClient)
      response.once('close', removeClient)
      response.once('error', removeClient)
      return
    }

    const mountedPathname = resolveMountedRequestPath(url.pathname, currentBasePath)
    let resolvedRoot: string

    const sendNotFound = async () => {
      response.statusCode = 404
      let body = await readGeneratedNotFound(resolvedRoot)
      if (body) {
        response.setHeader('content-type', contentTypes['.html'] ?? 'text/html; charset=utf-8')
        if (liveReload) body = Buffer.from(injectLiveReloadScript(body.toString('utf8'), eventsPath))
        response.end(request.method === 'HEAD' ? undefined : body)
        return
      }
      response.end(request.method === 'HEAD' ? undefined : 'Not found')
    }

    const sendInternalError = (error: unknown) => {
      logError('Static server error:', error)
      response.statusCode = 500
      response.end(request.method === 'HEAD' ? undefined : 'Internal server error')
    }

    resolvedRoot = resolve(typeof root === 'function' ? root() : root)
    if (mountedPathname === undefined) {
      try {
        await sendNotFound()
      } catch (error) {
        sendInternalError(error)
      }
      return
    }

    let filePaths: string[]

    try {
      filePaths = resolveRequestCandidates(resolvedRoot, mountedPathname)
    } catch {
      response.statusCode = 403
      response.end('Forbidden')
      return
    }

    try {
      let realFile: string | undefined
      let body: Buffer | undefined
      for (const filePath of filePaths) {
        try {
          const candidate = await resolveExistingRequestPath(resolvedRoot, filePath)
          body = await readFile(candidate)
          realFile = candidate
          break
        } catch (error) {
          if ((error as Error).message === 'Forbidden') {
            response.statusCode = 403
            response.end('Forbidden')
            return
          }
          const code = (error as NodeJS.ErrnoException).code
          if (code !== 'ENOENT' && code !== 'EISDIR') throw error
        }
      }
      if (!realFile || !body) {
        await sendNotFound()
        return
      }
      response.setHeader('content-type', contentTypeFor(realFile))
      response.setHeader('cache-control', 'no-store')
      if (liveReload && extname(realFile) === '.html') {
        body = Buffer.from(injectLiveReloadScript(body.toString('utf8'), eventsPath))
      }
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'EISDIR') {
        try {
          await sendNotFound()
        } catch (notFoundError) {
          sendInternalError(notFoundError)
        }
      } else {
        sendInternalError(error)
      }
    }
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => rejectListen(error)
    server.once('error', onError)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError)
      resolveListen()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start server')
  }
  const heartbeatTimer = liveReload
    ? setInterval(() => heartbeatReloadClients(reloadClients), RELOAD_HEARTBEAT_MS)
    : undefined
  heartbeatTimer?.unref()

  return {
    port: address.port,
    reload: (update: DevReloadUpdate = { protocol: 1, type: 'update', mode: 'full', routes: [] }) => {
      writeReloadClients(reloadClients, formatServerSentEvent('update', JSON.stringify(update)))
    },
    sendBuildError: (message: string) => {
      writeReloadClients(reloadClients, formatServerSentEvent('build-error', message))
    },
    sendBuildOk: () => {
      writeReloadClients(reloadClients, formatServerSentEvent('build-ok'))
    },
    close: () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      closeReloadClients(reloadClients)
      return new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose()))
      )
    }
  }
}
