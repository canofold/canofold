import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { expect, it, onTestFinished } from 'vitest'
import { startDevServer } from './devServer'

it('preserves emitted HTML for whole-site search providers that read it', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'canofold-dev-html-search-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'docs'))
  await writeFile(join(cwd, 'docs/index.md'), '# Indexed content')
  await writeFile(
    join(cwd, 'canofold.config.ts'),
    `export default { search: { provider: {
    id: 'html-search', client: 'compact', async write(context) {
      const fs = await import('node:fs/promises')
      const html = await fs.readFile(context.resolveOutputPath('index.html', 'search input'), 'utf8')
      await fs.mkdir(context.resolveOutputPath('search', 'search output'), { recursive: true })
      await fs.writeFile(context.resolveOutputPath('search/captured.txt', 'search output'), html)
    }
  } } }`
  )
  const server = await startDevServer({ cwd, port: 0 })
  onTestFinished(() => server.close())
  expect(await readFile(join(cwd, '.canofold/dist/search/captured.txt'), 'utf8')).toContain('Indexed content')
  expect(await (await fetch(`http://127.0.0.1:${server.port}/`)).text()).toContain('Indexed content')
})

it('observes a real file save while the first build is still compiling', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'canofold-dev-startup-edit-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'docs'))
  await writeFile(join(cwd, 'docs/index.md'), '# Before startup edit')
  await writeFile(
    join(cwd, 'canofold.config.ts'),
    "export default { extensions: [{ resolve: './wait.ts' }] }"
  )
  await writeFile(
    join(cwd, 'wait.ts'),
    `
    import { access, writeFile } from 'node:fs/promises'
    import { setTimeout } from 'node:timers/promises'
    export default { apiVersion: 1, name: 'startup-edit', async transformSource({ source }) {
      if (source.includes('Before startup edit')) {
        await writeFile(${JSON.stringify(join(cwd, '.canofold/entered'))}, 'ready')
        while (!await access(${JSON.stringify(join(cwd, '.canofold/release'))}).then(() => true, () => false)) await setTimeout(20)
      }
      return source
    } }
  `
  )
  const pending = startDevServer({ cwd, port: 0 })
  onTestFinished(async () => {
    await writeFile(join(cwd, '.canofold/release'), 'release')
    await (await pending).close()
  })
  await expect.poll(() => readFile(join(cwd, '.canofold/entered'), 'utf8')).toBe('ready')
  await writeFile(join(cwd, 'docs/index.md'), '# Saved during startup')
  await writeFile(join(cwd, '.canofold/release'), 'release')
  const server = await pending
  await expect
    .poll(async () => (await fetch(`http://127.0.0.1:${server.port}/`)).text())
    .toContain('Saved during startup')
})

it('recovers the first content error, replays errors on reconnect, and retains output after later failures', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'canofold-dev-first-content-error-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'docs'))
  const source = join(cwd, 'docs/index.md')
  await writeFile(source, '---\ntitle: 123\n---\n# Home')
  const server = await startDevServer({ cwd, port: 0 })
  onTestFinished(() => server.close())
  const base = `http://127.0.0.1:${server.port}`
  const page = await fetch(base, { headers: { accept: 'text/html' } })
  expect(page.status).toBe(503)
  expect(await page.text()).toContain('docs/index.md')
  const controller = new AbortController()
  onTestFinished(() => controller.abort())
  const events = await fetch(`${base}/__canofold/events`, { signal: controller.signal })
  const reader = events.body!.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  expect(first).toContain('event: build-error')
  controller.abort()
  await writeFile(source, '---\nstatus: draft\n---\n# Recovered')
  await expect.poll(async () => (await fetch(base)).text()).toContain('Recovered')
  const before = await (await fetch(base)).text()
  await writeFile(source, '---\ntitle: false\n---\n# Invalid again')
  await expect
    .poll(async () => {
      const abort = new AbortController()
      const response = await fetch(`${base}/__canofold/events`, { signal: abort.signal })
      const data = new TextDecoder().decode((await response.body!.getReader().read()).value)
      abort.abort()
      return data
    })
    .toContain('event: build-error')
  expect(await (await fetch(base)).text()).toBe(before)
  await writeFile(source, '# Recovered again')
  await expect.poll(async () => (await fetch(base)).text()).toContain('Recovered again')
})

it.each(['demo-analysis', 'page-render', 'listen'] as const)(
  'exits naturally and releases Vite when initial %s fails',
  async (failure) => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-startup-failure-'))
    onTestFinished(() => rm(cwd, { recursive: true, force: true }))
    await mkdir(join(cwd, 'docs'))
    await mkdir(join(cwd, 'src'))
    await mkdir(join(cwd, 'node_modules/@canofold'), { recursive: true })
    const packages = fileURLToPath(new URL('../../../', import.meta.url))
    for (const [name, target] of [
      ['canofold', 'canofold'],
      ['@canofold/vite', 'vite'],
      ['@canofold/markdown', 'markdown']
    ] as const) {
      await symlink(join(packages, target), join(cwd, 'node_modules', name))
    }
    for (const name of ['react', 'react-dom']) {
      await symlink(join(packages, 'vite/node_modules', name), join(cwd, 'node_modules', name))
    }
    await writeFile(join(cwd, 'package.json'), '{"name":"startup-failure","type":"module"}')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      "import { defineConfig } from 'canofold'; import { vite } from '@canofold/vite'; export default defineConfig({ demos: { engine: vite({configFile: false}) } })"
    )
    await writeFile(
      join(cwd, 'src/demo.tsx'),
      failure === 'demo-analysis'
        ? 'export default function Demo() { return <button> }'
        : 'export default function Demo() { return <button>Demo</button> }'
    )
    await writeFile(
      join(cwd, 'docs/index.mdx'),
      '# Demo\n\n::demo[Live]{src="/src/demo.tsx"}\n\n' +
        (failure === 'page-render' ? '{(() => { throw new Error("fixture render failure") })()}\n' : '')
    )
    const occupied = createServer()
    await new Promise<void>((resolve) =>
      occupied.listen(failure === 'listen' ? 65535 : 0, '127.0.0.1', resolve)
    )
    const port = (occupied.address() as { port: number }).port
    if (failure === 'listen') {
      onTestFinished(() => new Promise<void>((resolve) => occupied.close(() => resolve())))
    } else {
      await new Promise<void>((resolve) => occupied.close(() => resolve()))
    }
    if (failure === 'page-render') {
      const server = await startDevServer({ cwd, port })
      const base = `http://127.0.0.1:${server.port}/`
      try {
        const response = await fetch(base, { headers: { accept: 'text/html' } })
        expect(response.status).toBe(500)
        expect(await response.text()).toContain('fixture render failure')
        await writeFile(
          join(cwd, 'docs/index.mdx'),
          '# Render recovered\n\n::demo[Live]{src="/src/demo.tsx"}'
        )
        await expect.poll(async () => (await fetch(base)).text()).toContain('Render recovered')
      } finally {
        await server.close()
      }
      await expect(readFile(join(cwd, '.canofold/dev.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
      return
    }
    const result = await promisify(execFile)(
      process.execPath,
      [join(packages, 'canofold/dist/cli.js'), 'dev', '--port', String(port)],
      { cwd, timeout: 10000 }
    ).catch((error: unknown) => error as Error & { stdout: string; stderr: string })
    // A timeout would kill the process and fail these assertions. The CLI must
    // report the original failure, then exit without live Vite handles.
    expect(result, result.stderr + result.stdout).toMatchObject({ code: 1, killed: false, signal: null })
    expect(result.stderr).toContain(failure === 'demo-analysis' ? 'src/demo.tsx' : 'EADDRINUSE')
    await expect(readFile(join(cwd, '.canofold/dev.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  }
)

it('keeps Demo modules live after setup changes and refreshes the displayed source', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'canofold-dev-regression-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'docs'))
  await mkdir(join(cwd, 'src'))
  await writeFile(join(cwd, 'package.json'), '{"name":"dev-regression","type":"module"}')
  const config = (setup = false) =>
    `import { defineConfig } from 'canofold'; import { vite } from '@canofold/vite'; export default defineConfig({ demos: { engine: vite()${setup ? ", setup: './src/setup.tsx'" : ''} } })`
  await mkdir(join(cwd, 'node_modules/@canofold'), { recursive: true })
  const packages = fileURLToPath(new URL('../../../', import.meta.url))
  for (const [name, target] of [
    ['canofold', 'canofold'],
    ['@canofold/vite', 'vite'],
    ['@canofold/markdown', 'markdown']
  ] as const) {
    await symlink(join(packages, target), join(cwd, 'node_modules', name))
  }
  for (const name of ['react', 'react-dom']) {
    await symlink(join(packages, 'vite/node_modules', name), join(cwd, 'node_modules', name))
  }
  await writeFile(join(cwd, 'canofold.config.ts'), config())
  const viteConfig = (label: string) =>
    `export default { plugins: [{ name: 'fixture-label', transform(code, id) { if (id.endsWith('/src/demo.tsx')) return code.replace('__DEMO_LABEL__', ${JSON.stringify(JSON.stringify(label))}) } }] }`
  await writeFile(join(cwd, 'vite.config.ts'), viteConfig('initial'))
  await writeFile(join(cwd, 'docs/index.md'), '# Demo\n\n::demo[Live]{src="/src/demo.tsx"}\n')
  await writeFile(
    join(cwd, 'src/demo.tsx'),
    'export default function Demo() { return <button>Before</button> }'
  )
  await writeFile(
    join(cwd, 'src/setup.tsx'),
    'export default function Setup({children}) { return <section>{children}</section> }'
  )
  const server = await startDevServer({ cwd, port: 0 })
  onTestFinished(() => server.close())
  const base = `http://127.0.0.1:${server.port}`
  const html = await (await fetch(base)).text()
  const clientUrl = /data-canofold-demo-client-url="([^"]+)"/.exec(html)?.[1]
  expect(clientUrl).toBeDefined()
  expect((await fetch(new URL(clientUrl!, base))).status).toBe(200)
  const events = new AbortController()
  onTestFinished(() => events.abort())
  const response = await fetch(`${base}/__canofold/events`, { signal: events.signal })
  const reader = response.body!.getReader()
  let messages = ''
  const reading = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        messages += new TextDecoder().decode(value)
      }
    } catch (error) {
      if (!events.signal.aborted) throw error
    }
  })()
  onTestFinished(async () => {
    events.abort()
    await reading
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  await writeFile(
    join(cwd, 'src/demo.tsx'),
    'export default function Demo() { return <button title={__DEMO_LABEL__}>After</button> }'
  )
  await expect.poll(() => messages, { timeout: 10000 }).toContain('"mode":"demo-source"')
  expect(await (await fetch(base)).text()).toContain('After')
  messages = ''
  await writeFile(join(cwd, 'canofold.config.ts'), config(true))
  await expect.poll(() => messages, { timeout: 10000 }).toContain('"mode":"full"')
  const module = await fetch(new URL(clientUrl!, base))
  expect(module.status).toBe(200)
  expect(await module.text()).toContain('setup.tsx')
  messages = ''
  await writeFile(join(cwd, 'vite.config.ts'), viteConfig('reconfigured'))
  await expect.poll(() => messages, { timeout: 10000 }).toContain('"mode":"full"')
  const demo = await fetch(`${base}/src/demo.tsx`)
  expect(demo.status).toBe(200)
  expect(await demo.text()).toContain('reconfigured')
})
