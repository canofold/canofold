import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(repoRoot, 'packages/docfuse/package.json'))
const { build } = require('esbuild') as typeof import('esbuild')

describe('workspace development entrypoints', () => {
  it('links every worker without missing module exports', async () => {
    await expect(
      build({
        entryPoints: [
          join(repoRoot, 'scripts/dev/watchMarkdown.mjs'),
          join(repoRoot, 'scripts/dev/watchDocfuse.mjs'),
          join(repoRoot, 'scripts/dev/runLinkedSite.mjs')
        ],
        bundle: true,
        format: 'esm',
        logLevel: 'silent',
        outdir: join(repoRoot, '.docfuse-dev/link-check'),
        packages: 'external',
        platform: 'node',
        write: false
      })
    ).resolves.toBeDefined()
  })
})
