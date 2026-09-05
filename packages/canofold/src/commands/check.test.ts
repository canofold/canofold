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

    expect(issues).toContainEqual({
      severity: 'error',
      page: 'zh/index.md',
      message: 'Each Gallery item must contain exactly one Markdown image (line 7, column 1)'
    })
  })

  it('validates relative heading links against the matching documentation version', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-check-versions-'))
    await mkdir(join(cwd, 'docs/current/zh'), { recursive: true })
    await mkdir(join(cwd, 'docs/v1/zh'), { recursive: true })
    await writeFile(
      join(cwd, 'canofold.config.ts'),
      `export default {
  i18n: { defaultLocale: 'zh', locales: ['zh'] },
  versions: {
    current: 'current',
    items: [
      { id: 'current', label: 'Current', docsDir: 'docs/current', base: '/' },
      { id: 'v1', label: 'v1', docsDir: 'docs/v1', base: '/v1/' }
    ]
  }
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
