import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
    'playground-client': 'src/render/playgroundClient.tsx',
    'search-client': 'src/render/searchClientRuntime.ts'
  },
  format: ['esm'],
  target: 'node22',
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
  define: {
    __CANOFOLD_VERSION__: JSON.stringify(pkg.version)
  },
  esbuildOptions(options) {
    options.keepNames = true
    options.minifyIdentifiers = true
    options.minifySyntax = true
    options.minifyWhitespace = true
  }
})
