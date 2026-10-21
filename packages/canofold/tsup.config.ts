import { defineConfig, type Options } from 'tsup'
import { readFileSync } from 'node:fs'
import { copyFile, cp } from 'node:fs/promises'
import { signalWatchBuild } from '../../scripts/watchSignal'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig((overrideOptions): Options[] => [
  {
    entry: {
      cli: 'src/cli.ts',
      index: 'src/index.ts',
      'demo-engine': 'src/demos/types.ts',
      'playground-client': 'src/render/playgroundClient.tsx',
      'search-client': 'src/render/searchClientRuntime.ts'
    },
    format: ['esm'],
    target: 'node22',
    dts: overrideOptions.watch ? false : true,
    clean: !overrideOptions.watch,
    splitting: true,
    sourcemap: Boolean(overrideOptions.watch),
    define: {
      __CANOFOLD_VERSION__: JSON.stringify(pkg.version)
    },
    async onSuccess() {
      await copyFile('src/render/styles.input.css', 'dist/styles.input.css')
      await cp('src/assets/brand', 'dist/brand', { recursive: true })
      if (overrideOptions.watch) await signalWatchBuild('canofold')
    },
    esbuildOptions(options) {
      // Watch builds retain names for debugging. Published code does not rely on
      // Function.name; avoid restoring every minified internal name at runtime.
      options.keepNames = Boolean(overrideOptions.watch)
      options.minifyIdentifiers = true
      options.minifySyntax = true
      options.minifyWhitespace = true
    }
  },
  {
    entry: { 'shell-client': 'src/client/index.ts' },
    format: ['esm'],
    platform: 'browser',
    target: 'es2022',
    splitting: false,
    clean: false,
    dts: false,
    minify: true,
    sourcemap: false,
    async onSuccess() {
      if (overrideOptions.watch) await signalWatchBuild('canofold-shell')
    }
  }
])
