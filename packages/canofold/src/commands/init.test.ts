import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { promptForLocales, runInit } from './init'
import { canofoldVersion } from '../index'

describe('promptForLocales', () => {
  it('reports terminal cancellation and always closes the readline interface', async () => {
    const close = vi.fn()
    const cancelled = Object.assign(new Error('cancelled'), { code: 'ABORT_ERR' })
    const readline = {
      question: vi.fn().mockRejectedValue(cancelled),
      close
    }

    await expect(promptForLocales(readline)).rejects.toThrow('Canofold initialization cancelled')
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('runInit', () => {
  it('creates docs scaffold in current directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await runInit({ cwd })

    const zhIndex = await readFile(join(cwd, 'docs/index.md'), 'utf8')
    const config = await readFile(join(cwd, 'canofold.config.ts'), 'utf8')
    const envDts = await readFile(join(cwd, 'docs/canofold-env.d.ts'), 'utf8')

    expect(zhIndex).toContain('# 欢迎使用 Canofold')
    expect(config).toContain("import { defineConfig } from 'canofold'")
    expect(config).toContain('export default defineConfig({')
    expect(config).toContain("title: 'Canofold'")
    expect(config).toContain(`requiredVersion: '^${canofoldVersion}'`)
    expect(config).toContain("locales: ['zh']")
    expect(envDts).toContain("declare module 'react/jsx-runtime'")
    expect(envDts).not.toContain("declare module 'canofold/components'")
    await expect(access(join(cwd, 'docs/zh'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(cwd, 'docs/en'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('creates a named standalone docs project', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await runInit({ cwd, targetDir: 'my-docs' })

    const guide = await readFile(join(cwd, 'my-docs/docs/guide.md'), 'utf8')
    expect(guide).toContain('# 指南')
  })

  it('creates locale directories only for non-default languages', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await runInit({ cwd, locale: 'zh', locales: ['zh', 'en', 'ja'] })

    await expect(readFile(join(cwd, 'docs/index.md'), 'utf8')).resolves.toContain('# 欢迎使用 Canofold')
    await expect(readFile(join(cwd, 'docs/en/guide.md'), 'utf8')).resolves.toContain('# Guide')
    const neutralIndex = await readFile(join(cwd, 'docs/ja/index.md'), 'utf8')
    expect(neutralIndex).toContain('# Canofold')
    expect(neutralIndex).toContain('description:')
    await expect(access(join(cwd, 'docs/ja/guide.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(cwd, 'docs/zh'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    ['en-US', '# Welcome to Canofold', '# Guide'],
    ['zh-CN', '# 欢迎使用 Canofold', '# 指南']
  ])('uses the %s base-language templates', async (locale, indexHeading, guideHeading) => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))

    await runInit({ cwd, locale })

    await expect(readFile(join(cwd, 'docs/index.md'), 'utf8')).resolves.toContain(indexHeading)
    await expect(readFile(join(cwd, 'docs/guide.md'), 'utf8')).resolves.toContain(guideHeading)
  })

  it('adopts existing documents without modifying or supplementing their content', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const existing = join(cwd, 'docs/guide.md')
    await writeFile(existing, 'keep existing')

    await runInit({ cwd, locale: 'en' })

    await expect(readFile(existing, 'utf8')).resolves.toBe('keep existing')
    await expect(readFile(join(cwd, 'canofold.config.ts'), 'utf8')).resolves.toContain("defaultLocale: 'en'")
    await expect(readFile(join(cwd, 'docs/canofold-env.d.ts'), 'utf8')).resolves.toContain(
      "declare module 'react/jsx-runtime'"
    )
    await expect(access(join(cwd, 'docs/index.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('adopts existing documents with uppercase Markdown extensions', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-extension-case-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const existing = join(cwd, 'docs/Index.MD')
    await writeFile(existing, '# Existing uppercase home')

    await runInit({ cwd, locale: 'en' })

    await expect(readFile(existing, 'utf8')).resolves.toBe('# Existing uppercase home')
    await expect(access(join(cwd, 'docs/guide.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(cwd, 'canofold.config.ts'), 'utf8')).resolves.toContain("defaultLocale: 'en'")
  })

  it('reports whether it adopted content and what to do next', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Existing')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await runInit({ cwd, locale: 'zh' })
      const output = log.mock.calls.flat().join('\n')
      expect(output).toContain('Adopted 1 existing document')
      expect(output).toContain('Next: canofold check')
    } finally {
      log.mockRestore()
    }
  })

  it('warns when root and legacy default-locale files overlap', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await mkdir(join(cwd, 'docs/zh'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Root')
    await writeFile(join(cwd, 'docs/zh/index.md'), '# Legacy')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await runInit({ cwd, locale: 'zh' })
      expect(log.mock.calls.flat().join('\n')).toContain(
        'docs/index.md and docs/zh/index.md map to the same default-language page'
      )
    } finally {
      log.mockRestore()
    }
  })

  it('requires an explicit locale for existing documents in a non-interactive environment', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    await writeFile(join(cwd, 'docs/index.md'), '# Existing')

    await expect(runInit({ cwd })).rejects.toThrow(
      'cannot determine their language in a non-interactive environment'
    )
    await expect(access(join(cwd, 'canofold.config.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(cwd, 'docs/canofold-env.d.ts'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('does not treat Markdown files in public as document content', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await mkdir(join(cwd, 'docs/public'), { recursive: true })
    const publicFile = join(cwd, 'docs/public/notice.md')
    await writeFile(publicFile, 'public download')

    await runInit({ cwd })

    await expect(readFile(publicFile, 'utf8')).resolves.toBe('public download')
    await expect(readFile(join(cwd, 'docs/index.md'), 'utf8')).resolves.toContain('# 欢迎使用 Canofold')
  })

  it('uses an interactive locale selection when adopting existing documents', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await mkdir(join(cwd, 'docs'), { recursive: true })
    const existing = join(cwd, 'docs/index.md')
    await writeFile(existing, '# Existing English documentation')

    await runInit({ cwd, localePrompt: async () => ['en'] })

    await expect(readFile(existing, 'utf8')).resolves.toBe('# Existing English documentation')
    await expect(readFile(join(cwd, 'canofold.config.ts'), 'utf8')).resolves.toContain("defaultLocale: 'en'")
  })

  it('is a successful no-op when the project is already initialized', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await runInit({ cwd })
    const before = await Promise.all([
      readFile(join(cwd, 'canofold.config.ts'), 'utf8'),
      readFile(join(cwd, 'docs/index.md'), 'utf8'),
      readFile(join(cwd, 'docs/guide.md'), 'utf8'),
      readFile(join(cwd, 'docs/canofold-env.d.ts'), 'utf8')
    ])

    await expect(runInit({ cwd })).resolves.toBeUndefined()

    await expect(
      Promise.all([
        readFile(join(cwd, 'canofold.config.ts'), 'utf8'),
        readFile(join(cwd, 'docs/index.md'), 'utf8'),
        readFile(join(cwd, 'docs/guide.md'), 'utf8'),
        readFile(join(cwd, 'docs/canofold-env.d.ts'), 'utf8')
      ])
    ).resolves.toEqual(before)
  })

  it('uses an existing configuration to scaffold an empty project', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    const config = `export default {
  docsDir: 'handbook',
  i18n: { defaultLocale: 'en', locales: ['en', 'zh'] }
}
`
    await writeFile(join(cwd, 'canofold.config.ts'), config)

    await runInit({ cwd })

    await expect(readFile(join(cwd, 'canofold.config.ts'), 'utf8')).resolves.toBe(config)
    await expect(readFile(join(cwd, 'handbook/index.md'), 'utf8')).resolves.toContain('# Welcome to Canofold')
    await expect(readFile(join(cwd, 'handbook/zh/index.md'), 'utf8')).resolves.toContain(
      '# 欢迎使用 Canofold'
    )
    await expect(readFile(join(cwd, 'handbook/canofold-env.d.ts'), 'utf8')).resolves.toContain(
      "declare module 'react/jsx-runtime'"
    )
  })

  it('rejects options that conflict with an existing configuration before writing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    const config = `export default {
  docsDir: 'handbook',
  i18n: { defaultLocale: 'en', locales: ['en'] }
}
`
    await writeFile(join(cwd, 'canofold.config.ts'), config)

    await expect(runInit({ cwd, locale: 'zh' })).rejects.toThrow(
      '--locale zh conflicts with configured defaultLocale en'
    )
    await expect(readFile(join(cwd, 'canofold.config.ts'), 'utf8')).resolves.toBe(config)
    await expect(access(join(cwd, 'handbook'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('uses a custom project-relative docs directory and rejects absolute paths', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await runInit({ cwd, docsDir: 'handbook', locale: 'en' })

    await expect(readFile(join(cwd, 'handbook/index.md'), 'utf8')).resolves.toContain('# Welcome to Canofold')
    await expect(readFile(join(cwd, 'handbook/canofold-env.d.ts'), 'utf8')).resolves.toContain(
      "declare module 'react/jsx-runtime'"
    )
    await expect(readFile(join(cwd, 'canofold.config.ts'), 'utf8')).resolves.toContain('docsDir: "handbook"')
    await expect(access(join(cwd, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' })

    const another = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await expect(runInit({ cwd: another, docsDir: join(another, 'handbook') })).rejects.toThrow(
      'docsDir must be a relative path'
    )
    await expect(access(join(another, 'canofold.config.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preflights blocking directories before creating any files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    await mkdir(join(cwd, 'docs/canofold-env.d.ts'), { recursive: true })

    await expect(runInit({ cwd })).rejects.toThrow(
      'Cannot create docs/canofold-env.d.ts because a directory exists at that path'
    )
    await expect(access(join(cwd, 'canofold.config.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(cwd, 'docs/index.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rolls back files and directories created before a write failure', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-init-'))
    const failure = new Error('simulated write failure')
    let writeCount = 0

    await expect(
      runInit(
        { cwd },
        {
          writeFile: async (path, content, options) => {
            writeCount += 1
            if (writeCount === 2) throw failure
            await writeFile(path, content, options)
          }
        }
      )
    ).rejects.toBe(failure)

    expect(writeCount).toBe(2)
    await expect(access(join(cwd, 'canofold.config.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(cwd, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
