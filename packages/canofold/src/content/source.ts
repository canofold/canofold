import type { CanofoldJsonValue } from '../config/types'

/** A trusted, build-time adapter. It must read local inputs through the supplied context. */
export interface ContentSource {
  /** Stable identity within a version/locale, independent of titles and filenames. */
  id: string
  /** Derived source type; markdown and mdx are reserved for authored documents. */
  kind: string
  /** Adapter implementation revision; change when its interpretation changes. */
  revision: string
  /** Project-relative input boundary and entry file. */
  root: string
  entry: string
  version: string
  locale: string
  /** Locale-relative route prefix, without the version or site base. */
  base: string
  /** JSON-serializable, deterministic adapter options. */
  cacheKey: CanofoldJsonValue
  load(context: ContentSourceContext): Promise<readonly SourceDocument[]>
}

export interface ContentSourceContext {
  cwd: string
  root: string
  entry: string
  /** Version- and locale-scoped route prefix; the site base is applied by the host. */
  routeBase: string
  /** Bounded, tracked UTF-8 reads. Absolute paths must remain inside root. */
  read(path: string): Promise<string>
  /** Stop this source with an authored diagnostic; ordinary adapter exceptions remain fatal. */
  fail(diagnostic: {
    message: string
    /** Absolute path or path relative to root; must name an input read through this context. */
    file?: string
    pointer?: string
    line?: number
    column?: number
  }): never
}

export interface SourceDocument {
  /** Stable local identity, not a physical filename or a display title. */
  key: string
  /** Relative route within the source's base; empty denotes its overview. */
  path: string
  /** RFC 6901 pointer into the entry document. */
  pointer: string
  title: string
  description: string
  /** Safe Markdown representation. Authored strings must be escaped as data. */
  body: string
  tags?: string[]
  /** One display group; membership does not create another document or URL. */
  group?: string
  order?: number
  /** Machine-readable facts; never inferred from the generated prose. */
  facts?: Record<string, CanofoldJsonValue>
}

export interface DerivedContentOrigin {
  id: string
  kind: string
  key: string
  pointer: string
  adapterRevision: string
  optionsRevision: string
  dependencies: Array<{ path: string; revision: string }>
  dependenciesRevision: string
  facts: Record<string, CanofoldJsonValue>
}
