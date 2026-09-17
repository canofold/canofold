import { createHash } from 'node:crypto'
import type { MarkdownDirective } from '@canofold/markdown/server/analyze'
import type { DocPage } from '../content/types'
import type { CanofoldDemoReference, CanofoldDemoSandbox } from './types'

export const demoDirectivePlugin = {
  name: 'canofold-demo',
  version: '1',
  directiveNames: ['demo']
} as const

function locationOf(directive: MarkdownDirective) {
  return directive.line === undefined
    ? ''
    : ` at line ${directive.line}${directive.column === undefined ? '' : `, column ${directive.column}`}`
}

function demoId(page: Pick<DocPage, 'version' | 'sourceRelativePath'>, directive: MarkdownDirective) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        page.version,
        page.sourceRelativePath,
        directive.line ?? 0,
        directive.column ?? 0,
        directive.attributes.src ?? ''
      ])
    )
    .digest('hex')
    .slice(0, 16)
}

function validateSpecifier(value: string, directive: MarkdownDirective, page: DocPage) {
  if (!value) {
    throw new Error(
      `Demo directives require a \`src\` attribute in ${page.sourceRelativePath}${locationOf(directive)}`
    )
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) {
    throw new Error(
      `Demo \`src\` must reference a project module, got ${JSON.stringify(value)} in ${page.sourceRelativePath}${locationOf(directive)}`
    )
  }
  if (value.includes('\0') || value.includes('?') || value.includes('#')) {
    throw new Error(
      `Demo \`src\` must not contain a null byte, query, or fragment in ${page.sourceRelativePath}${locationOf(directive)}`
    )
  }
  return value
}

function validateSandbox(value: string | undefined, directive: MarkdownDirective, page: DocPage) {
  if (!value || value === 'inline') return 'inline' satisfies CanofoldDemoSandbox
  if (value === 'iframe') return 'iframe' satisfies CanofoldDemoSandbox
  throw new Error(
    `Demo \`sandbox\` must be \`inline\` or \`iframe\` in ${page.sourceRelativePath}${locationOf(directive)}`
  )
}

export function demoReferencesForPage(page: DocPage, directives: readonly MarkdownDirective[]) {
  return directives
    .filter((directive) => directive.name === 'demo')
    .map((directive): CanofoldDemoReference => {
      if (directive.type !== 'leafDirective') {
        throw new Error(
          `Demo directives must use leaf syntax in ${page.sourceRelativePath}${locationOf(directive)}`
        )
      }
      const unexpected = Object.keys(directive.attributes).filter(
        (name) => name !== 'src' && name !== 'sandbox' && name !== 'description'
      )
      if (unexpected.length > 0) {
        throw new Error(
          `Demo directives do not support ${unexpected.map((name) => `\`${name}\``).join(', ')} in ${page.sourceRelativePath}${locationOf(directive)}`
        )
      }
      return {
        id: demoId(page, directive),
        ...(directive.label ? { title: directive.label } : {}),
        ...(directive.attributes.description?.trim()
          ? { description: directive.attributes.description.trim() }
          : {}),
        specifier: validateSpecifier(directive.attributes.src?.trim() ?? '', directive, page),
        sandbox: validateSandbox(directive.attributes.sandbox?.trim(), directive, page),
        pageSourcePath: page.sourcePath,
        pageSourceRelativePath: page.sourceRelativePath,
        routePath: page.routePath,
        locale: page.locale,
        ...(directive.line === undefined ? {} : { line: directive.line }),
        ...(directive.column === undefined ? {} : { column: directive.column }),
        ...(directive.offset === undefined ? {} : { sourceOffset: directive.offset }),
        ...(directive.endOffset === undefined ? {} : { sourceEndOffset: directive.endOffset })
      }
    })
}
