import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertDisjointPaths,
  assertProjectPath,
  pathExists,
  portablePathKey,
  resolveOutputPath,
  resolveOutputRoot,
  resolveProjectPath
} from './paths'

describe('portablePathKey', () => {
  it('treats case and Unicode normalization variants as the same portable path', () => {
    expect(portablePathKey('GUIDE/caf\u00e9/index.html')).toBe(portablePathKey('guide/cafe\u0301/index.html'))
  })
})

describe('pathExists', () => {
  it('returns false only for missing paths and preserves other file-system errors', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' })

    await expect(pathExists('/missing', async () => Promise.reject(missing))).resolves.toBe(false)
    await expect(pathExists('/denied', async () => Promise.reject(denied))).rejects.toBe(denied)
    await expect(pathExists('/present', async () => undefined)).resolves.toBe(true)
  })
})

describe('resolveProjectPath', () => {
  it('allows project files and rejects paths outside the project', () => {
    expect(resolveProjectPath('/tmp/project', 'docs/brand.css', 'styles')).toBe(
      join('/tmp/project', 'docs/brand.css')
    )
    expect(() => resolveProjectPath('/tmp/project', '../brand.css', 'styles')).toThrow(
      'styles must resolve to a path inside the project root'
    )
  })
})

describe('resolveOutputRoot', () => {
  it('resolves an output directory inside the project root', () => {
    expect(resolveOutputRoot('/tmp/project', '.docfuse/dist')).toBe(join('/tmp/project', '.docfuse/dist'))
  })

  it('rejects the project root and paths outside it', () => {
    expect(() => resolveOutputRoot('/tmp/project', '.')).toThrow('inside the project root')
    expect(() => resolveOutputRoot('/tmp/project', '../dist')).toThrow('inside the project root')
    expect(() => resolveOutputRoot('/tmp/project', '/tmp/other')).toThrow('inside the project root')
  })
})

describe('output path safety', () => {
  it('rejects project paths that escape through a symbolic link', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-project-path-'))
    const outside = await mkdtemp(join(tmpdir(), 'docfuse-project-path-outside-'))
    await symlink(outside, join(cwd, 'linked'))

    try {
      await expect(assertProjectPath(cwd, join(cwd, 'linked/dist'), 'outputDir')).rejects.toThrow(
        'outputDir must resolve to a path inside the project root'
      )
    } finally {
      await Promise.all([
        rm(cwd, { recursive: true, force: true }),
        rm(outside, { recursive: true, force: true })
      ])
    }
  })

  it('rejects overlapping input and output directories', async () => {
    await expect(
      assertDisjointPaths('/tmp/project/.docfuse/dist', '/tmp/project/docs', 'docsDir')
    ).resolves.toBeUndefined()
    await expect(assertDisjointPaths('/tmp/project/docs', '/tmp/project/docs', 'docsDir')).rejects.toThrow(
      'must not overlap outputDir'
    )
    await expect(
      assertDisjointPaths('/tmp/project/docs/site', '/tmp/project/docs', 'docsDir')
    ).rejects.toThrow('must not overlap outputDir')
    await expect(
      assertDisjointPaths('/tmp/project/docs', '/tmp/project/docs/site', 'docsDir')
    ).rejects.toThrow('must not overlap outputDir')
  })

  it('rejects overlap hidden behind a symbolic link', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-path-safety-'))
    const outputRoot = join(cwd, '.docfuse/dist')
    await mkdir(outputRoot, { recursive: true })
    await symlink(outputRoot, join(cwd, 'docs'))

    try {
      await expect(assertDisjointPaths(outputRoot, join(cwd, 'docs'), 'docsDir')).rejects.toThrow(
        'must not overlap outputDir'
      )
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('keeps generated paths inside the output directory', () => {
    expect(resolveOutputPath('/tmp/project/dist', 'guide/index.html', 'page')).toBe(
      join('/tmp/project/dist', 'guide/index.html')
    )
    expect(() => resolveOutputPath('/tmp/project/dist', '../../escape.html', 'page')).toThrow(
      'must stay inside outputDir'
    )
  })
})
