import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

import { promisify } from 'node:util'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const execFileAsync = promisify(execFile)

async function assertExists(path, label) {
  await assert.doesNotReject(() => access(path), `${label}: ${path}`)
}

async function importInChild(importPath, expression = 'true') {
  const url = pathToFileURL(importPath).href
  await execFileAsync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const module = await import(${JSON.stringify(url)}); if (!(${expression})) process.exitCode = 1; process.exit(process.exitCode ?? 0)`
    ],
    { timeout: 30_000 }
  )
}

test('target package export maps point to existing and loadable artifacts', async () => {
  for (const packageDirectory of ['packages/markdown', 'packages/docfuse', 'packages/plugins']) {
    const directory = join(root, packageDirectory)
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))

    for (const [subpath, conditions] of Object.entries(manifest.exports)) {
      const importTarget = typeof conditions === 'string' ? conditions : conditions.import
      const typeTarget = typeof conditions === 'string' ? null : conditions.types

      assert.ok(importTarget, `${manifest.name}${subpath} must expose an import target`)
      const importPath = resolve(directory, importTarget)
      await assertExists(importPath, `${manifest.name}${subpath} import target`)

      if (typeTarget) {
        await assertExists(resolve(directory, typeTarget), `${manifest.name}${subpath} type target`)
      }

      if (extname(importPath) === '.js') {
        await importInChild(importPath)
      }
    }
  }
})

test('published JavaScript entry points expose only the documented runtime API', async () => {
  const contracts = new Map([
    [
      'packages/docfuse/dist/index.js',
      [
        'DOCFUSE_EXTENSION_API_VERSION',
        'defineConfig',
        'defineExtension',
        'defineSearchProvider',
        'docfuseVersion'
      ]
    ],
    [
      'packages/plugins/dist/index.js',
      ['externalLinks', 'kroki', 'linkCard', 'math', 'mermaid', 'pagefind', 'plantUml', 'readingTime']
    ],
    ['packages/markdown/dist/index.js', ['Markdown', 'defineMarkdownPlugin']],
    ['packages/markdown/dist/client/index.js', ['enhanceMarkdown']],
    ['packages/markdown/dist/server.js', ['createMarkdownRenderer', 'defineMarkdownPlugin']],
    [
      'packages/markdown/dist/server/analyze.js',
      ['analyzeMarkdown', 'analyzeMdxModuleBoundary', 'detectMarkdownAssets']
    ],
    [
      'packages/markdown/dist/theme.js',
      [
        'DEFAULT_MARKDOWN_THEME',
        'DEFAULT_SEMANTIC_COLORS',
        'MARKDOWN_THEME_VARIABLES',
        'markdownThemeDeclarations',
        'resolveMarkdownTheme'
      ]
    ]
  ])

  for (const [relativePath, expectedExports] of contracts) {
    const module = await import(pathToFileURL(join(root, relativePath)).href)
    assert.deepEqual(
      Object.keys(module).sort(),
      expectedExports.sort(),
      `${relativePath} export contract changed`
    )
  }
})

test('Docfuse config declarations expose the contract without bundling the Zod schema', async () => {
  const declarations = await readFile(join(root, 'packages/docfuse/dist/index.d.ts'), 'utf8')
  assert.doesNotMatch(declarations, /from ['"]zod['"]|\bZod[A-Z]/)
  assert.ok(Buffer.byteLength(declarations) < 15 * 1024, 'docfuse declarations must stay below 15 KB')
})

test('plugin declarations do not require the Docfuse runtime package', async () => {
  const declarations = await Promise.all(
    ['index.d.ts', 'pagefind.d.ts'].map((file) => readFile(join(root, 'packages/plugins/dist', file), 'utf8'))
  )
  for (const declaration of declarations) assert.doesNotMatch(declaration, /from ['"]docfuse['"]/)
})
