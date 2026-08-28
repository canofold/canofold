import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createMockConfig,
  createMockGraph,
  createMockPage,
  trackedMkdtemp as mkdtemp
} from '../../test/fixtures'
import { createBuildManifest, fingerprintExistingFiles } from './state'

describe('build state support-file fingerprints', () => {
  it('ignores missing files but surfaces other read errors', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-state-files-'))
    const directory = join(cwd, 'directory')
    await mkdir(directory)

    await expect(fingerprintExistingFiles([join(cwd, 'missing.css')])).resolves.toBeTypeOf('string')
    await expect(fingerprintExistingFiles([directory])).rejects.toMatchObject({ code: 'EISDIR' })
  })

  it('invalidates shared assets when the site gains or loses its first playground', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-state-playground-'))
    await mkdir(join(cwd, 'docs'))
    const config = createMockConfig()
    const documentPage = createMockPage()
    const playgroundPage = createMockPage({ frontmatter: { layout: 'playground' } })

    const documentManifest = await createBuildManifest(
      cwd,
      config,
      createMockGraph({ pages: [documentPage] })
    )
    const playgroundManifest = await createBuildManifest(
      cwd,
      config,
      createMockGraph({ pages: [playgroundPage] })
    )

    expect(playgroundManifest.sharedFingerprint).not.toBe(documentManifest.sharedFingerprint)
  })
})
