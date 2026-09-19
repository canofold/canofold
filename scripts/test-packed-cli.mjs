import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { execPnpmSync } from './lib/packageManager.mjs'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const temporaryRoot = await mkdtemp(join(tmpdir(), 'canofold-packed-cli-'))
const packsRoot = join(temporaryRoot, 'packs')
const consumerRoot = join(temporaryRoot, 'consumer')
const viteVersion = process.env.VITE_VERSION
const reactVersion = process.env.REACT_VERSION
const markdownEntryBudget = 8 * 1024
const demoEntryBudget = 80 * 1024
const modulesState = await readFile(join(workspace, 'node_modules/.modules.yaml'), 'utf8')
const workspaceStore =
  modulesState.match(/^\s*["']?storeDir["']?:\s*["']([^"']+)["'],?\s*$/m)?.[1] ??
  execPnpmSync(['store', 'path'], { cwd: workspace, encoding: 'utf8' }).trim()

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: consumerRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  })
}

function runPnpm(args, options = {}) {
  return execPnpmSync(args, {
    cwd: consumerRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  })
}

function portableRelativePath(from, to) {
  return relative(from, to).split(sep).join('/')
}

async function gzipFiles(root, files) {
  const sources = await Promise.all(files.map((file) => readFile(join(root, file))))
  return sources.reduce((total, source) => total + gzipSync(source).byteLength, 0)
}

async function pack(packageRoot) {
  const packageManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  const destination = join(packsRoot, packageManifest.name.replaceAll('/', '-'))
  await mkdir(destination, { recursive: true })
  execPnpmSync(['pack', '--pack-destination', destination], {
    cwd: packageRoot,
    stdio: 'pipe'
  })
  const tarballName = (await readdir(destination)).find((name) => name.endsWith('.tgz'))
  if (!tarballName) throw new Error(`${packageManifest.name} tarball was not created`)
  return { manifest: packageManifest, tarball: join(destination, tarballName) }
}

async function write(relativePath, contents) {
  const path = join(consumerRoot, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
}

async function assertExists(relativePath) {
  await access(join(consumerRoot, relativePath))
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name)
        return entry.isDirectory() ? filesUnder(path) : [path]
      })
    )
  ).flat()
}

try {
  const markdownPackage = await pack(join(workspace, 'packages/markdown'))
  const canofoldPackage = await pack(join(workspace, 'packages/canofold'))
  const vitePackage = await pack(join(workspace, 'packages/vite'))
  const pluginsPackage = await pack(join(workspace, 'packages/plugins'))
  await mkdir(consumerRoot)

  await write(
    'package.json',
    `${JSON.stringify(
      {
        name: 'canofold-packed-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [markdownPackage.manifest.name]:
            `file:${portableRelativePath(consumerRoot, markdownPackage.tarball)}`,
          [canofoldPackage.manifest.name]:
            `file:${portableRelativePath(consumerRoot, canofoldPackage.tarball)}`,
          [vitePackage.manifest.name]: `file:${portableRelativePath(consumerRoot, vitePackage.tarball)}`,
          [pluginsPackage.manifest.name]:
            `file:${portableRelativePath(consumerRoot, pluginsPackage.tarball)}`,
          pagefind: pluginsPackage.manifest.peerDependencies.pagefind,
          react: reactVersion ?? canofoldPackage.manifest.dependencies.react,
          'react-dom': reactVersion ?? canofoldPackage.manifest.dependencies['react-dom'],
          vite: viteVersion ?? vitePackage.manifest.peerDependencies.vite.split(' || ')[0].replace('^', '')
        }
      },
      null,
      2
    )}\n`
  )
  await write(
    'pnpm-workspace.yaml',
    `packages: []
overrides:
  '${markdownPackage.manifest.name}@${markdownPackage.manifest.version}': file:${portableRelativePath(consumerRoot, markdownPackage.tarball)}
  '${canofoldPackage.manifest.name}@${canofoldPackage.manifest.version}': file:${portableRelativePath(consumerRoot, canofoldPackage.tarball)}
  '${vitePackage.manifest.name}@${vitePackage.manifest.version}': file:${portableRelativePath(consumerRoot, vitePackage.tarball)}
`
  )

  runPnpm(['install', '--prefer-offline', '--ignore-scripts', '--store-dir', workspaceStore])
  if (viteVersion) {
    const installedVite = JSON.parse(
      await readFile(join(consumerRoot, 'node_modules/vite/package.json'), 'utf8')
    )
    assert.equal(installedVite.version, viteVersion)
  }
  for (const declaration of [
    'node_modules/@canofold/markdown/dist/index.d.ts',
    'node_modules/canofold/dist/index.d.ts',
    'node_modules/@canofold/vite/dist/index.d.ts',
    'node_modules/@canofold/plugins/dist/index.d.ts'
  ]) {
    await assertExists(declaration)
  }
  const expectedLucideVersion = markdownPackage.manifest.dependencies['lucide-react']
  assert.equal(typeof expectedLucideVersion, 'string')
  for (const packageName of ['@canofold/markdown', 'canofold']) {
    const manifest = JSON.parse(
      await readFile(join(consumerRoot, 'node_modules', packageName, 'package.json'), 'utf8')
    )
    assert.equal(manifest.dependencies['lucide-react'], expectedLucideVersion)
  }
  runPnpm(['exec', 'canofold', 'init', '--locale', 'en'])
  await assertExists('canofold.config.ts')
  await assertExists('docs/index.md')

  await write(
    'canofold.config.mts',
    `import { pagefind } from '@canofold/plugins/pagefind'
import { vite } from '@canofold/vite'
import type { CanofoldConfigInput } from 'canofold'

export default {
  title: 'Packed RC',
  description: 'Packed release candidate fixture',
  requiredVersion: '${canofoldPackage.manifest.version}',
  demos: { engine: vite() },
  seo: { robots: 'disallow' },
  markdown: { code: { overflow: 'scroll' } },
  search: { provider: pagefind() },
  extensions: [{ resolve: './release-extension.ts', options: { marker: 'packed' } }],
  i18n: { defaultLocale: 'en', locales: ['en', 'zh'] },
  versions: {
    current: 'current',
    items: [
      { id: 'current', label: 'Current', docsDir: 'docs', base: '/' },
      { id: 'v0', label: 'v0', docsDir: 'versions/v0', base: '/v0/' }
    ]
  },
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownIndex: true,
    pageSummaries: true,
    codeExamples: true,
    chunkSizeBytes: 16384,
    llmsFullMaxBytes: 16384,
    llmsFullOverflow: 'manifest',
    versions: 'all'
  }
} satisfies CanofoldConfigInput
`
  )
  await write(
    'vite.config.mts',
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

function packageRootsForEntry(bundle, entryFile, packageName) {
  const escapedName = packageName.replace('/', '\\/')
  const pattern = new RegExp('^(.*\\/node_modules\\/(?:\\.pnpm\\/[^/]+\\/node_modules\\/)?' + escapedName + ')(?:\\/|$)')
  const roots = new Set()
  const visited = new Set()
  const visit = (fileName) => {
    if (visited.has(fileName)) return
    visited.add(fileName)
    const output = bundle[fileName]
    if (!output || output.type !== 'chunk') return
    for (const id of Object.keys(output.modules)) {
      const match = id.replace(/^\\0/, '').replaceAll('\\\\', '/').match(pattern)
      if (match) roots.add(match[1])
    }
    output.imports.forEach(visit)
  }
  visit(entryFile)
  return [...roots]
}

function staticEntryFiles(bundle, entryFile) {
  const files = new Set()
  const visit = (fileName) => {
    if (files.has(fileName)) return
    files.add(fileName)
    const output = bundle[fileName]
    if (!output || output.type !== 'chunk') return
    output.imports.forEach(visit)
  }
  visit(entryFile)
  return [...files]
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
          reactDom: packageRoots(bundle, 'react-dom'),
          markdownReact: packageRootsForEntry(bundle, 'markdown.js', 'react'),
          markdownReactDom: packageRootsForEntry(bundle, 'markdown.js', 'react-dom'),
          demoReact: packageRootsForEntry(bundle, 'index.js', 'react'),
          demoReactDom: packageRootsForEntry(bundle, 'index.js', 'react-dom'),
          markdownFiles: staticEntryFiles(bundle, 'markdown.js'),
          demoFiles: staticEntryFiles(bundle, 'index.js')
        })
      })
    }
  }]
}
`
  )
  await rm(join(consumerRoot, 'canofold.config.ts'))
  await write(
    'release-extension.ts',
    `import { defineExtension } from 'canofold'

export default defineExtension((options) => ({
  apiVersion: 1,
  name: 'release-audit',
  outputs: ['result.json'],
  transformSource({ source }) {
    return source.replaceAll('PACKED_TOKEN', 'Extension transformed')
  },
  async generate(context) {
    await context.emitFile(
      'result.json',
      JSON.stringify({ marker: options.marker, pages: context.pages.length })
    )
  }
}))
`
  )

  const longText = `${'Bounded AI output. '.repeat(1400)}\n`
  await write(
    'docs/index.md',
    `---\ntitle: Packed home\ndescription: Release candidate home\n---\n\n# Packed home\n\nPACKED_TOKEN\n\n::demo[Packed button]{src="/src/button.demo.tsx"}\n\n::demo[Packed iframe]{src="/src/button.demo.tsx" sandbox="iframe"}\n\n\`\`\`ts\nconst packedReleaseCandidate = 'a deliberately long code line used to verify configured horizontal scrolling'\n\`\`\`\n\n${longText}`
  )
  await write(
    'src/button.demo.tsx',
    `import './button.css'

export default function PackedButtonDemo() {
  return <button className="packed-button">Packed demo</button>
}
`
  )
  await write('src/button.css', '.packed-button { color: rgb(1 2 3); }\n')
  await write(
    'docs/guide/platform/internals/cache/index.md',
    `---\ntitle: Deep cache page\ngroup: Guide\n---\n\n# Deep cache page\n\nThe recursive sidebar supports this depth.\n\n| Mode | Owner |\n| --- | --- |\n| Markdown | Vite |\n`
  )
  await write(
    'docs/zh/index.md',
    `---\ntitle: 中文首页\ndescription: 发布候选中文页\n---\n\n# 中文首页\n\n跨语言构建。\n`
  )
  await write(
    'versions/v0/index.md',
    `---\ntitle: Archived home\n---\n\n# Archived home\n\nHistorical release.\n`
  )
  await write('versions/v0/zh/index.md', `---\ntitle: 历史首页\n---\n\n# 历史首页\n\n历史版本。\n`)

  runPnpm(['exec', 'canofold', 'check'])
  const cleanBuild = runPnpm(['exec', 'canofold', 'build', '--no-cache'])
  assert.match(cleanBuild, /Built .+\(clean: forced\)/)

  for (const output of [
    '.canofold/dist/index.html',
    '.canofold/dist/guide/platform/internals/cache/index.html',
    '.canofold/dist/zh/index.html',
    '.canofold/dist/v0/index.html',
    '.canofold/dist/v0/zh/index.html',
    '.canofold/dist/pagefind/pagefind.js',
    '.canofold/dist/pagefind/pagefind-worker.js',
    '.canofold/dist/assets/canofold-brand/logo-light.webp',
    '.canofold/dist/assets/canofold-brand/logo-dark.webp',
    '.canofold/dist/assets/canofold-brand/favicon.webp',
    '.canofold/dist/assets/canofold-demos/index.js',
    '.canofold/dist/assets/canofold-demos/markdown.js',
    '.canofold/dist/ai/manifest.json',
    '.canofold/dist/llms-full.txt',
    '.canofold/dist/extensions/release-audit/result.json'
  ]) {
    await assertExists(output)
  }

  await assert.rejects(access(join(consumerRoot, '.canofold/dist/pagefind/pagefind-ui.js')))
  const homeHtml = await readFile(join(consumerRoot, '.canofold/dist/index.html'), 'utf8')
  assert.match(homeHtml, /Extension transformed/)
  assert.match(homeHtml, /data-cf-component="demo"/)
  assert.match(homeHtml, /data-cf-demo-sandbox="iframe"/)
  assert.match(homeHtml, /data-cf-code-overflow="scroll"/)
  assert.match(homeHtml, /PackedButtonDemo/)
  assert.match(homeHtml, /href="#canofold-main"/)
  assert.match(homeHtml, /data-markdown-client-url="\/assets\/canofold-demos\/index\.js"/)
  const markdownOnlyHtml = await readFile(
    join(consumerRoot, '.canofold/dist/guide/platform/internals/cache/index.html'),
    'utf8'
  )
  assert.match(markdownOnlyHtml, /data-markdown-client-url="\/assets\/canofold-demos\/markdown\.js"/)
  assert.doesNotMatch(markdownOnlyHtml, /data-canofold-demo-client-url=/)
  const demoRoot = join(consumerRoot, '.canofold/dist/assets/canofold-demos')
  const demoFiles = await filesUnder(demoRoot)
  const demoJavaScript = await Promise.all(
    demoFiles.filter((path) => path.endsWith('.js')).map((path) => readFile(path, 'utf8'))
  )
  const demoCss = await Promise.all(
    demoFiles.filter((path) => path.endsWith('.css')).map((path) => readFile(path, 'utf8'))
  )
  const demoEntry = await readFile(join(demoRoot, 'index.js'), 'utf8')
  const runtimeOwnership = JSON.parse(await readFile(join(demoRoot, 'runtime-ownership.json'), 'utf8'))
  assert.ok(demoCss.some((source) => /packed-button/.test(source)))
  assert.doesNotMatch(demoEntry, /Packed demo/)
  assert.ok(demoJavaScript.some((source) => /Packed demo/.test(source)))
  assert.deepEqual(
    [runtimeOwnership.react.length, runtimeOwnership.reactDom.length],
    [1, 1],
    `Vite component output must resolve one React and React DOM package root: ${JSON.stringify(runtimeOwnership)}`
  )
  assert.deepEqual(
    [runtimeOwnership.markdownReact.length, runtimeOwnership.markdownReactDom.length],
    [0, 0],
    `Markdown-only entry must not statically load React: ${JSON.stringify(runtimeOwnership)}`
  )
  assert.deepEqual(
    [runtimeOwnership.demoReact.length, runtimeOwnership.demoReactDom.length],
    [1, 1],
    `Demo entry must resolve one React and React DOM package root: ${JSON.stringify(runtimeOwnership)}`
  )
  const markdownEntryBytes = await gzipFiles(demoRoot, runtimeOwnership.markdownFiles)
  const demoEntryBytes = await gzipFiles(demoRoot, runtimeOwnership.demoFiles)
  assert.ok(
    markdownEntryBytes <= markdownEntryBudget,
    `Markdown entry is ${markdownEntryBytes} gzip bytes; budget is ${markdownEntryBudget}`
  )
  assert.ok(
    demoEntryBytes <= demoEntryBudget,
    `Demo entry is ${demoEntryBytes} gzip bytes; budget is ${demoEntryBudget}`
  )
  await assert.rejects(access(join(demoRoot, 'styles.css')))
  await assert.rejects(access(join(consumerRoot, '.canofold/dist/assets/canofold-markdown')))
  const siteCss = await readFile(join(consumerRoot, '.canofold/dist/assets/canofold.css'), 'utf8')
  assert.doesNotMatch(siteCss, /\.cf-content \.cf-demo-preview\{[^}]*linear-gradient/)
  assert.equal(
    await readFile(join(consumerRoot, '.canofold/dist/robots.txt'), 'utf8'),
    'User-agent: *\nDisallow: /\n'
  )
  assert.match(
    await readFile(join(consumerRoot, '.canofold/dist/llms-full.txt'), 'utf8'),
    /ai\/manifest\.json/
  )

  const extensionOutput = JSON.parse(
    await readFile(join(consumerRoot, '.canofold/dist/extensions/release-audit/result.json'), 'utf8')
  )
  assert.equal(extensionOutput.marker, 'packed')
  assert.equal(extensionOutput.pages, 6)

  const cachedBuild = runPnpm(['exec', 'canofold', 'build'])
  assert.match(cachedBuild, /\(cache hit\)/)

  run('node', [
    '--input-type=module',
    '-e',
    `const api = await import('canofold');
     for (const name of ['defineConfig', 'defineExtension', 'defineSearchProvider']) {
       if (typeof api[name] !== 'function') process.exit(1);
     }
     if (typeof api.CANOFOLD_EXTENSION_API_VERSION !== 'number') process.exit(2);
     if (api.canofoldVersion !== ${JSON.stringify(canofoldPackage.manifest.version)}) process.exit(3);`
  ])

  console.log(
    `Packed CLI smoke passed: canofold@${canofoldPackage.manifest.version}, ${extensionOutput.pages} pages, Markdown ${(markdownEntryBytes / 1024).toFixed(2)} KiB gzip, Demo ${(demoEntryBytes / 1024).toFixed(2)} KiB gzip, Pagefind, AI shards, extension host, cache hit`
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
