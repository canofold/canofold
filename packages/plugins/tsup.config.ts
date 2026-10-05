import { defineConfig, type Options } from 'tsup'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { signalWatchBuild } from '../../scripts/watchSignal'

const execFileAsync = promisify(execFile)

export default defineConfig((overrideOptions): Options[] => [
  {
    entry: {
      index: 'src/index.ts',
      'external-links': 'src/external-links/index.ts',
      'reading-time': 'src/reading-time/index.ts',
      'link-card': 'src/link-card/index.ts',
      kroki: 'src/kroki/index.ts',
      mermaid: 'src/mermaid/index.ts',
      plantuml: 'src/plantuml/index.ts',
      math: 'src/math/index.ts',
      pagefind: 'src/pagefind/index.ts'
    },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    dts: true,
    clean: !overrideOptions.watch,
    // Each public subpath is self-contained so publishing focused entries does
    // not create a second layer of generated shared chunks and source maps.
    splitting: false,
    sourcemap: false,
    external: ['@canofold/markdown', 'canofold', 'katex', 'pagefind', 'rehype-katex', 'remark-math'],
    onSuccess: () => signalWatchBuild('plugins-node')
  },
  {
    entry: {
      'client/kroki': 'src/client/kroki.ts',
      'client/mermaid': 'src/client/mermaid.ts',
      'client/plantuml': 'src/client/plantuml.ts'
    },
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    dts: false,
    clean: false,
    // Client shells stay self-contained. Large package runtimes are declared as
    // plugin resources and copied by the Canofold host instead of entering npm tarballs.
    splitting: false,
    sourcemap: false,
    async onSuccess() {
      if (!overrideOptions.watch) return
      await execFileAsync(process.execPath, ['scripts/verify-client-assets.mjs'])
      await execFileAsync(process.execPath, ['scripts/build-math-css.mjs'])
      await signalWatchBuild('plugins-client')
    }
  }
])
