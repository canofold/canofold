import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPreview } from './preview'

describe('runPreview', () => {
  it('starts and closes a preview server for generated output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-preview-'))
    await mkdir(join(cwd, '.docfuse/dist'), { recursive: true })
    await writeFile(join(cwd, '.docfuse/dist/index.html'), '<h1>Preview</h1>')
    const server = await runPreview({ cwd, port: 0 })

    try {
      expect(server.port).toBeGreaterThan(0)
    } finally {
      await server.close()
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
