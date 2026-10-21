import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execPnpmSync } from './lib/packageManager.mjs'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const markdownPackageRoot = join(workspace, 'packages/markdown')
const themesPackageRoot = join(workspace, 'packages/themes')
const viteVersion = JSON.parse(
  await readFile(join(workspace, 'packages/vite/node_modules/vite/package.json'), 'utf8')
).version
const versions = process.env.REACT_VERSION
  ? [process.env.REACT_VERSION]
  : ['18.2.0', '18.3.1', '19.2.0', '19.3.0']
const temporaryRoot = await mkdtemp(join(tmpdir(), 'canofold-react-matrix-'))

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
}

function runPnpm(args, cwd) {
  execPnpmSync(args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
}

async function pack(packageRoot, destination) {
  await mkdir(destination, { recursive: true })
  runPnpm(['pack', '--pack-destination', destination], packageRoot)
  const tarballName = (await readdir(destination)).find((name) => name.endsWith('.tgz'))
  if (!tarballName) throw new Error(`${packageRoot} package tarball was not created`)
  return join(destination, tarballName)
}

try {
  const markdownTarball = await pack(markdownPackageRoot, join(temporaryRoot, 'markdown'))
  const themesTarball = await pack(themesPackageRoot, join(temporaryRoot, 'themes'))

  for (const version of versions) {
    const consumerRoot = join(temporaryRoot, `react-${version}`)
    await mkdir(consumerRoot, { recursive: true })
    await writeFile(
      join(consumerRoot, 'package.json'),
      JSON.stringify(
        {
          private: true,
          type: 'module',
          dependencies: {
            '@canofold/markdown': `file:${markdownTarball}`,
            '@canofold/themes': `file:${themesTarball}`,
            react: version,
            'react-dom': version,
            vite: viteVersion
          }
        },
        null,
        2
      )
    )
    await writeFile(
      join(consumerRoot, 'pnpm-workspace.yaml'),
      `packages: []\noverrides:\n  '@canofold/themes': file:${themesTarball}\n`
    )
    await writeFile(
      join(consumerRoot, 'test.mjs'),
      `
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@canofold/markdown'
import { createMarkdownRenderer } from '@canofold/markdown/server'

if (!React.version.startsWith('${version.split('.')[0]}.')) {
  throw new Error('Expected React ${version}, received ' + React.version)
}
if (typeof Markdown !== 'function') throw new Error('Markdown public component is unavailable')

const renderer = createMarkdownRenderer()
const result = await renderer.render('::::tabs[Versions]\\n:::tab[React]\\nReact ${version}\\n:::\\n::::')
const unsafeResult = await renderer.render('[Unsafe](javascript:alert(1))')
const richResult = await renderer.render('![Photo](photo.png)\\n\\n| Value |\\n| --- |\\n| One |')
const richHtml = renderToStaticMarkup(richResult.content)
const buttons = richHtml.match(/<button\\b[^>]*>/g) || []
for (const action of ['zoom-image', 'zoom-table', 'copy-table', 'sort-table']) {
  if (!buttons.some(button => button.includes('data-cf-action="' + action + '"') && button.includes('disabled=""'))) {
    throw new Error('Static React-only control must wait for hydration: ' + action)
  }
}

const warnings = []
const originalError = console.error
console.error = (...args) => warnings.push(args.map(String).join(' '))
let html
try {
  html = renderToStaticMarkup(result.content)
} finally {
  console.error = originalError
}
if (!html.includes('data-cf-component="markdown"') || !html.includes('data-cf-component="tabs"')) {
  throw new Error('Markdown SSR output is incomplete')
}
if (warnings.length) throw new Error('Markdown SSR emitted React warnings: ' + warnings.join('\\n'))
const unsafeHtml = renderToStaticMarkup(unsafeResult.content)
if (unsafeHtml.includes('javascript:')) {
  throw new Error('Markdown SSR preserved an executable URL protocol: ' + unsafeHtml)
}

const fallback = renderToStaticMarkup(createElement(Markdown, {
  source: '# Browser entry',
  fallback: createElement('span', null, 'Preparing')
}))
if (!fallback.includes('Preparing')) throw new Error('Markdown browser entry could not render')
console.log('React ' + React.version + ' consumer passed')
`
    )
    await writeFile(
      join(consumerRoot, 'browser-entry.js'),
      `import React from 'react'
import { enhanceMarkdown } from '@canofold/markdown/client'
globalThis.__CANOFOLD_REACT_CONSUMER__ = { React, enhanceMarkdown }
`
    )
    await writeFile(
      join(consumerRoot, 'vite.config.js'),
      `function packageRoots(bundle, packageName) {
  const escapedName = packageName.replace('/', '\\/')
  const pattern = new RegExp('^(.*\\/node_modules\\/(?:\\.pnpm\\/[^/]+\\/node_modules\\/)?' + escapedName + ')(?:\\/|$)')
  const roots = new Set()
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue
    for (const id of Object.keys(output.modules)) {
      const match = id.replace(/^\\0/, '').replaceAll('\\\\', '/').match(pattern)
      if (match) roots.add(match[1])
    }
  }
  return [...roots]
}

export default {
  plugins: [{
    name: 'runtime-ownership-report',
    generateBundle(_options, bundle) {
      this.emitFile({
        type: 'asset',
        fileName: 'runtime-ownership.json',
        source: JSON.stringify({
          react: packageRoots(bundle, 'react'),
          reactDom: packageRoots(bundle, 'react-dom')
        })
      })
    }
  }],
  build: { target: 'es2022', rollupOptions: { input: 'browser-entry.js' } }
}
`
    )

    runPnpm(['install', '--ignore-scripts', '--no-frozen-lockfile'], consumerRoot)
    run('node', ['test.mjs'], consumerRoot)
    runPnpm(['exec', 'vite', 'build'], consumerRoot)
    const ownership = JSON.parse(await readFile(join(consumerRoot, 'dist/runtime-ownership.json'), 'utf8'))
    if (ownership.react.length !== 1 || ownership.reactDom.length !== 1) {
      throw new Error(
        `React ${version} browser consumer expected one React and React DOM package root, received ${JSON.stringify(ownership)}`
      )
    }
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
