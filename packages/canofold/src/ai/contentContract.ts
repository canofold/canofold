import { fingerprint, fingerprintBytes } from '../build/fingerprint'
import type { CanofoldConfig } from '../config/types'
import { publicFrontmatterFor } from '../content/frontmatter'
import { isMdxPath } from '../content/fileKinds'
import { localeRelativePathFor } from '../content/routes'
import type { ContentGraph, DocPage } from '../content/types'
import { planBuiltInOutputs } from '../output/plan'
import { publicPathFor } from '../seo/urls'

/** Versioned public data format, independent of the build-cache schema. */
export const AI_SCHEMA_VERSION = 2

function documentRecord(config: CanofoldConfig, page: DocPage, declaredInputsRevision: string) {
  const path = localeRelativePathFor(page.relativePath, page.locale).normalize('NFC')
  const id = fingerprint([config.ai.contentSpace ?? null, page.version, page.locale, path])
  const source = {
    path,
    kind: isMdxPath(path) ? 'mdx' : 'markdown',
    revision: page.sourceRevision,
    transformedRevision: fingerprintBytes(page.transformedSource)
  }
  const representation = {
    body: 'extension-transformed-source-body',
    facts: 'compiled-static-with-author-and-extension-overrides',
    analysis: isMdxPath(path) ? 'mdx-static-only' : 'markdown-static',
    fingerprint: fingerprintBytes(page.body),
    // Declared inputs are not a claim to hash arbitrary trusted plugin code or environment state.
    declaredInputsRevision
  }
  const facts = {
    title: page.title,
    description: page.description,
    version: page.version,
    locale: page.locale,
    status: page.status,
    tags: Array.isArray(page.frontmatter.tags)
      ? page.frontmatter.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    ...(typeof page.frontmatter.owner === 'string' ? { owner: page.frontmatter.owner } : {}),
    headings: page.headings,
    ...(page.lastUpdated ? { lastUpdated: page.lastUpdated } : {}),
    frontmatter: publicFrontmatterFor(page.frontmatter)
  }
  return {
    id,
    revision: fingerprint({ source, representation, facts }),
    source,
    representation,
    ...facts,
    routePath: publicPathFor(config, page.routePath),
    ...(config.markdownMirror ? { markdownPath: publicPathFor(config, `${page.routePath}index.md`) } : {})
  }
}

export function createContentCollection(config: CanofoldConfig, graph: ContentGraph) {
  const scope = {
    space: config.ai.contentSpace ?? null,
    versions: graph.versions
      .filter((version) => config.ai.versions === 'all' || version.id === graph.currentVersion)
      .map((version) => version.id)
      .sort(),
    locales: [...graph.locales].sort()
  }
  const outputs = Object.fromEntries(
    planBuiltInOutputs(config, graph).map(({ id, enabled }) => [id, enabled])
  )
  const selected = graph.pages.filter(
    (page) => page.status === 'published' && page.ai && scope.versions.includes(page.version)
  )
  const declaredInputsRevision = fingerprint({
    plugins: config.markdown.plugins.map((plugin) => ({
      name: plugin.name,
      version: plugin.version ?? null,
      cacheKey: plugin.cacheKey ?? null
    })),
    extensions: config.extensions
  })
  const pages = selected.map((page) => documentRecord(config, page, declaredInputsRevision))
  if (new Set(pages.map((page) => page.id)).size !== pages.length) {
    throw new Error('Duplicate document identity in AI collection')
  }
  const snapshotRevision = fingerprint({
    schemaVersion: AI_SCHEMA_VERSION,
    scope,
    outputs,
    pages: [...pages].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  })
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    scope,
    outputs,
    basePath: config.basePath,
    snapshotRevision,
    pages
  }
}
