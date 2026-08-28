import type { DocfuseFrontmatter } from '../content/frontmatter'
import type { DocfuseJsonValue } from '../config/types'

export const DOCFUSE_EXTENSION_API_VERSION = 1 as const

export interface DocfuseExtensionSourceContext {
  source: string
  sourceRelativePath: string
  relativePath: string
  kind: 'markdown' | 'mdx'
  version: string
  locale: string
}

export interface DocfuseExtensionPage {
  sourceRelativePath: string
  relativePath: string
  version: string
  locale: string
  routePath: string
  title: string
  description: string
  status: 'draft' | 'published'
  search: boolean
  ai: boolean
  body: string
  searchText: string
  frontmatter: DocfuseFrontmatter
}

export interface DocfuseExtensionPagePatch {
  title?: string
  description?: string
  searchText?: string
  search?: boolean
  ai?: boolean
}

export interface DocfuseExtensionGenerateContext {
  pages: readonly DocfuseExtensionPage[]
  emitFile(path: string, content: string | Uint8Array): Promise<void>
}

/**
 * Versioned, semantic site-build contract. Compiler ASTs and internal render
 * plugins intentionally stay private so upgrades do not depend on pipeline order.
 * Per-document syntax belongs to MarkdownPlugin; whole-site search indexing
 * belongs to SearchProvider.
 */
export interface DocfuseExtension {
  apiVersion: typeof DOCFUSE_EXTENSION_API_VERSION
  name: string
  /** Every generated path must be declared up front and is scoped under extensions/{name}/. */
  outputs?: string[]
  transformSource?(context: Readonly<DocfuseExtensionSourceContext>): string | Promise<string>
  extendPage?(
    page: Readonly<DocfuseExtensionPage>
  ): DocfuseExtensionPagePatch | void | Promise<DocfuseExtensionPagePatch | void>
  generate?(context: DocfuseExtensionGenerateContext): void | Promise<void>
}

export type DocfuseExtensionOptions = { [key: string]: DocfuseJsonValue }

export type DocfuseExtensionFactory = (
  options: Readonly<DocfuseExtensionOptions>
) => DocfuseExtension | Promise<DocfuseExtension>

export function defineExtension(extension: DocfuseExtension): DocfuseExtension
export function defineExtension(factory: DocfuseExtensionFactory): DocfuseExtensionFactory
export function defineExtension(
  extension: DocfuseExtension | DocfuseExtensionFactory
): DocfuseExtension | DocfuseExtensionFactory {
  return extension
}
