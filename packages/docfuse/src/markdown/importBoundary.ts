import { analyzeMdxModuleBoundary, type MdxImportDeclaration } from '@docfuse/markdown/server/analyze'

const DOCS_IMPORT_SPECIFIERS = ['react', 'react/jsx-runtime'] as const

export type DocsImportSpecifier = (typeof DOCS_IMPORT_SPECIFIERS)[number]

const allowedBareImports = new Set<string>(DOCS_IMPORT_SPECIFIERS)

export function isDocsImportSpecifier(specifier: string): specifier is DocsImportSpecifier {
  return allowedBareImports.has(specifier)
}

export function isAllowedDocsImport(specifier: string) {
  return specifier.startsWith('.') || isDocsImportSpecifier(specifier)
}

interface PreparedMdxSource {
  source: string
  imports: MdxImportDeclaration[]
}

export function prepareMdxSource(source: string): PreparedMdxSource {
  const boundary = analyzeMdxModuleBoundary(source)
  for (const reference of boundary.unsupportedReferences) {
    const label = reference.kind === 'dynamic-import' ? 'Dynamic import' : 'Re-export'
    throw new Error(`${label} is not allowed in MDX${reference.specifier ? `: ${reference.specifier}` : ''}`)
  }
  for (const { specifier } of boundary.imports) {
    if (!isAllowedDocsImport(specifier)) throw new Error(`External import is not allowed: ${specifier}`)
  }
  return { source: boundary.sourceWithoutImports, imports: boundary.imports }
}
