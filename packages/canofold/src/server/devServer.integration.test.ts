import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { expect, it, onTestFinished } from 'vitest'
import { startDevServer } from './devServer'

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
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
    const port = (occupied.address() as { port: number }).port
    if (failure === 'listen') {
      onTestFinished(() => new Promise<void>((resolve) => occupied.close(() => resolve())))
    } else {
      await new Promise<void>((resolve) => occupied.close(() => resolve()))
    }
    const result = await promisify(execFile)(
      process.execPath,
      [join(packages, 'canofold/dist/cli.js'), 'dev', '--port', String(port)],
      { cwd, timeout: 10000 }
    ).catch((error: unknown) => error as Error & { stdout: string; stderr: string })
    // A timeout would kill the process and fail these assertions. The CLI must
    // report the original failure, then exit without live Vite handles.
    expect(result, result.stderr + result.stdout).toMatchObject({ code: 1, killed: false, signal: null })
    expect(result.stderr).toContain(
      failure === 'demo-analysis'
        ? 'src/demo.tsx'
        : failure === 'page-render'
          ? 'fixture render failure'
          : 'EADDRINUSE'
    )
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
