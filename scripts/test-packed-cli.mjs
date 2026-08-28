import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execPnpmSync } from './lib/packageManager.mjs'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const temporaryRoot = await mkdtemp(join(tmpdir(), 'docfuse-packed-cli-'))
const packsRoot = join(temporaryRoot, 'packs')
const consumerRoot = join(temporaryRoot, 'consumer')
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

try {
  const markdownPackage = await pack(join(workspace, 'packages/markdown'))
  const docfusePackage = await pack(join(workspace, 'packages/docfuse'))
  const pluginsPackage = await pack(join(workspace, 'packages/plugins'))
  await mkdir(consumerRoot)

  await write(
    'package.json',
    `${JSON.stringify(
      {
        name: 'docfuse-packed-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [markdownPackage.manifest.name]:
            `file:${portableRelativePath(consumerRoot, markdownPackage.tarball)}`,
          [docfusePackage.manifest.name]:
            `file:${portableRelativePath(consumerRoot, docfusePackage.tarball)}`,
          [pluginsPackage.manifest.name]:
            `file:${portableRelativePath(consumerRoot, pluginsPackage.tarball)}`,
          pagefind: pluginsPackage.manifest.peerDependencies.pagefind
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
  '${docfusePackage.manifest.name}@${docfusePackage.manifest.version}': file:${portableRelativePath(consumerRoot, docfusePackage.tarball)}
`
  )

  runPnpm(['install', '--prefer-offline', '--ignore-scripts', '--store-dir', workspaceStore])
  runPnpm(['exec', 'docfuse', 'init', '--locale', 'en'])
  await assertExists('docfuse.config.ts')
  await assertExists('docs/index.md')

  await write(
    'docfuse.config.mts',
    `import { pagefind } from '@docfuse/plugins/pagefind'
import type { DocfuseConfigInput } from 'docfuse'

export default {
  title: 'Packed RC',
  description: 'Packed release candidate fixture',
  requiredVersion: '${docfusePackage.manifest.version}',
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
} satisfies DocfuseConfigInput
`
  )
  await rm(join(consumerRoot, 'docfuse.config.ts'))
  await write(
    'release-extension.ts',
    `import { defineExtension } from 'docfuse'

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
    `---\ntitle: Packed home\ndescription: Release candidate home\n---\n\n# Packed home\n\nPACKED_TOKEN\n\n${longText}`
  )
  await write(
    'docs/guide/platform/internals/cache/index.md',
    `---\ntitle: Deep cache page\ngroup: Guide\n---\n\n# Deep cache page\n\nThe recursive sidebar supports this depth.\n`
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

  runPnpm(['exec', 'docfuse', 'check'])
  const cleanBuild = runPnpm(['exec', 'docfuse', 'build', '--no-cache'])
  assert.match(cleanBuild, /Built .+\(clean: forced\)/)

  for (const output of [
    '.docfuse/dist/index.html',
    '.docfuse/dist/guide/platform/internals/cache/index.html',
    '.docfuse/dist/zh/index.html',
    '.docfuse/dist/v0/index.html',
    '.docfuse/dist/v0/zh/index.html',
    '.docfuse/dist/pagefind/pagefind.js',
    '.docfuse/dist/pagefind/pagefind-worker.js',
    '.docfuse/dist/ai/manifest.json',
    '.docfuse/dist/llms-full.txt',
    '.docfuse/dist/extensions/release-audit/result.json'
  ]) {
    await assertExists(output)
  }

  await assert.rejects(access(join(consumerRoot, '.docfuse/dist/pagefind/pagefind-ui.js')))
  const homeHtml = await readFile(join(consumerRoot, '.docfuse/dist/index.html'), 'utf8')
  assert.match(homeHtml, /Extension transformed/)
  assert.match(homeHtml, /href="#docfuse-main"/)
  assert.match(
    await readFile(join(consumerRoot, '.docfuse/dist/llms-full.txt'), 'utf8'),
    /ai\/manifest\.json/
  )

  const extensionOutput = JSON.parse(
    await readFile(join(consumerRoot, '.docfuse/dist/extensions/release-audit/result.json'), 'utf8')
  )
  assert.equal(extensionOutput.marker, 'packed')
  assert.equal(extensionOutput.pages, 6)

  const cachedBuild = runPnpm(['exec', 'docfuse', 'build'])
  assert.match(cachedBuild, /\(cache hit\)/)

  run('node', [
    '--input-type=module',
    '-e',
    `const api = await import('docfuse');
     for (const name of ['defineConfig', 'defineExtension', 'defineSearchProvider']) {
       if (typeof api[name] !== 'function') process.exit(1);
     }
     if (typeof api.DOCFUSE_EXTENSION_API_VERSION !== 'number') process.exit(2);
     if (api.docfuseVersion !== ${JSON.stringify(docfusePackage.manifest.version)}) process.exit(3);`
  ])

  console.log(
    `Packed CLI smoke passed: docfuse@${docfusePackage.manifest.version}, ${extensionOutput.pages} pages, Pagefind, AI shards, extension host, cache hit`
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
