import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { trackedMkdtemp as mkdtemp } from '../../test/fixtures'
import { docfuseEnvDts } from './docfuseEnv'

describe('docfuse-env declarations', () => {
  it('declares only the dependency-free JSX environment', () => {
    expect(docfuseEnvDts).toContain("declare module 'react/jsx-runtime'")
    expect(docfuseEnvDts).toContain('namespace JSX')
    expect(docfuseEnvDts).not.toContain('docfuse/components')
    expect(docfuseEnvDts).not.toContain('@docfuse/markdown/components')
  })

  it('typechecks project-local TSX without a public component module', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'docfuse-env-types-'))
    const declarations = join(cwd, 'docfuse-env.d.ts')
    const usage = join(cwd, 'usage.tsx')
    await writeFile(declarations, docfuseEnvDts)
    await writeFile(
      usage,
      `/// <reference path="./docfuse-env.d.ts" />
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
