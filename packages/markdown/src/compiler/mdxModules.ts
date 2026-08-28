import { createProcessor } from '@mdx-js/mdx'
import type { BaseNode, ImportDeclaration, Node as EstreeNode } from 'estree'
import type { Root } from 'mdast'

export interface MdxImportBinding {
  imported: string
  local: string
  namespace?: boolean
}

export interface MdxImportDeclaration {
  specifier: string
  bindings: MdxImportBinding[]
}

export interface MdxModuleBoundary {
  imports: MdxImportDeclaration[]
  sourceWithoutImports: string
  unsupportedReferences: Array<{
    kind: 'dynamic-import' | 'export-from'
    specifier?: string
  }>
}

type PositionedNode = BaseNode & { start: number; end: number }

function importBindings(statement: ImportDeclaration): MdxImportBinding[] {
  return statement.specifiers.map((specifier) => {
    if (specifier.type === 'ImportDefaultSpecifier') {
      return { imported: 'default', local: specifier.local.name }
    }
    if (specifier.type === 'ImportNamespaceSpecifier') {
      return { imported: '*', local: specifier.local.name, namespace: true }
    }
    return {
      imported:
        specifier.type === 'ImportSpecifier'
          ? 'name' in specifier.imported
            ? specifier.imported.name
            : String(specifier.imported.value ?? '')
          : '',
      local: specifier.local.name
    }
  })
}

function isEstreeNode(value: unknown): value is EstreeNode {
  return Boolean(value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string')
}

function hasOffsets(node: BaseNode): node is PositionedNode {
  const candidate = node as BaseNode & { start?: unknown; end?: unknown }
  return typeof candidate.start === 'number' && typeof candidate.end === 'number'
}

function walkEstree(value: unknown, visit: (node: EstreeNode) => void) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walkEstree(child, visit)
    return
  }
  const record = value as Record<string, unknown>
  if (isEstreeNode(value)) visit(value)
  for (const [key, child] of Object.entries(record)) {
    if (key === 'loc' || key === 'position') continue
    walkEstree(child, visit)
  }
}

/** Parse only real top-level MDX module syntax, leaving fenced examples intact. */
export function analyzeMdxModuleBoundary(source: string): MdxModuleBoundary {
  const tree = createProcessor().parse(source) as Root
  const imports: MdxImportDeclaration[] = []
  const unsupportedReferences: MdxModuleBoundary['unsupportedReferences'] = []
  const importRanges: Array<{ start: number; end: number }> = []

  walkEstree(tree, (node) => {
    if (node.type === 'ImportExpression') {
      const specifier =
        node.source.type === 'Literal' && typeof node.source.value === 'string'
          ? node.source.value
          : undefined
      unsupportedReferences.push({
        kind: 'dynamic-import',
        specifier
      })
    }
  })

  for (const child of tree.children ?? []) {
    if (child.type !== 'mdxjsEsm') continue
    for (const statement of child.data?.estree?.body ?? []) {
      if (statement.type === 'ImportDeclaration') {
        imports.push({
          specifier: String(statement.source.value),
          bindings: importBindings(statement)
        })
        if (!hasOffsets(statement)) {
          throw new Error('Unable to locate an MDX import declaration in the source document')
        }
        importRanges.push({ start: statement.start, end: statement.end })
      } else if (
        (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration') &&
        statement.source
      ) {
        unsupportedReferences.push({
          kind: 'export-from',
          specifier: String(statement.source.value)
        })
      }
    }
  }

  const sourceWithoutImports = [
    ...new Map(importRanges.map((range) => [`${range.start}:${range.end}`, range])).values()
  ]
    .sort((left, right) => right.start - left.start)
    .reduce((result, range) => `${result.slice(0, range.start)}${result.slice(range.end)}`, source)
    .replace(/^\s*\n/, '')

  return { imports, sourceWithoutImports, unsupportedReferences }
}
