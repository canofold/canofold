import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runCli } from './cliRunner'

async function unusedPort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return address.port
}

describe('runCli', () => {
  it('prints help and rejects invalid commands and missing option values', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-cli-invalid-'))
    try {
      await expect(runCli(['--help'])).resolves.toBeUndefined()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Commands:'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('--locale <locale>'))
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('--watch-source'))
      await expect(runCli(['unknown'])).rejects.toThrow('Unknown command: unknown')
      await expect(runCli(['preview', '--port'])).rejects.toThrow('Missing value for --port')
      await expect(runCli(['build', '--definitely-unknown'], cwd)).rejects.toThrow(
        'Unknown option: --definitely-unknown'
      )
    } finally {
      log.mockRestore()
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('routes every command through the real command implementation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docfuse-cli-router-'))
    const cwd = join(root, 'project')
    await runCli(['init', 'project'], root)

    try {
      await runCli(['build'], cwd)
      await runCli(['check'], cwd)
      await runCli(['deploy'], cwd)

      const preview = (await runCli(['preview', '--port', String(await unusedPort())], cwd)) as {
        close(): Promise<void>
      }
      await preview.close()

      const dev = (await runCli(['dev', '--port', String(await unusedPort())], cwd)) as {
        close(): Promise<void>
      }
      await dev.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('creates an English single-language project through the CLI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docfuse-cli-init-en-'))
    try {
      await runCli(['init', '--locale', 'en', 'english-docs'], root)

      const index = await readFile(join(root, 'english-docs/docs/index.md'), 'utf8')
      const config = await readFile(join(root, 'english-docs/docfuse.config.ts'), 'utf8')
      expect(index).toContain('# Welcome to Docfuse')
      expect(config).toContain("defaultLocale: 'en'")
      expect(config).toContain("locales: ['en']")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
