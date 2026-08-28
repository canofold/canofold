import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pnpmCommand } from './lib/packageManager.mjs'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageRoot = join(workspace, 'packages/markdown')
const versions = process.env.REACT_VERSION ? [process.env.REACT_VERSION] : ['18.2.0', '18.3.1', '19.2.0']
const temporaryRoot = await mkdtemp(join(tmpdir(), 'docfuse-react-matrix-'))

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
}

try {
  run(pnpmCommand, ['pack', '--pack-destination', temporaryRoot], packageRoot)
  const tarballName = (await readdir(temporaryRoot)).find((name) => name.endsWith('.tgz'))
  if (!tarballName) throw new Error('Markdown package tarball was not created')
  const tarball = join(temporaryRoot, tarballName)

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
            '@docfuse/markdown': `file:${tarball}`,
            react: version,
            'react-dom': version
          }
        },
        null,
        2
      )
    )
    await writeFile(
      join(consumerRoot, 'test.mjs'),
      `
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@docfuse/markdown'
import { createMarkdownRenderer } from '@docfuse/markdown/server'

if (!React.version.startsWith('${version.split('.')[0]}.')) {
  throw new Error('Expected React ${version}, received ' + React.version)
}
if (typeof Markdown !== 'function') throw new Error('Markdown public component is unavailable')

const renderer = createMarkdownRenderer()
const result = await renderer.render('::::tabs[Versions]\\n:::tab[React]\\nReact ${version}\\n:::\\n::::')
const unsafeResult = await renderer.render('[Unsafe](javascript:alert(1))')

const warnings = []
const originalError = console.error
console.error = (...args) => warnings.push(args.map(String).join(' '))
let html
try {
  html = renderToStaticMarkup(result.content)
} finally {
  console.error = originalError
}
if (!html.includes('data-df-component="markdown"') || !html.includes('data-df-component="tabs"')) {
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

    run(pnpmCommand, ['install', '--ignore-scripts', '--no-frozen-lockfile'], consumerRoot)
    run('node', ['test.mjs'], consumerRoot)
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
