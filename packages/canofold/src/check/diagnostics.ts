import type { CheckIssue } from './runChecks'
import type { CheckRuleId } from './rules'

export interface CheckDiagnostic extends CheckIssue {
  /** Content syntax cannot be disabled: no valid page exists to publish. */
  ruleId: CheckRuleId | 'content-syntax'
  page?: string
  sourcePointer?: string
  suggestion?: string
}

export function formatDiagnostic(issue: CheckDiagnostic) {
  const location = issue.page
    ? ` ${issue.page}${issue.sourcePointer === undefined ? '' : `#${issue.sourcePointer}`}${issue.line === undefined ? '' : `:${issue.line}${issue.column === undefined ? '' : `:${issue.column}`}`}`
    : ''
  return `${issue.severity.toUpperCase()} [${issue.ruleId}]:${location}${location ? ':' : ''} ${issue.message}`
}

/** Only recognized content failures are recoverable, not arbitrary tool/plugin errors. */
export class ContentDiagnosticsError extends Error {
  constructor(readonly diagnostics: readonly CheckDiagnostic[]) {
    super(diagnostics.map(formatDiagnostic).join('\n'))
    this.name = 'ContentDiagnosticsError'
  }
}

/** Unified/MDX parser errors carry authored positions; ordinary plugin exceptions do not. */
export function markdownSyntaxDiagnostic(
  error: unknown,
  page: string,
  lineOffset: number
): CheckDiagnostic | undefined {
  if (
    !(error instanceof Error) ||
    !('reason' in error) ||
    typeof error.reason !== 'string' ||
    !('source' in error) ||
    typeof error.source !== 'string' ||
    !('ruleId' in error)
  )
    return undefined
  const position = error as Error & { line?: number; column?: number; reason: string }
  return {
    ruleId: 'content-syntax',
    severity: 'error',
    page,
    message: position.reason,
    ...(Number.isSafeInteger(position.line) && position.line! > 0
      ? {
          line: position.line! + lineOffset,
          ...(Number.isSafeInteger(position.column) && position.column! > 0
            ? { column: position.column }
            : {})
        }
      : {})
  }
}
