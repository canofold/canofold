import { defineConfig } from 'vite'
import { onMarkdownBuildWarning } from './vite.shared.ts'
import { signalWatchBuild } from '../../scripts/watchSignal.ts'

export default defineConfig({
  plugins: [
    {
      name: 'canofold-markdown-client-watch-signal',
      writeBundle: () => signalWatchBuild('markdown-client')
    }
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    outDir: 'dist/client',
    emptyOutDir: false,
    lib: {
      entry: 'src/client.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rolldownOptions: {
      onwarn: onMarkdownBuildWarning,
      external: [/^node:/],
      output: {
        manualChunks(id) {
          if (/\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:react|react-dom|scheduler)\//.test(id)) {
            return 'react-runtime'
          }
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
