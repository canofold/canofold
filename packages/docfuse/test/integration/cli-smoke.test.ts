import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const cliPath = resolve(repoRoot, 'packages/docfuse/dist/cli.js')

describe('CLI smoke', () => {
  it('prints help', async () => {
    const result = await execFileAsync('node', [cliPath, '--help'], { cwd: repoRoot })
    expect(result.stdout).toContain('docfuse')
    expect(result.stdout).toContain('build')
    expect(result.stdout).toContain('--locale')
  }, 30_000)

  it('reports a missing preview port value without starting a server', async () => {
    await expect(
      execFileAsync('node', [cliPath, 'preview', '--port'], { cwd: repoRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Missing value for --port')
    })
  }, 30_000)

  it('creates a selected single-language project through the published CLI', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-cli-smoke-init-'))
    try {
      await execFileAsync('node', [cliPath, 'init', '--locale', 'en'], { cwd })
      await expect(readFile(join(cwd, 'docs/index.md'), 'utf8')).resolves.toContain('# Welcome to Docfuse')
      await expect(readFile(join(cwd, 'docfuse.config.ts'), 'utf8')).resolves.toContain("locales: ['en']")
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }, 30_000)

  it('does not guess the language of existing documents in a non-interactive process', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-cli-smoke-adopt-'))
    try {
      await mkdir(join(cwd, 'docs'))
      await writeFile(join(cwd, 'docs/index.md'), '# Existing')
      await expect(execFileAsync('node', [cliPath, 'init'], { cwd })).rejects.toMatchObject({
        stderr: expect.stringContaining('cannot determine their language in a non-interactive environment')
      })
      await expect(access(join(cwd, 'docfuse.config.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }, 30_000)
})
