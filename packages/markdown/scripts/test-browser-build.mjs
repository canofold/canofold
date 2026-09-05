import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const consumerRoot = await mkdtemp(join(tmpdir(), 'canofold-markdown-browser-'))
const entry = join(consumerRoot, 'entry.js')

await writeFile(
  entry,
  [
    `import { Markdown } from ${JSON.stringify(join(packageRoot, 'dist/index.js'))}`,
    `import { enhanceMarkdown } from ${JSON.stringify(join(packageRoot, 'dist/client/index.js'))}`,
    "globalThis.__CANOFOLD_BROWSER_CONSUMER__ = { Markdown, enhanceMarkdown, source: '# Browser consumer' }"
  ].join('\n')
)

const result = await build({
  configFile: false,
  root: consumerRoot,
  logLevel: 'silent',
  build: {
    target: 'es2022',
    write: false,
    rollupOptions: { input: entry }
  }
})

const builds = Array.isArray(result) ? result : [result]
const chunks = builds.flatMap((item) => item.output).filter((item) => item.type === 'chunk')
const code = chunks.map((item) => item.code).join('\n')

const nodeBuiltinImports = chunks
  .flatMap((chunk) => [...chunk.imports, ...chunk.dynamicImports])
  .filter((id) => id.startsWith('node:'))
const nodeBuiltinSyntax = code.match(/(?:from\s*|import\s*\(\s*)["']node:[^"']+/g)
if (nodeBuiltinImports.length || nodeBuiltinSyntax) {
  throw new Error(
    `Browser consumer contains a Node.js builtin import:\n${[
      ...nodeBuiltinImports,
      ...(nodeBuiltinSyntax ?? [])
    ].join('\n')}`
  )
}
if (!code.includes('Browser consumer')) throw new Error('Browser consumer entry was not bundled')

const clientTypes = await readFile(join(packageRoot, 'dist/client.d.ts'), 'utf8')
if (/\b(?:components|slots|hydrateMarkdownIslands)\b/.test(clientTypes))
  throw new Error('The client contract must not expose React component or Islands implementation details')

const componentMapTypes = await readFile(join(packageRoot, 'dist/react/componentMap.d.ts'), 'utf8')
const intrinsicComponentTypes = componentMapTypes.match(
  /export type MarkdownIntrinsicComponents = \{[\s\S]*?\n\};/
)?.[0]
if (!intrinsicComponentTypes || /\bnode\??:/.test(intrinsicComponentTypes))
  throw new Error('Public intrinsic component overrides must not expose the internal HAST node')

const declarationFiles = (await readdir(join(packageRoot, 'dist'), { recursive: true })).filter((file) =>
  file.endsWith('.d.ts')
)
const internalDeclarationLeaks = []
for (const declarationFile of declarationFiles) {
  const source = await readFile(join(packageRoot, 'dist', declarationFile), 'utf8')
  if (/\b(?:inner|serializedTable)\??:/.test(source)) internalDeclarationLeaks.push(declarationFile)
}
if (internalDeclarationLeaks.length) {
  throw new Error(`Internal renderer props leaked into declarations:\n${internalDeclarationLeaks.join('\n')}`)
}

console.log('Browser Vite consumer passed')
