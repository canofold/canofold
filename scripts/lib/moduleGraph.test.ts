import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { moduleGraph } from './moduleGraph.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('moduleGraph', () => {
  it('follows parent-directory imports and includes dynamic imports only when requested', async () => {
    const root = await mkdtemp(join(tmpdir(), 'canofold-module-graph-'))
    temporaryDirectories.push(root)
    await mkdir(join(root, 'server'), { recursive: true })
    await writeFile(
      join(root, 'server/analyze.js'),
      "export { analyze } from '../shared.js'\nimport('./lazy.js')"
    )
    await writeFile(join(root, 'shared.js'), 'export const analyze = true')
    await writeFile(join(root, 'server/lazy.js'), 'export const lazy = true')

    const synchronous = await moduleGraph(root, 'server/analyze.js')
    expect([...synchronous].map((path) => path.slice(root.length + 1)).sort()).toEqual([
      'server/analyze.js',
      'shared.js'
    ])

    const complete = await moduleGraph(root, 'server/analyze.js', true)
    expect([...complete].map((path) => path.slice(root.length + 1)).sort()).toEqual([
      'server/analyze.js',
      'server/lazy.js',
      'shared.js'
    ])
  })
})
