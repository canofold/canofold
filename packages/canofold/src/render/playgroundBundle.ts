import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'
import type { CanofoldConfig } from '../config/types'

function jsonForJavaScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function playgroundRuntimeEntry() {
  const entry = import.meta.url.endsWith('.js') ? './playground-client.js' : './playgroundClient.tsx'
  return fileURLToPath(new URL(entry, import.meta.url))
}

export async function buildPlaygroundBundle(cwd: string, outputRoot: string, config: CanofoldConfig) {
  const target = join(outputRoot, 'assets/canofold-playground')
  await rm(target, { recursive: true, force: true })

  const descriptors = config.markdown.plugins.map((plugin) => {
    if (!plugin.browserCompiler) {
      throw new Error(
        `Markdown plugin "${plugin.name}" must declare browserCompiler to support Playground realtime preview`
      )
    }
    return plugin.browserCompiler
  })
  const imports = descriptors
    .map(
      (descriptor, index) =>
        `import { ${descriptor.exportName} as canofoldPlugin${index} } from ${jsonForJavaScript(descriptor.module)}`
    )
    .join('\n')
  const plugins = descriptors
    .map((descriptor, index) =>
      descriptor.options === undefined
        ? `canofoldPlugin${index}()`
        : `canofoldPlugin${index}(${jsonForJavaScript(descriptor.options)})`
    )
    .join(',\n  ')
  const markdown = {
    html: config.markdown.html,
    code: config.markdown.code,
    features: config.markdown.features
  }
  const contents = `import { mountPlaygrounds } from ${jsonForJavaScript(playgroundRuntimeEntry())}
${imports}

const options = {
  basePath: ${jsonForJavaScript(config.basePath)},
  markdown: { ...${jsonForJavaScript(markdown)}, plugins: [
  ${plugins}
  ] }
}
window.__canofoldBootstrapPlayground = () => mountPlaygrounds(options)
window.__canofoldBootstrapPlayground()`

  await build({
    absWorkingDir: cwd,
    stdin: {
      contents,
      loader: 'js',
      resolveDir: cwd,
      sourcefile: 'canofold-playground-entry.js'
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outdir: target,
    entryNames: 'index',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    splitting: true,
    minify: true,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    logLevel: 'silent'
  })
}
