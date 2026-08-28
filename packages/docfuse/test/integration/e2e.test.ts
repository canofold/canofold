import { access, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runBuild } from '../../src/commands/build'
import { runDeploy } from '../../src/commands/deploy'
import { runInit } from '../../src/commands/init'
import { trackedMkdtemp as mkdtemp } from '../fixtures'

describe('Docfuse E2E', () => {
  it('creates, builds, and prepares a deployable docs project', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-e2e-'))

    await runInit({ cwd, targetDir: 'my-docs' })
    const projectRoot = join(cwd, 'my-docs')
    await runBuild({ cwd: projectRoot })
    await runDeploy({ cwd: projectRoot })

    await access(join(projectRoot, '.docfuse/dist/index.html'))
    await access(join(projectRoot, '.docfuse/dist/guide/index.html'))
    await expect(access(join(projectRoot, '.docfuse/dist/en/index.html'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await access(join(projectRoot, '.docfuse/dist/llms.txt'))
    await access(join(projectRoot, '.docfuse/dist/llms-full.txt'))
    await access(join(projectRoot, '.docfuse/dist/ai/pages.json'))
    await access(join(projectRoot, '.docfuse/dist/search/zh.json'))
    await access(join(projectRoot, '.docfuse/deploy/README.md'))

    const guide = await readFile(join(projectRoot, '.docfuse/deploy/README.md'), 'utf8')
    expect(guide).toContain('Docfuse does not provide hosting')
  })
})
