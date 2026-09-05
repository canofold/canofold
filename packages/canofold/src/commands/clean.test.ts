import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { runBuild } from './build'
import { runClean } from './clean'

describe('runClean', () => {
  it('removes generated output and persistent build state', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-clean-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await runBuild({ cwd })
    const outputRoot = join(cwd, '.canofold/dist')
    const atomicParent = dirname(outputRoot)
    const atomicName = basename(outputRoot)
    const staleTemporary = join(atomicParent, `.${atomicName}.tmp-11111111-1111-4111-8111-111111111111`)
    const staleBackup = join(atomicParent, `.${atomicName}.backup`)
    const legacyBackup = join(atomicParent, `.${atomicName}.backup-22222222-2222-4222-8222-222222222222`)
    const unrelated = join(atomicParent, `.${atomicName}.tmp-not-a-build-id`)
    await mkdir(staleTemporary, { recursive: true })
    await mkdir(staleBackup, { recursive: true })
    await mkdir(legacyBackup, { recursive: true })
    await writeFile(unrelated, 'keep')
    await mkdir(join(cwd, '.canofold/tmp/stale-config'), { recursive: true })
    await writeFile(join(cwd, '.canofold/tmp/stale-config/config.mjs'), 'export default {}')

    await runClean({ cwd })

    await expect(access(join(cwd, '.canofold/dist'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(cwd, '.canofold/cache/build-manifest.json'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expect(access(join(cwd, '.canofold/cache'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(cwd, '.canofold/tmp'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(staleTemporary)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(staleBackup)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(legacyBackup)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(unrelated, 'utf8')).resolves.toBe('keep')
    await expect(readFile(join(cwd, 'docs/zh/index.md'), 'utf8')).resolves.toBe('# Home')
  })
})
