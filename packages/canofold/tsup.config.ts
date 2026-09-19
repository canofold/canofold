import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'
import { copyFile, cp } from 'node:fs/promises'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig((overrideOptions) => ({
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
  sourcemap: true,
  define: {
    __CANOFOLD_VERSION__: JSON.stringify(pkg.version)
  },
  async onSuccess() {
    await copyFile('src/render/styles.input.css', 'dist/styles.input.css')
    await cp('src/assets/brand', 'dist/brand', { recursive: true })
  },
  esbuildOptions(options) {
    options.keepNames = true
    options.minifyIdentifiers = true
    options.minifySyntax = true
    options.minifyWhitespace = true
  }
}))
