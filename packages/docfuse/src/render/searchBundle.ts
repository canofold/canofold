import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function searchRuntimeEntry() {
  const entry = import.meta.url.endsWith('.js') ? './search-client.js' : './searchClientRuntime.ts'
  return fileURLToPath(new URL(entry, import.meta.url))
}

export async function buildSearchBundle(outputRoot: string) {
  const { build } = await import('esbuild')
  const outfile = join(outputRoot, 'assets/docfuse-search.js')
  await mkdir(dirname(outfile), { recursive: true })
  await build({
    entryPoints: [searchRuntimeEntry()],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    outfile,
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent'
  })
}
