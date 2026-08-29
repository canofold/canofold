import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (['dist', 'node_modules', '.docfuse', 'coverage'].includes(entry.name)) continue
      files.push(...(await sourceFiles(path)))
      continue
    }
    if (!/\.(?:ts|tsx|js|jsx)$/.test(entry.name) || /\.test\.[^.]+$/.test(entry.name)) continue
    files.push(path)
  }

  return files
}

async function sourceText(directory) {
  const files = await sourceFiles(directory)
  const entries = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')]))
  return entries
}

test('Markdown package stays independent from Docfuse and framework adapters', async () => {
  const entries = await sourceText(join(root, 'packages/markdown/src'))
  const forbiddenImport =
    /(?:from\s+|import\s*\(\s*)['"](?:docfuse(?:\/|['"])|@docfuse\/(?:react-markdown|vue-markdown|cli)(?:\/|['"]))/

  for (const [file, source] of entries) {
    assert.doesNotMatch(source, forbiddenImport, `${file} imports a platform or adapter package`)
  }
})

test('TypeScript source imports use bundler-native extensionless specifiers', async () => {
  const entries = [
    ...(await sourceText(join(root, 'packages'))),
    ...(await sourceText(join(root, 'site')))
  ].filter(([file]) => /\.tsx?$/.test(file))
  const relativeJavaScriptImport = /(?:from\s+|import\s*\(\s*)['"]\.\.?\/[^'"]+\.js['"]/

  for (const [file, source] of entries) {
    assert.doesNotMatch(source, relativeJavaScriptImport, `${file} uses a .js suffix in TypeScript source`)
  }
})

test('Markdown production source keeps the compiler and React layers explicitly typed', async () => {
  const entries = await sourceText(join(root, 'packages/markdown/src'))
  const explicitAny = /(?:\bas\s+any\b|:\s*any\b|<any>|\bany\[\])/g

  for (const [file, source] of entries) {
    assert.doesNotMatch(source, explicitAny, `${file} weakens a production boundary with explicit any`)
    assert.doesNotMatch(
      source,
      /\bas\s+unknown\s+as\b/,
      `${file} bypasses a production boundary with a double assertion`
    )
  }
})

test('Docfuse uses the target package boundary and not legacy adapters', async () => {
  const entries = await sourceText(join(root, 'packages/docfuse/src'))
  const forbiddenImport =
    /(?:from\s+|import\s*\(\s*)['"]@docfuse\/(?:react-markdown|vue-markdown|cli)(?:\/|['"])/

  for (const [file, source] of entries) {
    assert.doesNotMatch(source, forbiddenImport, `${file} imports a legacy adapter/package`)
  }

  const renderSite = await readFile(join(root, 'packages/docfuse/src/render/renderSite.tsx'), 'utf8')
  assert.match(
    renderSite,
    /from ['"]@docfuse\/markdown\/server['"]/,
    'Docfuse Markdown build must use the server entry'
  )
})

test('Markdown interactions use stable action attributes instead of visual classes', async () => {
  const entries = await sourceText(join(root, 'packages/markdown/src'))
  const source = entries.map(([, value]) => value).join('\n')
  const client = await readFile(join(root, 'packages/markdown/src/client.ts'), 'utf8')
  const nativeBehaviors = await readFile(
    join(root, 'packages/markdown/src/client/nativeBehaviors.ts'),
    'utf8'
  )
  const richBehaviors = await readFile(join(root, 'packages/markdown/src/islands.ts'), 'utf8')
  const componentMap = await readFile(join(root, 'packages/markdown/src/react/componentMap.tsx'), 'utf8')
  assert.match(source, /data-df-action/, 'Markdown components must expose stable action attributes')
  assert.match(
    richBehaviors,
    /import\(['"].\/islands\//,
    'rich behavior implementations must be loaded by interaction type'
  )
  assert.match(
    client,
    /enhanceNativeMarkdown/,
    'the public client must enhance simple behavior without React'
  )
  assert.match(client, /enhanceRichMarkdown/, 'the public client must delegate rich behavior internally')
  assert.match(
    nativeBehaviors,
    /target\.addEventListener\(['"]click['"], onClick\)/,
    'native behavior owns the delegated interaction listener'
  )
  assert.match(
    nativeBehaviors,
    /target\.removeEventListener\(['"]click['"], onClick\)/,
    'native behavior must release the delegated interaction listener'
  )
  assert.doesNotMatch(
    `${client}\n${richBehaviors}`,
    /DOMContentLoaded|addEventListener/,
    'importing the client must not start the host runtime'
  )
  assert.match(source, /hydrateRoot/)
  assert.doesNotMatch(source, /window\.__docfuseMarkdown/)
  assert.doesNotMatch(
    source,
    /componentFromClassName|class(?:es|List)?\.(?:has|contains)\(['"]df-/,
    'visual classes must not select component behavior'
  )
  assert.doesNotMatch(
    componentMap,
    /classNameText\(props\.className\)[^\n]*includes\(['"]footnotes/s,
    'semantic elements must not be inferred from class names'
  )
  assert.doesNotMatch(
    source,
    /['"](?:note|caution)['"]\s*,\s*['"](?:info|danger)['"]/,
    'removed Callout aliases must not return'
  )
  assert.doesNotMatch(source, /from ['"].*\/(?:runtime|enhancer)(?:\.js)?['"]/)
})

test('public React component documentation matches the source type contract', async () => {
  const componentMap = await readFile(join(root, 'packages/markdown/src/react/componentMap.tsx'), 'utf8')
  const contract = componentMap.match(/export interface MarkdownNamedComponentProps \{([\s\S]*?)\n\}/)
  assert.ok(contract, 'MarkdownNamedComponentProps must remain a readable source contract')
  const expected = [...contract[1].matchAll(/^  ([A-Z][A-Za-z0-9]*):/gm)].map((match) => match[1])

  for (const path of [
    'site/docs/zh/reference/api/react-markdown.md',
    'site/docs/en/reference/api/react-markdown.md'
  ]) {
    const documentation = await readFile(join(root, path), 'utf8')
    const componentLine = documentation.split('\n').find((line) => line.startsWith('`components`'))
    assert.ok(componentLine, `${path} must document the named component contract on one line`)
    const documented = [...componentLine.matchAll(/`([A-Z][A-Za-z0-9]*)`/g)].map((match) => match[1])
    assert.deepEqual(documented, expected, `${path} named component list drifted from its source type`)
  }
})

test('public and maintainer documentation matches the three-package contract', async () => {
  const packageManifests = await Promise.all(
    ['docfuse', 'markdown', 'plugins'].map((name) =>
      readFile(join(root, 'packages', name, 'package.json'), 'utf8').then(JSON.parse)
    )
  )
  const contributing = await readFile(join(root, 'CONTRIBUTING.md'), 'utf8')
  const publicReferences = await Promise.all(
    ['site/docs/zh/reference/api/public-api.md', 'site/docs/en/reference/api/public-api.md'].map((path) =>
      readFile(join(root, path), 'utf8')
    )
  )
  for (const source of [contributing, ...publicReferences]) {
    assert.doesNotMatch(
      source,
      /publishes two packages|packs both packages|publish both packages|both published tarballs|两个 npm Tarball|只发布[^\n]*两个包/
    )
  }
  assert.match(contributing, /`@docfuse\/plugins`[^\n]*Markdown plugins and search providers/)
  assert.doesNotMatch(contributing, /`@docfuse\/plugins`[^\n]*site-extension/)
  assert.match(contributing, /pnpm test:release/)
  for (const source of publicReferences) {
    for (const manifest of packageManifests) {
      assert.ok(source.includes(`\`${manifest.name}\``), `public API reference must include ${manifest.name}`)
    }
  }
})

test('release workflow stages explicit local tarball paths and waits for approval', async () => {
  const workflow = await readFile(join(root, '.github/workflows/release.yml'), 'utf8')
  const archives = [...workflow.matchAll(/stage_if_missing\s+"[^"]+"\s+"([^"]+\.tgz)"/g)].map(
    (match) => match[1]
  )

  assert.equal(archives.length, 3, 'release workflow must stage all three package archives')
  for (const archive of archives) {
    assert.match(
      archive,
      /^\.\/release-packages\//,
      `npm stage publish requires an explicit local path: ${archive}`
    )
  }
  assert.match(workflow, /npm stage publish "\$\{archive\}" --access public --provenance/)
  assert.doesNotMatch(workflow, /\bnpm publish\b/)
  assert.match(workflow, /Waiting for npm 2FA approval/)
})

test('Markdown plugins, search providers, and site extensions keep distinct lifecycles', async () => {
  const markdownPluginContract = await readFile(join(root, 'packages/markdown/src/compiler/types.ts'), 'utf8')
  const pagefind = await readFile(join(root, 'packages/plugins/src/pagefind/index.ts'), 'utf8')
  const markdownPluginDirectories = [
    'external-links',
    'reading-time',
    'link-card',
    'kroki',
    'math',
    'mermaid',
    'plantuml'
  ]

  assert.match(markdownPluginContract, /directiveNames\?: readonly string\[\]/)
  assert.match(pagefind, /satisfies SearchProvider/)
  assert.match(pagefind, /client:\s*['"]pagefind['"]/)
  assert.doesNotMatch(pagefind, /defineMarkdownPlugin|defineExtension/)
  for (const directory of markdownPluginDirectories) {
    const source = await readFile(join(root, 'packages/plugins/src', directory, 'index.ts'), 'utf8')
    assert.match(source, /defineMarkdownPlugin/, `${directory} must remain a Markdown plugin`)
    assert.doesNotMatch(
      source,
      /defineSearchProvider|defineExtension/,
      `${directory} must not cross into a whole-site lifecycle`
    )
  }
})

test('published packages include matching English and Chinese READMEs', async () => {
  for (const directory of ['docfuse', 'markdown', 'plugins']) {
    const packageRoot = join(root, 'packages', directory)
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    const english = await readFile(join(packageRoot, 'README.md'), 'utf8')
    const chinese = await readFile(join(packageRoot, 'README.zh-CN.md'), 'utf8')

    assert.ok(manifest.files.includes('README.zh-CN.md'), `${manifest.name} must publish its Chinese README`)
    assert.match(english, /\[简体中文\]\(\.\/README\.zh-CN\.md\)/)
    assert.match(chinese, /\[English\]\(\.\/README\.md\)/)
  }
})

test('ContentGraph remains content facts consumed by downstream derived views', async () => {
  const graphSource = await readFile(join(root, 'packages/docfuse/src/content/graph.ts'), 'utf8')
  const graphTypes = await readFile(join(root, 'packages/docfuse/src/content/types.ts'), 'utf8')
  const downstreamSources = await Promise.all(
    [
      'packages/docfuse/src/render/layout/model.ts',
      'packages/docfuse/src/search/index.ts',
      'packages/docfuse/src/ai/writeAiOutputs.ts',
      'packages/docfuse/src/output/plan.ts'
    ].map((path) => readFile(join(root, path), 'utf8'))
  )

  assert.doesNotMatch(graphSource, /from ['"]\.\.\/(?:ai|build|output|render|search|seo|server)\//)
  assert.doesNotMatch(
    graphTypes,
    /MarkdownAssets|RenderedMarkdown|SearchProvider|BuildManifest|OutputFileState/,
    'ContentGraph must not absorb renderer, provider, or build-state contracts'
  )
  for (const source of downstreamSources) {
    assert.match(source, /ContentGraph/, 'each downstream view must consume ContentGraph explicitly')
  }
})

test('Docfuse and Markdown do not publish legacy theme token aliases', async () => {
  const sources = await Promise.all([
    readFile(join(root, 'packages/docfuse/src/render/styles.input.css'), 'utf8'),
    readFile(join(root, 'packages/docfuse/src/render/theme.ts'), 'utf8'),
    readFile(join(root, 'packages/markdown/src/tokens.css'), 'utf8')
  ])
  const legacyToken =
    /--(?:background|foreground|text|muted-foreground|card|primary|primary-soft|primary-foreground|border|hairline|ring|overlay|radius|font-sans|font-mono)\s*:/

  for (const source of sources) {
    assert.doesNotMatch(source, legacyToken)
  }
})

test('Docfuse shell publishes only the canonical site-shell stylesheet', async () => {
  const source = await readFile(join(root, 'packages/docfuse/src/render/styles.input.css'), 'utf8')

  assert.match(source, /\.df-shell\s*\{/)
  assert.match(source, /\.df-sidebar\s*\{/)
  assert.match(source, /scrollbar-width:\s*none/)
  assert.match(source, /prefers-reduced-motion/)
  assert.doesNotMatch(source, /apple-/)
  assert.doesNotMatch(source, /\.df-sidebar-open\b/)
  assert.doesNotMatch(source, /\.df-outline-link-active\b/)
  assert.doesNotMatch(source, /body\[data-docfuse-sidebar-open\]/)
})

test('the retired showcase stylesheet stays deleted', async () => {
  await assert.rejects(() => access(join(root, 'site/docs/showcase.css')))
})

test('workspace styles do not reference undefined Docfuse custom properties', async () => {
  const stylePaths = [
    'packages/markdown/src/tokens.css',
    'packages/markdown/src/styles.css',
    'packages/docfuse/src/render/styles.input.css'
  ]
  const definitionPaths = [...stylePaths, 'packages/docfuse/src/render/theme.ts']
  const [sources, definitionSources] = await Promise.all([
    Promise.all(stylePaths.map((path) => readFile(join(root, path), 'utf8'))),
    Promise.all(definitionPaths.map((path) => readFile(join(root, path), 'utf8')))
  ])
  const definitions = new Set(
    definitionSources.flatMap((source) => [...source.matchAll(/(--df-[\w-]+)\s*:/g)].map((match) => match[1]))
  )

  for (const [index, source] of sources.entries()) {
    const missing = [...new Set([...source.matchAll(/var\((--df-[\w-]+)/g)].map((match) => match[1]))].filter(
      (name) => !definitions.has(name)
    )
    assert.deepEqual(missing, [], `${stylePaths[index]} references undefined Docfuse custom properties`)
  }
})

test('Docfuse consumes the deep renderer instead of Markdown compiler internals', async () => {
  const renderSite = await readFile(join(root, 'packages/docfuse/src/render/renderSite.tsx'), 'utf8')
  const renderMdx = await readFile(join(root, 'packages/docfuse/src/render/renderMdx.tsx'), 'utf8')
  const source = `${renderSite}\n${renderMdx}`

  assert.match(source, /createMarkdownRenderer/)
  assert.match(source, /\.renderMdx\(/)
  assert.doesNotMatch(
    source,
    /PreparedMarkdown|MarkdownDocument|prepareMarkdown|createMarkdownMdxPlugins|@mdx-js\/mdx/
  )
})

test('Markdown React components do not construct or mutate component UI through DOM APIs', async () => {
  const entries = await sourceText(join(root, 'packages/markdown/src/components'))
  const forbiddenDomUi =
    /(?:innerHTML|outerHTML|insertAdjacentHTML|document\.createElement|document\.querySelector|document\.querySelectorAll|document\.addEventListener)/

  for (const [file, source] of entries) {
    assert.doesNotMatch(source, forbiddenDomUi, `${file} bypasses React to construct or control component UI`)
  }
})

test('workspace exposes one core package, one renderer package, and one official plugin package', async () => {
  const packageDirectories = []
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      await access(join(root, 'packages', entry.name, 'package.json'))
      packageDirectories.push(entry.name)
    } catch {
      // Non-package support directories do not participate in the workspace contract.
    }
  }

  assert.deepEqual(packageDirectories.sort(), ['docfuse', 'markdown', 'plugins'])

  const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const docfusePackage = JSON.parse(await readFile(join(root, 'packages/docfuse/package.json'), 'utf8'))
  const markdownPackage = JSON.parse(await readFile(join(root, 'packages/markdown/package.json'), 'utf8'))
  const pluginsPackage = JSON.parse(await readFile(join(root, 'packages/plugins/package.json'), 'utf8'))

  assert.equal(docfusePackage.name, 'docfuse')
  assert.equal(markdownPackage.name, '@docfuse/markdown')
  assert.equal(pluginsPackage.name, '@docfuse/plugins')
  assert.doesNotMatch(rootPackage.scripts.build, /@docfuse\/(?:react-markdown|vue-markdown|cli)/)
  assert.doesNotMatch(rootPackage.scripts.typecheck, /@docfuse\/(?:react-markdown|vue-markdown|cli)/)
  assert.doesNotMatch(JSON.stringify(markdownPackage.dependencies), /docfuse/i)
  assert.doesNotMatch(
    JSON.stringify(markdownPackage.dependencies),
    /katex|remark-math|rehype-katex|mermaid|fflate/,
    'Optional math and diagram runtimes belong to @docfuse/plugins, not the Markdown core'
  )
  assert.match(JSON.stringify(pluginsPackage.dependencies), /"katex"/)
  assert.doesNotMatch(JSON.stringify(pluginsPackage.dependencies), /"docfuse"|"mermaid"|"pagefind"/)
  assert.deepEqual(pluginsPackage.peerDependenciesMeta, {
    mermaid: { optional: true },
    pagefind: { optional: true }
  })

  assert.deepEqual(Object.keys(docfusePackage.exports), ['.'])
  assert.deepEqual(Object.keys(markdownPackage.exports), [
    '.',
    './client',
    './server',
    './server/analyze',
    './theme',
    './base.css',
    './theme.css'
  ])
  for (const retiredExport of [
    './components',
    './islands',
    './islands/react',
    './tokens.css',
    './styles.css',
    './math.css'
  ]) {
    assert.equal(markdownPackage.exports[retiredExport], undefined, `${retiredExport} must stay private`)
  }

  assert.deepEqual(Object.keys(pluginsPackage.exports), [
    '.',
    './external-links',
    './reading-time',
    './link-card',
    './kroki',
    './mermaid',
    './plantuml',
    './math',
    './pagefind',
    './client/kroki',
    './client/mermaid',
    './client/plantuml',
    './diagram.css',
    './math.css'
  ])
  for (const pluginDirectory of [
    'external-links',
    'reading-time',
    'link-card',
    'kroki',
    'mermaid',
    'math',
    'pagefind',
    'plantuml'
  ]) {
    await access(join(root, 'packages/plugins/src', pluginDirectory, 'index.ts'))
  }

  for (const legacyPackage of ['packages/react-markdown', 'packages/vue-markdown']) {
    await assert.rejects(access(join(root, legacyPackage)), `${legacyPackage} must stay deleted`)
  }
})

test('Docfuse typechecks every public Markdown code entry from source', async () => {
  const docfuseTsconfig = JSON.parse(await readFile(join(root, 'packages/docfuse/tsconfig.json'), 'utf8'))
  const markdownPackage = JSON.parse(await readFile(join(root, 'packages/markdown/package.json'), 'utf8'))
  const paths = docfuseTsconfig.compilerOptions?.paths ?? {}

  for (const [subpath, conditions] of Object.entries(markdownPackage.exports)) {
    if (typeof conditions === 'string' || !conditions.import) continue
    const specifier = subpath === '.' ? '@docfuse/markdown' : `@docfuse/markdown/${subpath.slice(2)}`
    assert.ok(paths[specifier], `${specifier} needs a workspace source path for clean typechecks`)
  }
})

test('Markdown benchmark uses the current default-locale fixture', async () => {
  const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const benchmark = await readFile(join(root, 'packages/markdown/scripts/benchmark.mjs'), 'utf8')
  const fixture = join(root, 'site/docs/zh/markdown/playground.md')

  assert.equal(
    rootPackage.scripts['benchmark:markdown'],
    'pnpm --filter @docfuse/markdown build && node packages/markdown/scripts/benchmark.mjs'
  )
  assert.match(benchmark, /site\/docs\/zh\/markdown\/playground\.md/)
  await access(fixture)
})

test('CI and public documentation use the supported Node.js runtime', async () => {
  const docfusePackage = JSON.parse(await readFile(join(root, 'packages/docfuse/package.json'), 'utf8'))
  const workflow = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')
  const publicGuides = await Promise.all(
    [
      'README.md',
      'README.zh-CN.md',
      'site/docs/zh/guide/introduction/getting-started.md',
      'site/docs/en/guide/introduction/getting-started.md',
      'site/docs/zh/guide/delivery/deployment.md',
      'site/docs/en/guide/delivery/deployment.md'
    ].map((path) => readFile(join(root, path), 'utf8'))
  )

  assert.equal(docfusePackage.engines.node, '>=22')
  const setupNodeSteps = workflow.match(/uses:\s*actions\/setup-node@/g)?.length ?? 0
  const node22Steps = workflow.match(/node-version:\s*22/g)?.length ?? 0
  assert.ok(setupNodeSteps >= 3, 'release, platform, and React jobs must all configure Node.js')
  assert.equal(node22Steps, setupNodeSteps)
  assert.doesNotMatch(workflow, /node-version:\s*20/)
  for (const guide of publicGuides) {
    assert.doesNotMatch(guide, /Node(?:\.js)?:?\s*20(?:\+| or later| 或更高版本)?/i)
  }
})
