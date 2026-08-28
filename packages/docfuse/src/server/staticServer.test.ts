import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  closeReloadClients,
  contentTypeFor,
  injectLiveReloadScript,
  formatServerSentEvent,
  heartbeatReloadClients,
  readGeneratedNotFound,
  resolveExistingRequestPath,
  resolveMountedRequestPath,
  resolveRequestPath,
  startStaticServer
} from './staticServer'

function requestStaticServer(port: number, path: string, method = 'GET') {
  return new Promise<{
    status: number
    headers: Record<string, string | string[] | undefined>
    body: string
  }>((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port, path, method }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8')
        })
      )
    })
    outgoing.on('error', reject)
    outgoing.end()
  })
}

function connectReloadStream(port: number, path: string) {
  return new Promise<{
    chunks: string[]
    close: () => void
  }>((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port, path }, (response) => {
      const chunks: string[] = []
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => chunks.push(chunk))
      response.on('error', reject)
      resolve({
        chunks,
        close: () => {
          response.destroy()
          outgoing.destroy()
        }
      })
    })
    outgoing.on('error', reject)
    outgoing.end()
  })
}

describe('resolveRequestPath', () => {
  it('resolves directory requests to index.html', () => {
    expect(resolveRequestPath('/tmp/site', '/zh/')).toBe(join('/tmp/site', 'zh/index.html'))
    expect(resolveRequestPath('/tmp/site', '/zh')).toBe(join('/tmp/site', 'zh/index.html'))
  })

  it('serves common static asset MIME types', () => {
    expect(contentTypeFor('runtime.mjs')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeFor('image.png')).toBe('image/png')
    expect(contentTypeFor('photo.webp')).toBe('image/webp')
    expect(contentTypeFor('font.woff2')).toBe('font/woff2')
    expect(contentTypeFor('sitemap.xml')).toBe('application/xml; charset=utf-8')
    expect(contentTypeFor('wasm.unknown.pagefind')).toBe('application/wasm')
  })

  it('rejects traversal outside the static root', () => {
    expect(() => resolveRequestPath('/tmp/site', '/../secret.txt')).toThrow('Forbidden')
    expect(() => resolveRequestPath('/tmp/site', '/..\\secret.txt')).toThrow('Forbidden')
  })

  it('allows names beginning with two dots when they remain inside the static root', () => {
    expect(resolveRequestPath('/tmp/site', '/..cache/asset.js')).toBe(join('/tmp/site', '..cache/asset.js'))
  })

  it('decodes URL segments exactly once without turning encoded separators into directories', () => {
    expect(resolveRequestPath('/tmp/site', '/foo%20bar/')).toBe(join('/tmp/site', 'foo bar/index.html'))
    expect(resolveRequestPath('/tmp/site', '/foo%2520bar/')).toBe(join('/tmp/site', 'foo%20bar/index.html'))
    expect(resolveRequestPath('/tmp/site', '/foo%252Fbar/')).toBe(join('/tmp/site', 'foo%2Fbar/index.html'))
    expect(() => resolveRequestPath('/tmp/site', '/foo%2Fbar/')).toThrow('Forbidden')
  })

  it('injects live reload script for dev HTML responses', () => {
    const html = injectLiveReloadScript('<html><body><main>Hello</main></body></html>')
    expect(html).toContain('/__docfuse/events')
    expect(html).toContain('source.onopen')
    expect(html).toContain('disconnected')
    expect(html).toContain("source.addEventListener('update'")
    expect(html).toContain('applyPageUpdate')
    expect(html).toContain('window.__docfuseApplyPageDocument')
    expect(html).toContain("{mode:'update'}")
    expect(html).toContain('update.protocol!==1')
    expect(html).not.toContain('function capturePageState')
    expect(html).toContain("overlay.textContent='⚠️ Build error:\\n\\n'+msg;")
  })

  it('ends and removes every live-reload stream during shutdown', () => {
    let ended = 0
    const clients = new Set([
      {
        write: () => {},
        end: () => {
          ended += 1
        }
      },
      {
        write: () => {},
        end: () => {
          ended += 1
        }
      }
    ])

    closeReloadClients(clients)

    expect(ended).toBe(2)
    expect(clients.size).toBe(0)
  })

  it('formats multiline build errors as SSE data lines', () => {
    expect(formatServerSentEvent('build-error', 'First line\nSecond line')).toBe(
      'event: build-error\ndata: First line\ndata: Second line\n\n'
    )
  })

  it('sends SSE heartbeats and prunes clients whose stream has failed', () => {
    const chunks: string[] = []
    const healthy = { write: (chunk: string) => chunks.push(chunk), end: () => undefined }
    const broken = {
      write: () => {
        throw new Error('closed')
      },
      end: vi.fn()
    }
    const clients = new Set([healthy, broken])

    heartbeatReloadClients(clients)

    expect(chunks).toEqual([':keepalive\n\n'])
    expect(clients.has(broken)).toBe(false)
    expect(broken.end).toHaveBeenCalledOnce()
  })

  it('does not follow symlinks outside the static root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-static-'))
    const root = join(cwd, 'site')
    await mkdir(root)
    await writeFile(join(cwd, 'secret.txt'), 'secret')
    await symlink(join(cwd, 'secret.txt'), join(root, 'secret.txt'))
    try {
      const filePath = resolveRequestPath(root, '/secret.txt')
      await expect(resolveExistingRequestPath(root, filePath)).rejects.toThrow('Forbidden')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('maps requests under basePath and reads the generated 404 page', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-static-base-'))
    await writeFile(join(cwd, '404.html'), '<html><body>Custom missing</body></html>')
    try {
      expect(resolveMountedRequestPath('/project/', '/project/')).toBe('/')
      expect(resolveMountedRequestPath('/project/guide/', '/project/')).toBe('/guide/')
      expect(resolveMountedRequestPath('/', '/project/')).toBeUndefined()
      expect((await readGeneratedNotFound(cwd))?.toString('utf8')).toContain('Custom missing')
      await rm(join(cwd, '404.html'))
      await expect(readGeneratedNotFound(cwd)).resolves.toBeUndefined()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('serves GET and HEAD requests with base paths, live reload, and generated errors', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-static-server-'))
    await mkdir(join(cwd, 'guide'), { recursive: true })
    await writeFile(join(cwd, 'index.html'), '<html><body>Home</body></html>')
    await writeFile(join(cwd, 'guide/index.html'), '<html><body>Guide</body></html>')
    await writeFile(join(cwd, 'asset.txt'), 'Asset')
    await writeFile(join(cwd, 'CNAME'), 'docs.example.com')
    await writeFile(join(cwd, '404.html'), '<html><body>Custom missing</body></html>')
    const server = await startStaticServer({ root: cwd, port: 0, liveReload: true, basePath: '/docs/' })

    try {
      const home = await requestStaticServer(server.port, '/docs/')
      expect(home.status).toBe(200)
      expect(home.body).toContain('Home')
      expect(home.body).toContain('/docs/__docfuse/events')
      expect(home.headers['cache-control']).toBe('no-store')

      const head = await requestStaticServer(server.port, '/docs/asset.txt', 'HEAD')
      expect(head.status).toBe(200)
      expect(head.body).toBe('')
      expect(head.headers['content-type']).toBe('text/plain; charset=utf-8')

      const extensionlessAsset = await requestStaticServer(server.port, '/docs/CNAME')
      expect(extensionlessAsset.status).toBe(200)
      expect(extensionlessAsset.body).toBe('docs.example.com')

      const methodNotAllowed = await requestStaticServer(server.port, '/docs/', 'POST')
      expect(methodNotAllowed.status).toBe(405)
      expect(methodNotAllowed.headers.allow).toBe('GET, HEAD')

      const missing = await requestStaticServer(server.port, '/outside/')
      expect(missing.status).toBe(404)
      expect(missing.body).toContain('Custom missing')
      expect(missing.body).toContain('/docs/__docfuse/events')

      const forbidden = await requestStaticServer(server.port, '/docs/bad%2Fpath')
      expect(forbidden.status).toBe(403)
      expect(forbidden.body).toBe('Forbidden')
    } finally {
      await server.close()
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('reports an unsafe generated 404 as a server error instead of hiding it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-static-error-'))
    const root = join(cwd, 'site')
    await mkdir(root)
    await writeFile(join(cwd, 'outside.html'), '<html>Outside</html>')
    await symlink(join(cwd, 'outside.html'), join(root, '404.html'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const server = await startStaticServer({ root, port: 0, basePath: '/docs/' })

    try {
      const response = await requestStaticServer(server.port, '/outside/')
      expect(response.status).toBe(500)
      expect(response.body).toBe('Internal server error')
      expect(errorLog).toHaveBeenCalled()
    } finally {
      errorLog.mockRestore()
      await server.close()
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('streams page updates and build status over the mounted live-reload endpoint', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-static-events-'))
    await writeFile(join(cwd, 'index.html'), '<html><body>Home</body></html>')
    let currentRoot = cwd
    let currentBasePath = '/docs/'
    const server = await startStaticServer({
      root: () => currentRoot,
      port: 0,
      liveReload: true,
      basePath: () => currentBasePath
    })
    let stream: Awaited<ReturnType<typeof connectReloadStream>> | undefined

    try {
      stream = await connectReloadStream(server.port, '/docs/__docfuse/events')
      await vi.waitFor(() => expect(stream?.chunks.join('')).toContain(':connected\n\n'))

      server.reload({ protocol: 1, type: 'update', mode: 'page', routes: ['/guide/'] })
      server.sendBuildError('First line\nSecond line')
      server.sendBuildOk()

      await vi.waitFor(() => {
        const events = stream?.chunks.join('') ?? ''
        expect(events).toContain('event: update')
        expect(events).toContain('"mode":"page"')
        expect(events).toContain('"routes":["/guide/"]')
        expect(events).toContain('event: build-error\ndata: First line\ndata: Second line')
        expect(events).toContain('event: build-ok')
      })

      expect((await requestStaticServer(server.port, '/docs/')).body).toContain('Home')
      currentBasePath = '/next/'
      expect((await requestStaticServer(server.port, '/docs/')).status).toBe(404)
      expect((await requestStaticServer(server.port, '/next/')).status).toBe(200)
      currentRoot = join(cwd, 'missing-root')
      expect((await requestStaticServer(server.port, '/next/')).status).toBe(404)
    } finally {
      stream?.close()
      await server.close()
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
