import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { externalPackageNames, onMarkdownBuildWarning } from './vite.shared'

const packageRoot = fileURLToPath(new URL('.', import.meta.url))
const sourceRoot = resolve(packageRoot, 'src')
const outputRoot = resolve(packageRoot, 'dist')
const sourceTokens = resolve(sourceRoot, 'tokens.css')
const sourceFileIcons = resolve(sourceRoot, 'assets/file-icons')

function markdownAssets(): Plugin {
  return {
    name: 'canofold-markdown-assets',
    async buildStart() {
      this.addWatchFile(sourceTokens)
      this.addWatchFile(sourceFileIcons)
      for (const filename of await readdir(sourceFileIcons)) {
        this.addWatchFile(resolve(sourceFileIcons, filename))
      }
    },
    async writeBundle() {
      const outputFileIcons = resolve(outputRoot, 'file-icons')
      await mkdir(outputRoot, { recursive: true })
      await writeFile(resolve(outputRoot, 'theme.css'), await readFile(sourceTokens, 'utf8'))
      await rm(resolve(outputRoot, 'math.css'), { force: true })
      await rm(resolve(outputRoot, 'fonts'), { recursive: true, force: true })
      await rm(outputFileIcons, { recursive: true, force: true })
      await mkdir(outputFileIcons, { recursive: true })
      for (const filename of await readdir(sourceFileIcons)) {
        await copyFile(resolve(sourceFileIcons, filename), resolve(outputFileIcons, filename))
      }
    }
  }
}

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}
const externalPackages = externalPackageNames(manifest)

function isExternal(id: string) {
  return /^node:/.test(id) || externalPackages.some((name) => id === name || id.startsWith(`${name}/`))
}

export default defineConfig(({ mode }) => ({
  plugins: [markdownAssets()],
  build: {
    emptyOutDir: mode !== 'development',
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: {
        index: 'src/index.ts',
        'client/bundler': 'src/client.ts',
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
}))
