import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `
      import { math } from './dist/index.js'
      globalThis.__canofoldPluginBrowserSmoke = math()
    `,
    resolveDir: process.cwd(),
    sourcefile: 'browser-consumer.mjs'
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  treeShaking: true,
  minify: true,
  write: false
})

const source = result.outputFiles[0]?.text ?? ''
if (!source.includes('__canofoldPluginBrowserSmoke')) {
  throw new Error('Plugin browser consumer bundle did not include the imported math factory')
}
if (/node:(?:fs|path|zlib)|Pagefind did not return an index/.test(source)) {
  throw new Error('Plugin browser consumer bundle retained Node-only provider code')
}
