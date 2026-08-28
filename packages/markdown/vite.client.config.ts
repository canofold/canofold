import { defineConfig } from 'vite'
import { onMarkdownBuildWarning } from './vite.shared'

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    outDir: 'dist/client',
    emptyOutDir: false,
    lib: {
      entry: 'src/client.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
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
