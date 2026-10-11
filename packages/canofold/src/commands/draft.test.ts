import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { runBuild } from './build'

describe('draft authoring boundary', () => {
  it('previews drafts locally and removes them again from every published output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-draft-boundary-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/draft.md'), '---\nstatus: draft\n---\n# Secret draft phrase')
    const output = join(cwd, '.canofold/dist')
    const draftHtml = join(output, 'draft/index.html')

    await runBuild({ cwd })
    await expect(access(draftHtml)).rejects.toMatchObject({ code: 'ENOENT' })

    await runBuild({ cwd, demoMode: 'dev' })
    const preview = await readFile(draftHtml, 'utf8')
    expect(preview).toContain('草稿预览 · 不会发布')
    expect(preview).toContain('name="robots" content="noindex, nofollow"')

    await runBuild({ cwd })
    await expect(access(draftHtml)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(output, 'draft/index.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    for (const path of ['ai/pages.json', 'ai/index.md', 'search/zh.json']) {
      expect(await readFile(join(output, path), 'utf8')).not.toContain('Secret draft phrase')
      expect(await readFile(join(output, path), 'utf8')).not.toContain('/draft/')
    }
  })
})
