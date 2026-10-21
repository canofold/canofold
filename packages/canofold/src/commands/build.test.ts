import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { runBuild, versionSatisfies } from './build'
import { runCheck } from './check'
import { trackedMkdtemp } from '../../test/fixtures'

async function directorySnapshot(
  root: string,
  directory = root,
  ignoredRootDirectories = new Set<string>()
): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (directory === root && entry.isDirectory() && ignoredRootDirectories.has(entry.name)) continue
    if (entry.isDirectory())
      Object.assign(snapshot, await directorySnapshot(root, path, ignoredRootDirectories))
    if (entry.isFile())
      snapshot[path.slice(root.length + 1).replace(/\\/g, '/')] = (await readFile(path)).toString('base64')
  }
  return snapshot
}

describe('versionSatisfies', () => {
  it('uses standard caret semantics for zero and stable major versions', () => {
    expect(versionSatisfies('0.1.8', '^0.1.0')).toBe(true)
    expect(versionSatisfies('0.2.0', '^0.1.0')).toBe(false)
    expect(versionSatisfies('1.9.0', '^1.2.0')).toBe(true)
    expect(versionSatisfies('2.0.0', '^1.2.0')).toBe(false)
  })

  it('supports exact and comparator ranges and rejects invalid input', () => {
    expect(versionSatisfies('1.4.2', '1.4.2')).toBe(true)
    expect(versionSatisfies('1.4.2', '>=1.4 <2')).toBe(true)
    expect(() => versionSatisfies('1.4.2', 'not-a-range')).toThrow('Invalid requiredVersion range')
  })
})

describe('runBuild', () => {
  it.each(['setext', 'reference image', 'local MDX'])(
    'keeps compiled %s interactions in request-time and unchanged-page builds',
    async (kind) => {
      const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-build-compiled-assets-'))
      await mkdir(join(cwd, 'docs'))
      await writeFile(join(cwd, 'docs/index.md'), '# Home')
      const content =
        kind === 'setext'
          ? '# Guide\n\nSection\n-------\n'
          : kind === 'reference image'
            ? '# Guide\n\n![Figure][image]\n\n[image]: https://example.com/figure.png\n'
            : "import Figure from './Figure'\n\n# Guide\n\n<Figure />"
      if (kind === 'local MDX')
        await writeFile(
          join(cwd, 'docs/Figure.tsx'),
          'const Image = () => <figure data-cf-component="image"><img src="https://example.com/image.png" /></figure>; export default function Figure() { return <Image /> }'
        )
      await writeFile(join(cwd, `docs/guide.${kind === 'local MDX' ? 'mdx' : 'md'}`), content)
      const client = join(cwd, '.canofold/dist/assets/canofold-markdown/index.js')
      await runBuild({ cwd, demoMode: 'dev', renderHtml: false })
      await access(client)
      await writeFile(join(cwd, 'docs/index.md'), '# Home\n\nEdited')
      expect((await runBuild({ cwd, demoMode: 'dev', renderHtml: false })).incremental).toBe(true)
      await access(client)
      await runBuild({ cwd })
      await writeFile(join(cwd, 'docs/index.md'), '# Home\n\nEdited again')
      expect((await runBuild({ cwd })).incremental).toBe(true)
      await access(client)
    }
  )
  it('checks publication scope before cached output and preserves the last good build on failure', async () => {
    const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-build-checks-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n[Missing](./missing.md)')
    const configPath = join(cwd, 'canofold.config.ts')
    await writeFile(configPath, "export default { checks: { rules: { 'broken-link': 'warning' } } }")
    await runBuild({ cwd })
    const output = join(cwd, '.canofold/dist')
    const before = await directorySnapshot(output)
    await writeFile(configPath, 'export default {}')
    await expect(runBuild({ cwd })).rejects.toThrow('Link target does not exist')
    expect(await directorySnapshot(output)).toEqual(before)
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(
      join(cwd, 'docs/draft.md'),
      '---\nstatus: draft\ntitle: 123\n---\n[Missing](./missing.md)'
    )
    await runBuild({ cwd })
    expect(await runBuild({ cwd })).toMatchObject({ cached: true })
    await expect(runBuild({ cwd, demoMode: 'dev' })).rejects.toThrow('Frontmatter title')
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n[Draft](./draft.md)')
    await expect(runBuild({ cwd })).rejects.toThrow('Link target does not exist: ./draft.md')
  })

  it('renders Markdown and MDX source links as HTML routes when Markdown mirrors are disabled', async () => {
    const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-source-links-'))
    await mkdir(join(cwd, 'docs/guide'), { recursive: true })
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default ${JSON.stringify({
        basePath: '/project/',
        markdownMirror: false,
        i18n: { defaultLocale: 'en', locales: ['en'] }
      })}`
    )
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n[Next](./guide/next.mdx?from=home#api)')
    await writeFile(join(cwd, 'docs/guide/download'), 'download contents')
    await writeFile(join(cwd, 'docs/guide/download.md'), '# Download page')
    await writeFile(
      join(cwd, 'docs/guide/next.mdx'),
      '# Next\n\n## API\n\n<a href="../index.md#home">Home</a>\n\n<a href="../index#home">Extensionless home</a>\n\n[Download](./download)\n\n[Download page](./download.md)'
    )
    await runBuild({ cwd })
    const output = join(cwd, '.canofold/dist')
    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain(
      'href="/project/guide/next/?from=home#api"'
    )
    expect(await readFile(join(output, 'guide/next/index.html'), 'utf8')).toContain('href="/project/#home"')
    const nextHtml = await readFile(join(output, 'guide/next/index.html'), 'utf8')
    expect(nextHtml).toContain('href="/project/#home">Extensionless home')
    expect(nextHtml).toContain('href="./download"')
    expect(nextHtml).toContain('href="/project/guide/download/"')
    expect(await readFile(join(output, 'guide/next/download'), 'utf8')).toBe('download contents')
    await expect(access(join(output, 'guide/next/index.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not let another page download shadow a source-relative document link', async () => {
    const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-page-link-ownership-'))
    await mkdir(join(cwd, 'docs/a'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/bar.md'), '# Target document')
    await writeFile(join(cwd, 'docs/a/bar'), 'download contents')
    await writeFile(join(cwd, 'docs/a/index.md'), '# Downloads\n\n[Download](./bar)')
    await writeFile(join(cwd, 'docs/a/foo.md'), '# Foo\n\n[Open document from Foo](../bar)')
    await runBuild({ cwd })

    const output = join(cwd, '.canofold/dist')
    const html = await readFile(join(output, 'a/foo/index.html'), 'utf8')
    const documentLink = html.match(/<a\b[^>]*>Open document from Foo<\/a>/)?.[0]
    expect(documentLink).toContain('href="/bar/"')
    expect(await readFile(join(output, 'a/index.html'), 'utf8')).toContain('href="./bar"')
    expect(await readFile(join(output, 'a/bar'), 'utf8')).toBe('download contents')
  })

  it('checks and copies resources declared in static native MDX JSX', async () => {
    const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-mdx-jsx-assets-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/figure.svg'), '<svg>figure</svg>')
    await writeFile(join(cwd, 'docs/frame.svg'), '<svg>frame</svg>')
    await writeFile(join(cwd, 'docs/figure-2x.svg'), '<svg>figure-2x</svg>')
    await writeFile(
      join(cwd, 'docs/guide.mdx'),
      '# Guide\n\n<h2 id="jsx-heading">JSX heading</h2>\n\n<img src="./figure.svg" srcSet="./figure.svg 1x, ./figure-2x.svg 2x" alt="Figure" />\n\n<MarkdownImage src={"./frame.svg"} alt="Frame" />\n\n<a href="#jsx-heading">Read</a>'
    )
    const originalExit = process.exitCode
    try {
      expect((await runCheck({ cwd })).filter((issue) => issue.severity === 'error')).toEqual([])
      await runBuild({ cwd })
      const output = join(cwd, '.canofold/dist')
      const html = await readFile(join(output, 'guide/index.html'), 'utf8')
      expect(html).toContain('src="./figure.svg"')
      expect(html).toContain('src="./frame.svg"')
      expect(html).toContain('href="#jsx-heading"')
      expect(await readFile(join(output, 'guide/figure.svg'), 'utf8')).toBe('<svg>figure</svg>')
      expect(await readFile(join(output, 'guide/figure-2x.svg'), 'utf8')).toBe('<svg>figure-2x</svg>')
      expect(await readFile(join(output, 'guide/frame.svg'), 'utf8')).toBe('<svg>frame</svg>')
      await writeFile(join(cwd, 'docs/guide.mdx'), '# Guide\n\n<img srcSet="./missing.svg 2x" />')
      const issues = await runCheck({ cwd })
      expect(issues).toContainEqual(
        expect.objectContaining({
          ruleId: 'broken-image',
          page: 'docs/guide.mdx',
          line: 3,
          column: 1
        })
      )
    } finally {
      process.exitCode = originalExit
    }
  })

  it.each(['md', 'mdx'])(
    'keeps plugin-transformed %s content consistent across published outputs and check',
    async (extension) => {
      const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-plugin-facts-'))
      await mkdir(join(cwd, 'docs'))
      await writeFile(join(cwd, 'docs/index.md'), '# Home')
      await writeFile(join(cwd, 'docs/published.md'), '# Destination')
      await writeFile(join(cwd, 'docs/final.svg'), '<svg>published</svg>')
      await writeFile(join(cwd, 'docs/generated.svg'), '<svg>generated</svg>')
      const source =
        '# Original heading\n\nOriginal prose\n\n[Read](./original.md)\n\n![Picture](./original.svg)'
      const pagePath = join(cwd, `docs/guide.${extension}`)
      await writeFile(pagePath, source)
      await writeFile(
        join(cwd, 'canofold.config.ts'),
        `export default {
      markdown: { plugins: [{ name: 'compiled-facts', version: '1',
        remarkPlugins: [() => async tree => {
          function walk(node) {
            if (node.type === 'text') node.value = node.value.replaceAll('Original', 'Published')
            if (node.type === 'link') node.url = './published.md'
            if (node.type === 'image') node.url = './published.svg'
            node.children?.forEach(walk)
          }
          walk(tree)
        }],
        rehypePlugins: [() => async tree => {
          function walk(node) {
            if (node.tagName === 'img') node.properties.src = './final.svg'
            if (node.tagName === 'h1' && node.properties.id === 'published-heading') node.properties.id = 'final-heading'
            node.children?.forEach(walk)
          }
          walk(tree)
          if (tree.children.some(node => node.tagName === 'h1' && node.properties.id === 'final-heading')) {
            tree.children.push({ type: 'element', tagName: 'img', properties: { src: './generated.svg' }, children: [] })
          }
        }]
      }] }
    }`
      )
      const output = join(cwd, '.canofold/dist')
      const originalExit = process.exitCode
      try {
        expect((await runCheck({ cwd })).filter((issue) => issue.severity === 'error')).toEqual([])
        await runBuild({ cwd })
        const html = await readFile(join(output, 'guide/index.html'), 'utf8')
        expect(html).toContain('id="final-heading"')
        expect(html).toContain('href="#final-heading"')
        expect(html).not.toContain('original-heading')
        expect(html).toContain('src="./final.svg"')
        expect(await readFile(join(output, 'guide/final.svg'), 'utf8')).toBe('<svg>published</svg>')
        expect(await readFile(join(output, 'guide/generated.svg'), 'utf8')).toBe('<svg>generated</svg>')
        const index = JSON.parse(await readFile(join(output, 'search/zh.json'), 'utf8'))
        expect(index.docs.find((page: { routePath: string }) => page.routePath === '/guide/')).toMatchObject({
          title: 'Published heading',
          excerpt: 'Published heading Published prose Read Picture'
        })
        const metadata = JSON.parse(await readFile(join(output, 'ai/pages.json'), 'utf8'))
        const document = metadata.pages.find((page: { routePath: string }) => page.routePath === '/guide/')
        expect(document.source.revision).toBe(createHash('sha256').update(source).digest('hex'))
        expect(document.representation).toMatchObject({
          body: 'extension-transformed-source-body',
          analysis: extension === 'mdx' ? 'mdx-static-only' : 'markdown-static'
        })
        expect(
          metadata.pages.find((page: { routePath: string }) => page.routePath === '/guide/').headings
        ).toEqual([{ level: 1, text: 'Published heading', slug: 'final-heading' }])
        const summaries = JSON.parse(await readFile(join(output, 'ai/summaries.json'), 'utf8'))
        expect(
          summaries.summaries.find((page: { routePath: string }) => page.routePath === '/guide/').summary
        ).toBe('Published prose')
        // Markdown mirrors remain authored source, not a lossy serialization of the compiled HTML.
        expect(await readFile(join(output, 'guide/index.md'), 'utf8')).toContain('Original heading')
        expect((await runBuild({ cwd })).mode).toBe('cached')
        await writeFile(pagePath, source.replace('\n\n![Picture](./original.svg)', ''))
        expect((await runBuild({ cwd })).mode).toBe('incremental')
        await expect(access(join(output, 'guide/final.svg'))).rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        process.exitCode = originalExit
      }
    }
  )
  it.each([
    ['markdownMirror', 'markdownMirror: false', 'index.md'],
    ['aiPageIndex', 'ai: { pageIndex: false }', 'ai/pages.json'],
    ['aiFullContent', 'ai: { fullContent: false }', 'ai/manifest.json'],
    ['aiMarkdownIndex', 'ai: { markdownIndex: false }', 'ai/index.md'],
    ['aiSummaries', 'ai: { pageSummaries: false }', 'ai/summaries.json'],
    ['aiCodeExamples', 'ai: { codeExamples: false }', 'ai/code-examples.json'],
    ['llmsTxt', 'ai: { llmsTxt: false }', 'llms.txt'],
    ['llmsFullTxt', 'ai: { llmsFullTxt: false }', 'llms-full.txt']
  ])('removes stale %s output and manifest references after disabling it', async (id, setting, path) => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-output-switch-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    const output = join(cwd, '.canofold/dist')
    await runBuild({ cwd })
    await access(join(output, path))
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { ${setting} }`)
    const result = await runBuild({ cwd })
    expect(result.mode).toBe('clean')
    await expect(access(join(output, path))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(result.report.removedPaths).toContain(path)
    expect(result.report.outputs.find((item) => item.id === id)).toMatchObject({
      enabled: false,
      files: 0,
      missingPaths: []
    })
    const manifest = JSON.parse(await readFile(join(cwd, '.canofold/cache/build-manifest.json'), 'utf8'))
    expect(manifest.outputs).not.toHaveProperty(path)
    expect((await runBuild({ cwd })).mode).toBe('cached')
  })

  it('governs optional outputs, removes stale files, and reports actual cached and rebuilt state', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-output-governance-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await mkdir(join(cwd, 'docs/public'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\nKnowledge')
    await writeFile(join(cwd, 'docs/public/diagram.svg'), '<svg/>')
    const output = join(cwd, '.canofold/dist')
    const reportPath = join(cwd, '.canofold/cache/build-report.json')

    const first = await runBuild({ cwd })
    expect(first.report).toMatchObject({ mode: 'clean', pages: 1, locales: ['zh'], removalBaseline: false })
    expect(first.report.outputs.flatMap((item) => item.missingPaths)).toEqual([])
    expect(first.report.additionalOutputs).toEqual({
      paths: ['diagram.svg'],
      files: 1,
      bytes: Buffer.byteLength('<svg/>')
    })
    const firstManifest = JSON.parse(await readFile(join(cwd, '.canofold/cache/build-manifest.json'), 'utf8'))
    expect(
      first.report.outputs.reduce((count, item) => count + item.files, first.report.additionalOutputs.files)
    ).toBe(Object.keys(firstManifest.outputs).length)
    expect(first.report.outputs.find((item) => item.id === 'aiFullContent')).toMatchObject({
      enabled: true,
      missingPaths: [],
      files: 2
    })
    await access(join(output, 'index.md'))
    await access(join(output, 'ai/pages.json'))
    await access(join(output, 'ai/manifest.json'))

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const forced = await runBuild({ cwd, noCache: true })
      expect(forced.report.removalBaseline).toBe(false)
      expect(log).toHaveBeenCalledOnce()
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/Built .*1 pages.*\(clean\)/))
      expect(log.mock.calls.flat().join('')).not.toMatch(/Outputs:|forced|removed|versions current/)
      log.mockClear()
      const cached = await runBuild({ cwd, demoMode: 'dev' })
      expect(cached.cached).toBe(true)
      expect(log).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }

    await writeFile(
      join(cwd, 'canofold.config.ts'),
      'export default { markdownMirror: false, ai: { pageIndex: false, fullContent: false } }'
    )
    const disabled = await runBuild({ cwd })
    expect(disabled).toMatchObject({ mode: 'clean', reason: 'shared-inputs-changed' })
    expect(disabled.report.outputs.flatMap((item) => item.missingPaths)).toEqual([])
    for (const path of [
      'index.md',
      'ai/pages.json',
      'ai/manifest.json',
      'ai/content/current/zh/0001.jsonl'
    ]) {
      await expect(access(join(output, path))).rejects.toMatchObject({ code: 'ENOENT' })
      expect(disabled.report.removedPaths).toContain(path)
    }
    for (const id of ['markdownMirror', 'aiPageIndex', 'aiFullContent']) {
      expect(disabled.report.outputs.find((item) => item.id === id)).toMatchObject({
        enabled: false,
        files: 0,
        bytes: 0
      })
    }
    expect(await readFile(join(output, 'ai/index.md'), 'utf8')).toContain('](/)')
    const cached = await runBuild({ cwd })
    expect(cached.report).toMatchObject({ mode: 'cached', cacheHit: true, removedPaths: [] })
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toEqual(cached.report)

    await rename(output, join(cwd, '.canofold/.dist.backup'))
    expect((await runBuild({ cwd })).mode).toBe('cached')
    await expect(access(join(output, 'ai/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })

    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\nUpdated knowledge')
    const incremental = await runBuild({ cwd })
    expect(incremental.report).toMatchObject({
      mode: 'incremental',
      changedPages: ['docs/index.md']
    })
    await expect(access(join(output, 'index.md'))).rejects.toMatchObject({ code: 'ENOENT' })

    await writeFile(join(cwd, 'canofold.config.ts'), 'export default {}')
    const restored = await runBuild({ cwd })
    expect(restored.report.mode).toBe('clean')
    await access(join(output, 'index.md'))
    await access(join(output, 'ai/pages.json'))
    await access(join(output, 'ai/manifest.json'))
  })

  it('does not attribute a user asset to a disabled built-in output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-output-user-asset-'))
    await mkdir(join(cwd, 'docs/public/ai'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/public/ai/pages.json'), '{"source":"user"}')
    await writeFile(join(cwd, 'canofold.config.ts'), 'export default { ai: { pageIndex: false } }')

    const result = await runBuild({ cwd })

    expect(result.report.outputs.find((item) => item.id === 'aiPageIndex')).toMatchObject({
      enabled: false,
      files: 0
    })
    expect(result.report.additionalOutputs.paths).toContain('ai/pages.json')
    expect(await readFile(join(cwd, '.canofold/dist/ai/pages.json'), 'utf8')).toBe('{"source":"user"}')
  })

  it('compiles uppercase MDX extensions with MDX semantics', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-extension-case-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/Index.MD'), '# Home')
    await writeFile(join(cwd, 'docs/Guide.MDX'), '# Guide\n\nMDX value: {1 + 1}')

    await runBuild({ cwd })

    const html = await readFile(join(cwd, '.canofold/dist/Guide/index.html'), 'utf8')
    expect(html).toContain('<p data-cf-element="paragraph">MDX value: 2</p>')
  })

  it('builds deployable static output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/en'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\ndescription: 中文首页\n---\n# 首页')
    await writeFile(join(cwd, 'docs/en/index.md'), '---\ntitle: Home\ndescription: English home\n---\n# Home')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { title: 'Docs', i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] } }`
    )

    await runBuild({ cwd })

    await access(join(cwd, '.canofold/dist/index.html'))
    await expect(access(join(cwd, '.canofold/dist/zh/index.html'))).rejects.toMatchObject({ code: 'ENOENT' })
    await access(join(cwd, '.canofold/dist/en/index.html'))
    await access(join(cwd, '.canofold/dist/search/zh.json'))
    await access(join(cwd, '.canofold/dist/llms.txt'))
    await access(join(cwd, '.canofold/dist/ai/pages.json'))
    await access(join(cwd, '.canofold/dist/ai/manifest.json'))

    const html = await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')
    expect(html).toContain('首页')
    expect(html).not.toContain('Select language')
  })

  it('reuses a valid cross-process cache and safely recovers from output and manifest corruption', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-cache-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')

    expect((await runBuild({ cwd })).mode).toBe('clean')
    const cached = await runBuild({ cwd })
    expect(cached).toMatchObject({ mode: 'cached', cached: true, reason: 'unchanged-inputs' })

    await writeFile(join(cwd, '.canofold/dist/index.html'), 'tampered')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'invalid-output' })
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('<!doctype html>')

    await writeFile(join(cwd, '.canofold/cache/build-manifest.json'), '{broken')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'missing-manifest' })
    expect(await runBuild({ cwd, noCache: true })).toMatchObject({ mode: 'clean', reason: 'forced' })
  })

  it('invalidates cached analysis, rendering, and generated artifacts when an extension changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-extension-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await mkdir(join(cwd, 'extensions'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n{{release}}')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { extensions: [{ resolve: './extensions/release.ts' }] }`
    )
    const extensionPath = join(cwd, 'extensions/release.ts')
    const extension = (label: string) => `
      export default {
        apiVersion: 1,
        name: 'release',
        outputs: ['metadata.json'],
        transformSource({ source }) { return source.replace('{{release}}', '${label}') },
        extendPage(page) { return { searchText: page.searchText + ' ${label}-search' } },
        generate({ pages, emitFile }) {
          return emitFile('metadata.json', JSON.stringify({ label: '${label}', pages: pages.length }))
        }
      }`
    await writeFile(extensionPath, extension('alpha'))

    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'missing-manifest' })
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('alpha')
    expect(await readFile(join(cwd, '.canofold/dist/index.md'), 'utf8')).toContain('alpha')
    expect(await readFile(join(cwd, '.canofold/dist/index.md'), 'utf8')).not.toContain('{{release}}')
    expect(
      JSON.parse(await readFile(join(cwd, '.canofold/dist/extensions/release/metadata.json'), 'utf8'))
    ).toEqual({ label: 'alpha', pages: 1 })
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached', reason: 'unchanged-inputs' })

    await writeFile(extensionPath, extension('beta'))
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'shared-inputs-changed' })
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('beta')
    expect(await readFile(join(cwd, '.canofold/dist/index.md'), 'utf8')).toContain('beta')
    expect(
      JSON.parse(await readFile(join(cwd, '.canofold/dist/extensions/release/metadata.json'), 'utf8'))
    ).toEqual({ label: 'beta', pages: 1 })

    const indexPath = join(cwd, '.canofold/dist/ai/pages.json')
    const before = JSON.parse(await readFile(indexPath, 'utf8')).pages[0]
    // The Extension produces identical content, but authored bytes still changed.
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\nbeta')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'incremental' })
    const after = JSON.parse(await readFile(indexPath, 'utf8')).pages[0]
    expect(after.id).toBe(before.id)
    expect(after.source.revision).not.toBe(before.source.revision)
    expect(after.source.transformedRevision).toBe(before.source.transformedRevision)
    expect(after.representation.fingerprint).toBe(before.representation.fingerprint)
    expect(after.revision).not.toBe(before.revision)
  })

  it('invalidates only MDX pages that import a changed project-local component', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-local-component-'))
    await mkdir(join(cwd, 'docs/guide'), { recursive: true })
    await mkdir(join(cwd, 'components'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/other.md'), '# Other\n\nUnchanged')
    await writeFile(
      join(cwd, 'docs/guide/status.mdx'),
      "import { Status } from '../../components/Status'\n\n# Status\n\n<Status />"
    )
    const componentPath = join(cwd, 'components/Status.tsx')
    await writeFile(componentPath, `export function Status() { return <strong>Alpha</strong> }`)

    await runBuild({ cwd })
    expect(await readFile(join(cwd, '.canofold/dist/guide/status/index.html'), 'utf8')).toContain('Alpha')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached' })

    await writeFile(componentPath, `export function Status() { return <strong>Beta</strong> }`)
    const rebuilt = await runBuild({ cwd })

    expect(rebuilt).toMatchObject({ mode: 'incremental' })
    expect(rebuilt.changedPages).toEqual(['docs/guide/status.mdx'])
    expect(await readFile(join(cwd, '.canofold/dist/guide/status/index.html'), 'utf8')).toContain('Beta')
  })

  it('invalidates generated extension artifacts when a bundled package dependency changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-extension-dependency-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await mkdir(join(cwd, 'extensions'), { recursive: true })
    const helperRoot = join(cwd, 'node_modules/extension-helper')
    await mkdir(helperRoot, { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { extensions: [{ resolve: './extensions/report.ts' }] }`
    )
    await writeFile(
      join(cwd, 'extensions/report.ts'),
      `import { label } from 'extension-helper'
       export default {
         apiVersion: 1,
         name: 'report',
         outputs: ['metadata.json'],
         generate({ emitFile }) { return emitFile('metadata.json', JSON.stringify({ label })) }
       }`
    )
    await writeFile(
      join(helperRoot, 'package.json'),
      JSON.stringify({ name: 'extension-helper', type: 'module', exports: './index.js' })
    )
    const helperPath = join(helperRoot, 'index.js')
    await writeFile(helperPath, `export const label = 'alpha'`)

    const first = await runBuild({ cwd })
    expect(first.report.additionalOutputs.paths).toContain('extensions/report/metadata.json')
    expect(
      JSON.parse(await readFile(join(cwd, '.canofold/dist/extensions/report/metadata.json'), 'utf8'))
    ).toEqual({ label: 'alpha' })
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached' })

    await writeFile(helperPath, `export const label = 'beta'`)
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean', reason: 'shared-inputs-changed' })
    expect(
      JSON.parse(await readFile(join(cwd, '.canofold/dist/extensions/report/metadata.json'), 'utf8'))
    ).toEqual({ label: 'beta' })
  })

  it('handles multi-page changes and deletions with output identical to a clean build', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-equivalence-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const firstPath = join(cwd, 'docs/zh/first.md')
    const secondPath = join(cwd, 'docs/zh/second.md')
    await writeFile(firstPath, '# First\n\nOld first')
    await writeFile(secondPath, '# Second\n\nOld second')
    await runBuild({ cwd })

    await writeFile(firstPath, '# First\n\nNew first')
    await writeFile(secondPath, '# Second\n\nNew second')
    const incremental = await runBuild({
      cwd
    })
    expect(incremental.mode).toBe('incremental')
    expect(incremental.changedPages).toHaveLength(2)
    expect(incremental.partialReload).toBe(false)
    const incrementalSnapshot = await directorySnapshot(
      join(cwd, '.canofold/dist'),
      join(cwd, '.canofold/dist'),
      new Set(['pagefind'])
    )

    await runBuild({ cwd, noCache: true })
    expect(
      await directorySnapshot(join(cwd, '.canofold/dist'), join(cwd, '.canofold/dist'), new Set(['pagefind']))
    ).toEqual(incrementalSnapshot)

    await rm(secondPath)
    expect(await runBuild({ cwd })).toMatchObject({
      mode: 'incremental',
      partialReload: false
    })
    await expect(access(join(cwd, '.canofold/dist/second/index.html'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    const deletionSnapshot = await directorySnapshot(
      join(cwd, '.canofold/dist'),
      join(cwd, '.canofold/dist'),
      new Set(['pagefind'])
    )
    await runBuild({ cwd, noCache: true })
    expect(
      await directorySnapshot(join(cwd, '.canofold/dist'), join(cwd, '.canofold/dist'), new Set(['pagefind']))
    ).toEqual(deletionSnapshot)
  })

  it('keeps site, search, and AI outputs aligned across locales, versions, and rebuild modes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-cross-output-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/en'), { recursive: true })
    await mkdir(join(cwd, 'versions/v1/zh'), { recursive: true })
    await mkdir(join(cwd, 'versions/v1/en'), { recursive: true })
    const currentZh = join(cwd, 'docs/zh/index.md')
    const removedEn = join(cwd, 'docs/en/guide.md')
    await writeFile(currentZh, '---\ntitle: 当前中文\n---\n# 当前中文\n\n旧版中文正文')
    await writeFile(join(cwd, 'docs/en/index.md'), '# Current English\n\nEnglish home body')
    await writeFile(removedEn, '# English Guide\n\nOld English guide body')
    await writeFile(join(cwd, 'versions/v1/zh/index.md'), '# 历史中文\n\n历史中文正文')
    await writeFile(join(cwd, 'versions/v1/en/index.md'), '# Historical English\n\nHistorical English body')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] },
        versions: [
          { id: 'v2', label: '2.x', docsDir: 'docs', base: '/' },
          { id: 'v1', label: '1.x', docsDir: 'versions/v1', base: '/v1/' }
        ],
        ai: { versions: 'all' }
      }`
    )

    const output = join(cwd, '.canofold/dist')
    await runBuild({ cwd })
    const initialPages = JSON.parse(await readFile(join(output, 'ai/pages.json'), 'utf8')).pages
    expect(initialPages).toHaveLength(5)
    expect(initialPages.map((page: { routePath: string }) => page.routePath)).toEqual(
      expect.arrayContaining(['/', '/en/', '/en/guide/', '/v1/', '/v1/en/'])
    )

    await writeFile(currentZh, '---\ntitle: 更新中文\n---\n# 更新中文\n\n新版中文正文')
    await rm(removedEn)
    expect((await runBuild({ cwd })).mode).toBe('incremental')

    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain('新版中文正文')
    expect(await readFile(join(output, 'index.md'), 'utf8')).toContain('新版中文正文')
    await expect(access(join(output, 'en/guide/index.html'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(output, 'en/guide/index.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(output, 'v1/en/index.html'), 'utf8')).toContain('Historical English body')

    const currentSearch = JSON.parse(await readFile(join(output, 'search/zh.json'), 'utf8'))
    const englishSearch = JSON.parse(await readFile(join(output, 'search/en.json'), 'utf8'))
    const historicalSearch = JSON.parse(await readFile(join(output, 'search/v1/en.json'), 'utf8'))
    expect(currentSearch.docs).toMatchObject([{ title: '更新中文', routePath: '/' }])
    expect(englishSearch.docs).toMatchObject([{ title: 'Current English', routePath: '/en/' }])
    expect(historicalSearch.docs).toMatchObject([{ title: 'Historical English', routePath: '/v1/en/' }])

    const pages = JSON.parse(await readFile(join(output, 'ai/pages.json'), 'utf8')).pages
    expect(pages).toHaveLength(4)
    expect(pages).toContainEqual(
      expect.objectContaining({
        title: '更新中文',
        version: 'v2',
        locale: 'zh',
        routePath: '/'
      })
    )
    expect(pages).not.toContainEqual(expect.objectContaining({ routePath: '/en/guide/' }))
    expect(pages).toContainEqual(
      expect.objectContaining({
        title: 'Historical English',
        version: 'v1',
        locale: 'en',
        routePath: '/v1/en/'
      })
    )
    const aiManifest = JSON.parse(await readFile(join(output, 'ai/manifest.json'), 'utf8'))
    let aiContent = ''
    for (const partition of aiManifest.partitions as Array<{ shards: Array<{ path: string }> }>) {
      for (const shard of partition.shards) {
        aiContent += await readFile(join(output, shard.path.replace(/^\//, '')), 'utf8')
      }
    }
    expect(aiContent).toContain('新版中文正文')
    expect(aiContent).toContain('Historical English body')
    expect(aiContent).not.toContain('旧版中文正文')
    expect(aiContent).not.toContain('Old English guide body')

    const rebuiltSnapshot = await directorySnapshot(output)
    expect((await runBuild({ cwd })).mode).toBe('cached')
    expect(await directorySnapshot(output)).toEqual(rebuiltSnapshot)
    expect((await runBuild({ cwd, noCache: true })).mode).toBe('clean')
    expect(await directorySnapshot(output)).toEqual(rebuiltSnapshot)
  })

  it('updates every published route when a source page moves', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-route-move-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    const original = join(cwd, 'docs/guide.md')
    await writeFile(original, '# Guide\n\nStable guide content')
    const output = join(cwd, '.canofold/dist')
    await runBuild({ cwd })

    await rename(original, join(cwd, 'docs/manual.md'))
    await runBuild({ cwd })

    await expect(access(join(output, 'guide/index.html'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(output, 'guide/index.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(output, 'manual/index.html'), 'utf8')).toContain('Stable guide content')
    expect(await readFile(join(output, 'manual/index.md'), 'utf8')).toContain('Stable guide content')

    const search = JSON.parse(await readFile(join(output, 'search/zh.json'), 'utf8'))
    expect(search.docs.map((page: { routePath: string }) => page.routePath)).toEqual(['/', '/manual/'])
    const aiPages = JSON.parse(await readFile(join(output, 'ai/pages.json'), 'utf8')).pages
    expect(aiPages.map((page: { routePath: string }) => page.routePath)).toEqual(['/', '/manual/'])
    const aiManifest = JSON.parse(await readFile(join(output, 'ai/manifest.json'), 'utf8'))
    const shardPath = aiManifest.partitions[0].shards[0].path.replace(/^\//, '')
    const aiContent = await readFile(join(output, shardPath), 'utf8')
    expect(aiContent).toContain('"routePath":"/manual/"')
    expect(aiContent).not.toContain('"routePath":"/guide/"')

    const movedSnapshot = await directorySnapshot(output)
    await runBuild({ cwd, noCache: true })
    expect(await directorySnapshot(output)).toEqual(movedSnapshot)
  })

  it('rejects output directories that overlap source documents without deleting them', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-safety-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const source = join(cwd, 'docs/zh/index.mdx')
    await writeFile(source, '# Keep me')
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { outputDir: 'docs' }`)

    await expect(runBuild({ cwd })).rejects.toThrow('must not overlap outputDir')
    await expect(readFile(source, 'utf8')).resolves.toBe('# Keep me')
  })

  it('rejects source/output overlap hidden behind a symbolic link without deleting data', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-symlink-safety-'))
    const outputRoot = join(cwd, '.canofold/dist')
    await mkdir(join(outputRoot, 'zh'), { recursive: true })
    const source = join(outputRoot, 'zh/index.md')
    const unrelated = join(outputRoot, 'keep.txt')
    await writeFile(source, '# Keep me')
    await writeFile(unrelated, 'keep unrelated')
    await symlink(outputRoot, join(cwd, 'docs'))

    await expect(runBuild({ cwd })).rejects.toThrow('must not overlap outputDir')
    await expect(readFile(source, 'utf8')).resolves.toBe('# Keep me')
    await expect(readFile(unrelated, 'utf8')).resolves.toBe('keep unrelated')
  })

  it('rejects an output directory that escapes through a symbolic-link ancestor', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-output-link-'))
    const outside = await mkdtemp(join(tmpdir(), 'canofold-build-output-outside-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await symlink(outside, join(cwd, '.canofold'))

    await expect(runBuild({ cwd })).rejects.toThrow(
      'build cache must resolve to a path inside the project root'
    )
    await expect(access(join(outside, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(outside, 'cache'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves the last successful output when a later build fails', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-atomic-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const source = join(cwd, 'docs/zh/guide.mdx')
    await writeFile(source, '# Stable output')
    await runBuild({ cwd })
    const output = join(cwd, '.canofold/dist/guide/index.html')
    const previous = await readFile(output, 'utf8')

    await writeFile(source, `import Broken from 'not-a-canofold-component'\n\n# Broken output`)
    await expect(runBuild({ cwd })).rejects.toThrow()
    await expect(readFile(output, 'utf8')).resolves.toBe(previous)
  })

  it('preserves schema 3 outputs and cached state when the AI writer fails, then recovers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-ai-atomic-'))
    await mkdir(join(cwd, 'docs'))
    const sourcePath = join(cwd, 'docs/index.md')
    const stableSource = '# Stable knowledge'
    await writeFile(sourcePath, stableSource)
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      'export default { ai: { llmsFullMaxBytes: 16384, llmsFullOverflow: "error" } }'
    )
    await runBuild({ cwd })
    const paths = [
      '.canofold/dist/index.html',
      '.canofold/dist/ai/pages.json',
      '.canofold/dist/ai/manifest.json',
      '.canofold/dist/ai/content/current/zh/0001.jsonl',
      '.canofold/cache/build-manifest.json',
      '.canofold/cache/build-report.json'
    ]
    const before = await Promise.all(paths.map((path) => readFile(join(cwd, path), 'utf8')))
    await writeFile(sourcePath, '# Overflow\n\n' + 'knowledge '.repeat(4000))
    await expect(runBuild({ cwd })).rejects.toThrow('exceeding ai.llmsFullMaxBytes')
    expect(await Promise.all(paths.map((path) => readFile(join(cwd, path), 'utf8')))).toEqual(before)
    await writeFile(sourcePath, stableSource)
    expect((await runBuild({ cwd })).mode).toBe('cached')
    await writeFile(sourcePath, '# Recovered knowledge')
    expect((await runBuild({ cwd })).mode).toBe('incremental')
    const recovered = JSON.parse(await readFile(join(cwd, paths[1]!), 'utf8'))
    expect(recovered.pages[0].id).toBe(JSON.parse(before[1]!).pages[0].id)
    expect(recovered.pages[0].source.revision).not.toBe(JSON.parse(before[1]!).pages[0].source.revision)
  })

  it('recovers the previous output after an interrupted directory swap', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-swap-recovery-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Stable output')
    await runBuild({ cwd })

    const outputRoot = join(cwd, '.canofold/dist')
    const backupRoot = join(cwd, '.canofold/.dist.backup')
    await rename(outputRoot, backupRoot)

    await expect(runBuild({ cwd })).resolves.toMatchObject({ mode: 'cached', cached: true })
    await expect(readFile(join(outputRoot, 'index.html'), 'utf8')).resolves.toContain('Stable output')
    await expect(access(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects public assets that use the build-owned benchmark path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-benchmark-collision-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/public'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/public/.benchmark.json'), '{"owner":"user"}')

    await expect(runBuild({ cwd })).rejects.toThrow(
      'Static asset conflicts with generated output: .benchmark.json'
    )
  })

  it('rejects page routes inside runtime-owned asset directories before rendering', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-build-runtime-route-collision-'))
    await mkdir(join(cwd, 'docs/zh/assets/fonts'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/zh/assets/fonts/KaTeX_AMS-Regular.woff2.md'), '# Reserved route')

    await expect(runBuild({ cwd })).rejects.toThrow('Generated output uses reserved directory "assets/fonts"')
  })

  it('rebuilds one changed page when its navigation contract is stable', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\n---\n# 首页')
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 指南\n---\n# 指南\n\n旧内容')

    await runBuild({ cwd })
    const sharedCss = join(cwd, '.canofold/dist/assets/canofold.css')
    const previousCss = await readFile(sharedCss, 'utf8')
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 指南\n---\n# 指南\n\n新内容')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    expect(second.mode).toBe('incremental')
    expect(second.partialReload).toBe(true)
    expect(await readFile(sharedCss, 'utf8')).toBe(previousCss)
    const html = await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')
    expect(html).toContain('新内容')
  })

  it('falls back to clean builds when the site-level math resource fact changes', async () => {
    const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-incremental-math-'))
    await mkdir(join(cwd, 'node_modules/@canofold'), { recursive: true })
    await symlink(
      fileURLToPath(new URL('../../../plugins', import.meta.url)),
      join(cwd, 'node_modules/@canofold/plugins'),
      'junction'
    )
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\nPlain content')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        markdown: {
          plugins: [{
            name: 'math-assets-test',
            version: '1',
            assets: { math: true },
            appliesTo: ({ source }) => source.includes('$')
          }]
        }
      }`
    )

    await runBuild({ cwd })
    await writeFile(guidePath, '# Guide\n\n$E = mc^2$')

    const withMath = await runBuild({
      cwd
    })

    expect(withMath.incremental).toBe(false)
    expect(await readFile(join(cwd, '.canofold/dist/assets/canofold.css'), 'utf8')).toContain('KaTeX_Main')
    expect(
      (await readdir(join(cwd, '.canofold/dist/assets/fonts'))).filter((file) => file.endsWith('.woff2'))
    ).toHaveLength(20)
    expect(await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')).toContain('$E = mc^2$')

    await writeFile(guidePath, '# Guide\n\nPlain again')
    const removedMath = await runBuild({
      cwd
    })

    expect(removedMath.incremental).toBe(false)
    expect(await readFile(join(cwd, '.canofold/dist/assets/canofold.css'), 'utf8')).not.toContain(
      'KaTeX_Main'
    )
    await expect(access(join(cwd, '.canofold/dist/assets/fonts'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rebuilds shared assets when the site gains or loses its first playground', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-playground-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\nPlain content')

    await runBuild({ cwd })
    const playgroundBundle = join(cwd, '.canofold/dist/assets/canofold-playground/index.js')
    await expect(access(playgroundBundle)).rejects.toMatchObject({ code: 'ENOENT' })

    await writeFile(guidePath, '---\nlayout: playground\n---\n\n# Guide')
    const withPlayground = await runBuild({ cwd })

    expect(withPlayground.mode).toBe('clean')
    await access(playgroundBundle)
    expect(await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')).toContain(
      'data-canofold-playground-client-url="/assets/canofold-playground/index.js"'
    )

    await writeFile(guidePath, '# Guide\n\nPlain again')
    const withoutPlayground = await runBuild({ cwd })

    expect(withoutPlayground.mode).toBe('clean')
    await expect(access(playgroundBundle)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not treat removed directory links as stale assets during incremental builds', async () => {
    const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-directory-link-cleanup-'))
    await mkdir(join(cwd, 'docs/guide'), { recursive: true })
    const homePath = join(cwd, 'docs/index.md')
    await writeFile(homePath, '# Home\n\n[Guide](./guide/)')
    await writeFile(join(cwd, 'docs/guide/index.md'), '# Guide\n\nKeep this page.')
    await runBuild({ cwd })
    await writeFile(homePath, '# Home\n\nNo directory link now.')

    const rebuilt = await runBuild({ cwd })

    expect(rebuilt.incremental).toBe(true)
    expect(await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')).toContain('Keep this page.')
    const incremental = await directorySnapshot(join(cwd, '.canofold/dist'))
    await runBuild({ cwd, noCache: true })
    expect(await directorySnapshot(join(cwd, '.canofold/dist'))).toEqual(incremental)
  })

  it('removes page assets that are no longer referenced after an incremental rebuild', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-stale-asset-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\n![Old](./old.png)')
    await writeFile(join(cwd, 'docs/zh/old.png'), 'old image')

    await runBuild({ cwd })
    const generatedAsset = join(cwd, '.canofold/dist/guide/old.png')
    await access(generatedAsset)
    await writeFile(guidePath, '# Guide\n\nNo image now.')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    await expect(access(generatedAsset)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes plugin assets that are no longer required after an incremental rebuild', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-plugin-assets-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    const clientPath = join(cwd, 'plugin-client.js')
    const stylePath = join(cwd, 'plugin.css')
    await writeFile(clientPath, 'export function enhance() {}')
    await writeFile(stylePath, '.plugin-test {}')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        markdown: {
          plugins: [{
            name: 'incremental-assets-test',
            version: '1',
            appliesTo: ({ source }) => source.includes('plugin-runtime'),
            assets: {
              clients: [{ id: 'incremental-assets-test', module: ${JSON.stringify(clientPath)} }],
              styles: [{ id: 'incremental-assets-test', module: ${JSON.stringify(stylePath)} }]
            }
          }]
        }
      }`
    )
    const pagePath = join(cwd, 'docs/zh/index.md')
    await writeFile(pagePath, '# Home\n\nplugin-runtime')

    await runBuild({ cwd })
    const pluginRoot = join(cwd, '.canofold/dist/assets/canofold-plugins')
    await expect(readdir(pluginRoot)).resolves.toEqual([
      'incremental-assets-test.css',
      'incremental-assets-test.js'
    ])
    await writeFile(pagePath, '# Home\n\nNo plugin resource.')

    const second = await runBuild({ cwd })

    expect(second.incremental).toBe(true)
    await expect(access(pluginRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves a public asset when a page stops sharing ownership of its output path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-shared-asset-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/public/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\n![Shared](./shared.png)')
    await writeFile(join(cwd, 'docs/zh/shared.png'), 'shared image')
    await writeFile(join(cwd, 'docs/public/guide/shared.png'), 'shared image')

    await runBuild({ cwd })
    const generatedAsset = join(cwd, '.canofold/dist/guide/shared.png')
    await access(generatedAsset)
    await writeFile(guidePath, '# Guide\n\nNo image now.')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    expect(await readFile(generatedAsset, 'utf8')).toBe('shared image')
  })

  it('rerenders affected pages when navigation metadata changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\n---\n# 首页')
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 指南\n---\n# 指南')

    await runBuild({ cwd })
    await writeFile(join(cwd, 'docs/zh/guide.md'), '---\ntitle: 新指南\n---\n# 新指南')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    expect(second.changedPages).toHaveLength(2)
    expect(await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')).toContain('新指南')
  })

  it('rerenders affected pages when a directory group label changes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-group-'))
    await mkdir(join(cwd, 'docs/zh/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home')
    const groupIndex = join(cwd, 'docs/zh/guide/index.md')
    await writeFile(groupIndex, '---\ntitle: Guide\ngroup: Guides\n---\n# Guide')
    await writeFile(join(cwd, 'docs/zh/guide/start.md'), '---\ntitle: Start\n---\n# Start')

    await runBuild({ cwd })
    await writeFile(groupIndex, '---\ntitle: Guide\ngroup: Tutorials\n---\n# Guide')

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    expect(second.changedPages).toHaveLength(3)
    expect(await readFile(join(cwd, '.canofold/dist/guide/start/index.html'), 'utf8')).toContain('Tutorials')
  })

  it('adds required Islands when an incremental page gains core interactive blocks', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-islands-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/one.png'), 'fixture image')
    await writeFile(join(cwd, 'docs/zh/index.md'), '---\ntitle: 首页\n---\n# 首页')
    await writeFile(join(cwd, 'canofold.config.ts'), `export default { markdown: { html: 'trusted' } }`)
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '---\ntitle: 指南\n---\n# 指南\n\n普通正文')

    await runBuild({ cwd })
    await writeFile(
      guidePath,
      [
        '---',
        'title: 指南',
        '---',
        '# 指南',
        '',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '<div data-cf-component="gallery"><figure><img src="one.png" alt="One"></figure></div>'
      ].join('\n')
    )

    const second = await runBuild({
      cwd
    })

    expect(second.incremental).toBe(true)
    await access(join(cwd, '.canofold/dist/assets/canofold-markdown/index.js'))
    const html = await readFile(join(cwd, '.canofold/dist/guide/index.html'), 'utf8')
    expect(html).toContain('data-cf-island="gallery"')
    expect(html).toContain('data-cf-island="table"')
    expect(html).toContain('data-markdown-behaviors="[&quot;gallery&quot;,&quot;table&quot;]"')
    expect(html).toContain('enhanceMarkdown(root, { behaviors })')

    const interactiveSnapshot = await directorySnapshot(
      join(cwd, '.canofold/dist'),
      join(cwd, '.canofold/dist'),
      new Set(['pagefind'])
    )
    await runBuild({ cwd, noCache: true })
    expect(
      await directorySnapshot(join(cwd, '.canofold/dist'), join(cwd, '.canofold/dist'), new Set(['pagefind']))
    ).toEqual(interactiveSnapshot)

    await writeFile(guidePath, '---\ntitle: 指南\n---\n# 指南\n\n恢复普通正文')
    expect((await runBuild({ cwd })).mode).toBe('incremental')
    await expect(access(join(cwd, '.canofold/dist/assets/canofold-markdown'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
    const plainSnapshot = await directorySnapshot(
      join(cwd, '.canofold/dist'),
      join(cwd, '.canofold/dist'),
      new Set(['pagefind'])
    )
    await runBuild({ cwd, noCache: true })
    expect(
      await directorySnapshot(join(cwd, '.canofold/dist'), join(cwd, '.canofold/dist'), new Set(['pagefind']))
    ).toEqual(plainSnapshot)
  })

  it('keeps the Markdown client when only an unchanged page contains a GFM table', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-incremental-gfm-table-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(
      join(cwd, 'docs/zh/index.md'),
      ['# Home', '', '| Name | Value |', '| --- | --- |', '| Canofold | Fast |'].join('\n')
    )
    const guidePath = join(cwd, 'docs/zh/guide.md')
    await writeFile(guidePath, '# Guide\n\nBefore')

    await runBuild({ cwd })
    const markdownClient = join(cwd, '.canofold/dist/assets/canofold-markdown/index.js')
    await access(markdownClient)

    await writeFile(guidePath, '# Guide\n\nAfter')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'incremental' })

    await access(markdownClient)
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('data-cf-island="table"')
  })

  it('tracks versioned pages independently when versions share one docsDir', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-shared-version-docs-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const pagePath = join(cwd, 'docs/index.md')
    await writeFile(pagePath, '# Shared\n\nAlpha')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        versions: [
          { id: 'v2', label: '2.x', docsDir: 'docs', base: '/' },
          { id: 'v1', label: '1.x', docsDir: 'docs', base: '/v1/' }
        ]
      }`
    )

    await runBuild({ cwd })
    await writeFile(pagePath, '# Shared\n\nBeta')
    const rebuilt = await runBuild({ cwd })

    expect(rebuilt.mode).toBe('incremental')
    expect(await readFile(join(cwd, '.canofold/dist/index.html'), 'utf8')).toContain('Beta')
    expect(await readFile(join(cwd, '.canofold/dist/v1/index.html'), 'utf8')).toContain('Beta')
  })

  it('invalidates cached version controls and removes outputs when a historical entry is removed', async () => {
    const cwd = await trackedMkdtemp(join(tmpdir(), 'canofold-version-config-cache-'))
    await mkdir(join(cwd, 'handbook'), { recursive: true })
    await mkdir(join(cwd, 'old'), { recursive: true })
    await writeFile(join(cwd, 'handbook/index.md'), '# Current content')
    await writeFile(join(cwd, 'old/index.md'), '# Historical content')
    const configPath = join(cwd, 'canofold.config.ts')
    const output = join(cwd, '.canofold/dist')
    const html = () => readFile(join(output, 'index.html'), 'utf8')
    const current = { id: 'main', label: '0.7', docsDir: 'handbook', base: '/' }
    const historical = { id: 'old', label: '0.6', docsDir: 'old', base: '/old/' }
    const configure = (input: object) => writeFile(configPath, `export default ${JSON.stringify(input)}`)

    await configure({ docsDir: 'handbook' })
    await runBuild({ cwd })
    expect(await html()).not.toContain('cf-version-badge')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached' })

    await configure({ versions: [current, historical] })
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean' })
    expect(await html()).toContain('cf-version-menu')
    expect(await readFile(join(output, 'old/index.html'), 'utf8')).toContain('Historical content')
    expect(await readFile(join(output, 'ai/pages.json'), 'utf8')).not.toContain('Historical content')
    const index = JSON.parse(await readFile(join(output, 'ai/pages.json'), 'utf8'))
    expect(index.scope.versions).toEqual(['main'])
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached' })

    await configure({ versions: [{ ...current, label: '0.7 · latest' }] })
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean' })
    expect(await html()).toContain('0.7 · latest')
    expect(await html()).not.toContain('cf-version-menu')
    await expect(access(join(output, 'old/index.html'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(output, 'search/old/zh.json'))).rejects.toMatchObject({ code: 'ENOENT' })

    await configure({ docsDir: 'handbook', versions: [] })
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'clean' })
    expect(await html()).not.toContain('cf-version-badge')
    expect(await html()).toContain('Current content')
    expect(await runBuild({ cwd })).toMatchObject({ mode: 'cached' })
  })

  it('builds versioned snapshots, isolated search indexes, and redirects', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-enterprise-'))
    await mkdir(join(cwd, 'docs/zh/guide'), { recursive: true })
    await mkdir(join(cwd, 'versions/v1/zh/guide'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# 2.x')
    await writeFile(join(cwd, 'docs/zh/guide/start.md'), '# 当前指南')
    await writeFile(join(cwd, 'versions/v1/zh/index.md'), '# 1.x')
    await writeFile(join(cwd, 'versions/v1/zh/guide/start.md'), '# 旧版指南')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
        navigation: { zh: [{ text: '指南', link: '/guide/start/' }] },
        versions: [
          { id: 'v2', label: '2.x', docsDir: 'docs', base: '/' },
          { id: 'v1', label: '1.x', docsDir: 'versions/v1', base: '/v1/' }
        ],
        redirects: { '/getting-started/': '/guide/start/' }
      }`
    )

    await runBuild({ cwd })

    const current = await readFile(join(cwd, '.canofold/dist/guide/start/index.html'), 'utf8')
    const historical = await readFile(join(cwd, '.canofold/dist/v1/guide/start/index.html'), 'utf8')
    expect(current).toContain('当前指南')
    expect(current).toContain('>2.x<')
    expect(historical).toContain('旧版指南')
    expect(historical).toContain('href="/v1/guide/start/"')
    await access(join(cwd, '.canofold/dist/search/zh.json'))
    await access(join(cwd, '.canofold/dist/getting-started/index.html'))
    await access(join(cwd, '.canofold/dist/redirects.json'))
  })
})
