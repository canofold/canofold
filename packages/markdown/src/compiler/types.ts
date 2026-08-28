import type { MarkdownAssets } from './assets'
import type { Root } from 'hast'
import type { LanguageInput } from '@shikijs/types'
import type { PluggableList } from 'unified'

export type MarkdownHtmlPolicy = 'trusted' | 'sanitize' | 'strip'
export type MarkdownUnknownLanguagePolicy = 'warn' | 'error' | 'plain-text'
export type MarkdownPluginCacheValue =
  string | number | boolean | null | MarkdownPluginCacheValue[] | { [key: string]: MarkdownPluginCacheValue }

export interface MarkdownPluginBrowserCompiler {
  /** Browser-safe package export that contains the plugin factory. */
  module: string
  /** Named factory export, for example `mermaid` or `plantUml`. */
  exportName: string
  /** JSON-serializable factory options used by browser-side Markdown compilers. */
  options?: MarkdownPluginCacheValue
}

export interface MarkdownCodeOptions {
  themes?: {
    light?: string
    dark?: string
  }
  fallbackLanguage?: string
  /**
   * Additional fence-language loaders keyed by the label authors use after
   * the opening fence. Built-in technical-document languages remain enabled.
   */
  languages?: Readonly<Record<string, LanguageInput>>
  /** Behavior when neither a built-in nor custom language matches a fence. */
  unknownLanguage?: MarkdownUnknownLanguagePolicy
}

export interface MarkdownFeatureOptions {
  callouts?: boolean
  tabs?: boolean
  codeGroups?: boolean
  steps?: boolean
  terminals?: boolean
  documentBlocks?: boolean
  /** Enhance GFM tables independently from other rich document blocks. */
  tables?: boolean
  codeBlocks?: boolean
}

export interface MarkdownLabels {
  copyCode: string
  copyFailed: string
  copySnippet: string
  copyTerminal: string
  terminalTitle: string
  tabsTitle: string
  tabItem: string
  codeGroupTitle: string
  codeGroupItem: string
  taskCompleted: string
  taskIncomplete: string
  copySectionLink: string
  tableTitle: string
  copyTableCsv: string
  downloadTableCsv: string
  zoomTable: string
  closeTablePreview: string
  sortTableColumn: string
  zoomImage: string
  closeImagePreview: string
  imageGallery: string
  closeImageGallery: string
  previousGalleryImage: string
  nextGalleryImage: string
  galleryThumbnails: string
  galleryImage: string
}

/**
 * A build-time trusted compiler plugin. Plugins extend the shared Markdown and
 * MDX pipeline with additional remark (mdast) and rehype (hast) transforms.
 *
 * Plugin functions cannot participate in cache fingerprints, so `name`,
 * `version` and `cacheKey` carry the cache identity instead: bump `version`
 * whenever the transform behavior changes and derive `cacheKey` from the
 * plugin's resolved options.
 */
export interface MarkdownPlugin {
  /** Unique lowercase kebab-case slug, e.g. "external-links". */
  name: string
  /** Implementation revision; part of the cache identity. */
  version?: string
  /** JSON-serializable configuration identity, typically resolved options. */
  cacheKey?: MarkdownPluginCacheValue
  /**
   * Optional browser compiler entry. Static sites use this only for explicit
   * authoring surfaces such as the Playground; ordinary pages do not load it.
   */
  browserCompiler?: MarkdownPluginBrowserCompiler
  /** Applied before the core rich-block conversion, before remark-rehype. */
  remarkPlugins?: PluggableList
  /** Appended after the built-in rehype plugins, at the end of the pipeline. */
  rehypePlugins?: PluggableList
  /**
   * Fenced-code language labels consumed by this plugin's remark transforms.
   * Declaring them prevents the core Shiki loader from treating plugin-owned
   * fences as ordinary code or reporting them as unsupported languages.
   */
  fenceLanguages?: readonly string[]
  /**
   * Directive names owned by this plugin. Undeclared directive names are
   * rejected so author typos cannot silently degrade to generic HTML.
   */
  directiveNames?: readonly string[]
  /**
   * Optional source-level activation gate. Use this for expensive opt-in
   * syntax so ordinary documents do not load or run the plugin.
   */
  appliesTo?: (context: MarkdownPluginContext) => boolean
  /** Static assets required whenever this plugin is active for a document. */
  assets?: {
    math?: boolean
    /** Browser entry points loaded only for pages that activate this plugin. */
    clients?: readonly MarkdownPluginClientAsset[]
    /** Published CSS entry points appended only for pages that activate this plugin. */
    styles?: readonly MarkdownPluginStyleAsset[]
  }
}

export interface MarkdownPluginClientAsset {
  /** Stable identifier used for output naming and de-duplication. */
  id: string
  /** Public package export, for example `@scope/plugin/client`. */
  module: string
  /** Extra package files copied beside this client under a directory named after `id`. */
  resources?: readonly MarkdownPluginClientResource[]
}

export interface MarkdownPluginClientResourceDirectory {
  /** Directory relative to the resource entry point. Parent traversal is rejected. */
  source: string
  /** Output directory relative to this client's resource directory. */
  output: string
  /** Optional file suffix allowlist, for example `[".mjs"]`. */
  extensions?: readonly string[]
}

export interface MarkdownPluginClientResource {
  /** Package export resolved from the client asset's owning package. */
  module: string
  /** Output file relative to this client's resource directory. */
  output: string
  /** Chunk directories located beside the resolved resource entry. */
  directories?: readonly MarkdownPluginClientResourceDirectory[]
}

export interface MarkdownPluginStyleAsset {
  /** Stable identifier used for output naming and de-duplication. */
  id: string
  /** Public package export, for example `@docfuse/plugins/diagram.css`. */
  module: string
}

export interface MarkdownPluginContext {
  source: string
  mode: 'markdown' | 'mdx'
}

export interface RenderMarkdownOptions {
  /**
   * Raw HTML policy for markdown input.
   *
   * `trusted` preserves inline HTML and is intended for build-time docs content.
   * `sanitize` parses HTML and removes unsafe elements, attributes and URLs.
   * `strip` disables raw HTML parsing entirely.
   * MDX remains executable trusted code and does not support safe HTML modes.
   */
  html?: MarkdownHtmlPolicy
  code?: MarkdownCodeOptions
  features?: MarkdownFeatureOptions
  labels?: Partial<MarkdownLabels>
  /** BCP 47 locale exposed to compiler plugins for locale-aware output. */
  locale?: string
  /** Compiler plugins applied to both the Markdown and MDX pipelines. */
  plugins?: readonly MarkdownPlugin[]
}

/** Serializable HAST output before HTML stringification. */
export interface PreparedMarkdown {
  document: Root
  assets: MarkdownAssets
}
