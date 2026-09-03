import type { CanofoldFrontmatter } from '../content/frontmatter'
import type { CanofoldJsonValue } from '../config/types'

export const CANOFOLD_EXTENSION_API_VERSION = 1 as const

export interface CanofoldExtensionSourceContext {
  source: string
  sourceRelativePath: string
  relativePath: string
  kind: 'markdown' | 'mdx'
  version: string
  locale: string
}

export interface CanofoldExtensionPage {
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
  frontmatter: CanofoldFrontmatter
}

export interface CanofoldExtensionPagePatch {
  title?: string
  description?: string
  searchText?: string
  search?: boolean
  ai?: boolean
}

export interface CanofoldExtensionGenerateContext {
  pages: readonly CanofoldExtensionPage[]
  emitFile(path: string, content: string | Uint8Array): Promise<void>
}

/**
 * Versioned, semantic site-build contract. Compiler ASTs and internal render
 * plugins intentionally stay private so upgrades do not depend on pipeline order.
 * Per-document syntax belongs to MarkdownPlugin; whole-site search indexing
 * belongs to SearchProvider.
 */
export interface CanofoldExtension {
  apiVersion: typeof CANOFOLD_EXTENSION_API_VERSION
  name: string
  /** Every generated path must be declared up front and is scoped under extensions/{name}/. */
  outputs?: string[]
  transformSource?(context: Readonly<CanofoldExtensionSourceContext>): string | Promise<string>
  extendPage?(
    page: Readonly<CanofoldExtensionPage>
  ): CanofoldExtensionPagePatch | void | Promise<CanofoldExtensionPagePatch | void>
  generate?(context: CanofoldExtensionGenerateContext): void | Promise<void>
}

export type CanofoldExtensionOptions = { [key: string]: CanofoldJsonValue }

export type CanofoldExtensionFactory = (
  options: Readonly<CanofoldExtensionOptions>
) => CanofoldExtension | Promise<CanofoldExtension>

export function defineExtension(extension: CanofoldExtension): CanofoldExtension
export function defineExtension(factory: CanofoldExtensionFactory): CanofoldExtensionFactory
export function defineExtension(
  extension: CanofoldExtension | CanofoldExtensionFactory
): CanofoldExtension | CanofoldExtensionFactory {
  return extension
}
