import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runDev } from './dev'

describe('runDev', () => {
  it('starts and closes the real development build, watcher, and server', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-dev-command-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const server = await runDev({ cwd, port: 0 })

    try {
      expect(server.port).toBeGreaterThan(0)
    } finally {
      await server.close()
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
