import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { externalPackageNames, onMarkdownBuildWarning } from './vite.shared'

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}
const externalPackages = externalPackageNames(manifest)

function isExternal(id: string) {
  return /^node:/.test(id) || externalPackages.some((name) => id === name || id.startsWith(`${name}/`))
}

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        'server/analyze': 'src/server/analyze.ts',
        theme: 'src/theme.ts'
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      onwarn: onMarkdownBuildWarning,
      external: isExternal
    }
  }
})
