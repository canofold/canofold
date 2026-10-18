import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { runCheck } from './check'

const originalExitCode = process.exitCode

afterEach(() => {
  process.exitCode = originalExitCode
  vi.restoreAllMocks()
})

describe('runCheck', () => {
  it('rejects a draft-only home before the production build', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-draft-home-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '---\nstatus: draft\n---\n# Home')

    await expect(runCheck({ cwd })).rejects.toThrow(
      'Missing published home page for version "current" locale "zh"'
    )
  })

  it('rejects historical MDX components outside their version before the build', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-historical-mdx-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await mkdir(join(cwd, 'versions/v1'), { recursive: true })
    await mkdir(join(cwd, 'src'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Current')
    await writeFile(join(cwd, 'versions/v1/index.md'), '# Historical')
    await writeFile(join(cwd, 'src/Shared.tsx'), 'export default function Shared() { return null }')
    await writeFile(
      join(cwd, 'versions/v1/guide.mdx'),
      'import Shared from "../../src/Shared"\n\n# Historical guide\n\n<Shared />'
    )
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default { versions: [
        { id: 'current', label: 'Current', docsDir: 'docs', base: '/' },
        { id: 'v1', label: 'v1', docsDir: 'versions/v1', base: '/v1/' }
      ] }`
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCheck({ cwd })).rejects.toThrow('Historical page depends on a file outside versions/v1')

    await writeFile(join(cwd, 'versions/v1/Shared.tsx'), 'export default function Shared() { return null }')
    await writeFile(
      join(cwd, 'versions/v1/guide.mdx'),
      'import Shared from "./Shared"\n\n# Historical guide\n\n<Shared />'
    )
    expect((await runCheck({ cwd })).filter((issue) => issue.severity === 'error')).toEqual([])
  })
  it('checks draft pages without publishing them', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-draft-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'docs/draft.md'), '---\nstatus: draft\n---\n# Draft\n\n[Missing](./missing.md)')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const issues = await runCheck({ cwd })

    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        page: 'docs/draft.md',
        message: 'Link target does not exist: ./missing.md'
      })
    )
  })

  it('rejects published links to draft pages', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-draft-link-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n[Draft](./draft.md)')
    await writeFile(join(cwd, 'docs/draft.md'), '---\nstatus: draft\n---\n# Draft')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const issues = await runCheck({ cwd })

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'broken-link',
        page: 'docs/index.md',
        severity: 'error',
        message: 'Link target does not exist: ./draft.md'
      })
    )
  })
  it('rejects symbolic links consistently with build instead of treating them as files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-symlink-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Home')
    await writeFile(join(cwd, 'outside.png'), 'outside')
    await symlink(join(cwd, 'outside.png'), join(cwd, 'docs/linked.png'))

    await expect(runCheck({ cwd })).rejects.toThrow('must not use symbolic links')
  })

  it('sets a failing process exit code when documentation errors are found', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Home\n\n![Missing](missing.png)')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const issues = await runCheck({ cwd })

    expect(issues.some((issue) => issue.severity === 'error')).toBe(true)
    expect(process.exitCode).toBe(1)
  })

  it('reports malformed rich directives at their file-relative source line', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-directives-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(
      join(cwd, 'docs/zh/index.md'),
      [
        '---',
        'title: Home',
        'description: Home page',
        '---',
        '',
        ':::gallery[Preview]',
        'Visible prose',
        ':::'
      ].join('\n')
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const issues = await runCheck({ cwd })

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'directive-syntax',
        severity: 'error',
        page: 'docs/zh/index.md',
        line: 7,
        column: 1,
        message: 'Each Gallery item must contain exactly one Markdown image'
      })
    )
  })

  it('locates broken links and unlabeled code fences in the original file', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-position-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(
      join(cwd, 'docs/index.md'),
      ['---', 'title: Home', '---', '', '[Gone](./missing.md)', '', '```', 'code', '```'].join('\n')
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const issues = await runCheck({ cwd })

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'broken-link',
        page: 'docs/index.md',
        line: 5,
        column: 1
      })
    )
    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'code-block-language',
        page: 'docs/index.md',
        line: 7,
        column: 1
      })
    )
  })

  it('emits machine-readable diagnostics and applies rule-level severity', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-json-'))
    await mkdir(join(cwd, 'docs'))
    await writeFile(join(cwd, 'docs/index.md'), '# Home\n\n[Missing](./gone.md)')
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
      checks: { rules: { 'broken-link': 'warning', 'frontmatter-description': 'off' } }
    }`
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const issues = await runCheck({ cwd, format: 'json' })

    expect(issues).toContainEqual(
      expect.objectContaining({
        ruleId: 'broken-link',
        page: 'docs/index.md',
        severity: 'warning',
        message: 'Link target does not exist: ./gone.md',
        suggestion: expect.any(String)
      })
    )
    expect(issues.some((issue) => issue.ruleId === 'frontmatter-description')).toBe(false)
    expect(process.exitCode).toBe(originalExitCode)
    const report = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(report).toMatchObject({ schemaVersion: 1, diagnostics: issues })
  })

  it('validates relative heading links against the matching documentation version', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-versions-'))
    await mkdir(join(cwd, 'docs/current/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/v1/zh'), { recursive: true })
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
  i18n: { defaultLocale: 'zh', locales: ['zh'] },
  versions: [
    { id: 'current', label: 'Current', docsDir: 'docs/current', base: '/' },
    { id: 'v1', label: 'v1', docsDir: 'docs/v1', base: '/v1/' }
  ]
}`
    )
    await writeFile(
      join(cwd, 'docs/current/zh/index.md'),
      '---\ntitle: Home\ndescription: Home\n---\n\n[Guide](./guide.md#current-heading)'
    )
    await writeFile(
      join(cwd, 'docs/current/zh/guide.md'),
      '---\ntitle: Guide\ndescription: Guide\n---\n\n## Current heading'
    )
    await writeFile(
      join(cwd, 'docs/v1/zh/index.md'),
      '---\ntitle: Old home\ndescription: Old home\n---\n\n[Guide](./guide.md#old-heading)'
    )
    await writeFile(
      join(cwd, 'docs/v1/zh/guide.md'),
      '---\ntitle: Old guide\ndescription: Old guide\n---\n\n## Old heading'
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const issues = await runCheck({ cwd })

    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })
})
