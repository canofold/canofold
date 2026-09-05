import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { canofoldEnvDts } from './canofoldEnv'

describe('canofold-env declarations', () => {
  it('declares only the dependency-free JSX environment', () => {
    expect(canofoldEnvDts).toContain("declare module 'react/jsx-runtime'")
    expect(canofoldEnvDts).toContain('namespace JSX')
    expect(canofoldEnvDts).not.toContain('canofold/components')
    expect(canofoldEnvDts).not.toContain('@canofold/markdown/components')
  })

  it('typechecks project-local TSX without a public component module', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'canofold-env-types-'))
    const declarations = join(cwd, 'canofold-env.d.ts')
    const usage = join(cwd, 'usage.tsx')
    await writeFile(declarations, canofoldEnvDts)
    await writeFile(
      usage,
      `/// <reference path="./canofold-env.d.ts" />
export function LocalNotice() {
  return <aside data-kind="notice">Details</aside>
}
void LocalNotice
`
    )

    const program = ts.createProgram([usage, declarations], {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    expect(
      diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    ).toEqual([])
  })
})
