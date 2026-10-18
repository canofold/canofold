import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { expect, it, onTestFinished, vi } from 'vitest'
import { runDev } from './dev'

it('rejects another dev before reading configuration, including through a project symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canofold-dev-exclusive-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const cwd = join(root, 'project')
  const alias = join(root, 'alias')
  await mkdir(join(cwd, 'docs'), { recursive: true })
  await writeFile(join(cwd, 'docs/index.md'), '# Exclusive preview')
  await symlink(cwd, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const server = await runDev({ cwd, port: 0 })
  onTestFinished(() => server.close())
  await writeFile(join(cwd, 'canofold.config.mjs'), "throw new Error('configuration must not execute')")

  await expect(runDev({ cwd: alias, port: 0 })).rejects.toThrow(/Canofold dev.*already running/)
  expect(await (await fetch(`http://127.0.0.1:${server.port}`)).text()).toContain('Exclusive preview')
  await server.close()
  await expect(readFile(join(cwd, '.canofold/dev.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('stops the standalone CLI gracefully without an IPC parent', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'canofold-dev-stop-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'docs'))
  await writeFile(join(cwd, 'docs/index.md'), '# Standalone preview')
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../../dist/cli.js', import.meta.url)), 'dev', '--port', '3333'],
    {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  const exited = once(child, 'exit')
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await exited
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  await vi.waitFor(() => expect(output).toContain('Dev server running at http://127.0.0.1:'), {
    timeout: 10000
  })
  child.kill('SIGTERM')
  expect(await exited).toEqual([0, null])
})

it('rejects a second CLI without rebuilding and recovers immediately after its owner is killed', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'canofold-dev-restart-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'docs'))
  await writeFile(join(cwd, 'docs/index.md'), '# Restartable preview')
  const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url))
  const start = () => {
    const child = spawn(process.execPath, [cli, 'dev', '--port', '3333'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const exited = once(child, 'exit')
    onTestFinished(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      await exited
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    return {
      child,
      exited,
      ready: () =>
        vi.waitFor(
          () => {
            expect(output).toContain('Dev server running at http://127.0.0.1:')
          },
          { timeout: 10000 }
        )
    }
  }
  const first = start()
  await first.ready()
  const lockPath = join(cwd, '.canofold/dev.lock')
  expect(JSON.parse(await readFile(lockPath, 'utf8')).pid).toBe(first.child.pid)
  const duplicate = await promisify(execFile)(process.execPath, [cli, 'dev', '--port', '4333'], {
    cwd,
    timeout: 5000
  }).catch((error: unknown) => error as Error & { stdout: string; stderr: string })
  expect(duplicate).toMatchObject({ code: 1, killed: false, signal: null })
  expect(duplicate.stderr).toMatch(/Canofold dev.*already running/)
  expect(duplicate.stdout).not.toContain('Built')
  first.child.kill('SIGKILL')
  await first.exited
  const restarted = start()
  await restarted.ready()
  expect(JSON.parse(await readFile(lockPath, 'utf8')).pid).toBe(restarted.child.pid)
  restarted.child.kill('SIGTERM')
  expect(await restarted.exited).toEqual([0, null])
  await expect(readFile(lockPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('prints a reachable development address including the site base path', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'canofold-dev-url-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  await mkdir(join(cwd, 'docs'))
  await writeFile(join(cwd, 'docs/index.md'), '# Mounted preview')
  await writeFile(join(cwd, 'canofold.config.ts'), "export default { basePath: '/manual/' }")
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  onTestFinished(() => log.mockRestore())
  const server = await runDev({ cwd, port: 0 })
  onTestFinished(() => server.close())
  const url = `http://127.0.0.1:${server.port}/manual/`
  expect(log.mock.calls.flat().join('\n')).toContain(`Dev server running at ${url}`)
  expect(await (await fetch(url)).text()).toContain('Mounted preview')
  expect((await fetch(`http://127.0.0.1:${server.port}/`)).status).toBe(404)
})
