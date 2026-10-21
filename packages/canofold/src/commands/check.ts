import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../config/load'
import { buildContentGraph } from '../content/graph'
import { loadExtensionHost } from '../extensions/host'
import { summarizeTranslationCoverage, summarizeTranslationStatus } from '../check/runChecks'
import { checkContentGraph } from '../check/project'
import { formatDiagnostic, type CheckDiagnostic } from '../check/diagnostics'
import { prepareDemoManifest } from '../demos/prepare'

export type { CheckDiagnostic } from '../check/diagnostics'

export async function runCheck({ cwd, format = 'text' }: { cwd: string; format?: 'text' | 'json' }) {
  const config = await loadConfig(cwd)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'canofold-check-'))
  const extensions = await loadExtensionHost(cwd, temporaryRoot, config.extensions).finally(() =>
    rm(temporaryRoot, { recursive: true, force: true })
  )
  const diagnostics: CheckDiagnostic[] = []
  const graph = await buildContentGraph(cwd, config, extensions, { includeDrafts: true, diagnostics })
  const issues = await checkContentGraph(cwd, config, graph, extensions.publicOutputPaths, diagnostics)
  if (!diagnostics.length) await prepareDemoManifest({ cwd, config, graph, mode: 'analyze' })
  const publishedGraph = { ...graph, pages: graph.pages.filter((page) => page.status === 'published') }
  if (format === 'json') {
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          diagnostics: issues,
          translationCoverage: summarizeTranslationCoverage(publishedGraph),
          translationStatus: summarizeTranslationStatus(publishedGraph)
        },
        null,
        2
      )
    )
  } else {
    for (const issue of issues) console.log(formatDiagnostic(issue))
  }
  if (issues.some((issue) => issue.severity === 'error')) process.exitCode = 1
  return issues
}
