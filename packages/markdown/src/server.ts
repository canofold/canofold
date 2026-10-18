/** Build/SSR-only entry point with compiler details hidden behind renderers. */
export { createMarkdownRenderer } from './server/createMarkdownRenderer.js'
export { defineMarkdownPlugin } from './compiler/plugins.js'
export type { MarkdownContentAnalysis, MarkdownReferences } from './compiler/analyze.js'
export type {
  MarkdownAssets,
  MarkdownLabels,
  MarkdownPlugin,
  MarkdownPluginBrowserCompiler,
  MarkdownPluginCacheValue,
  MarkdownPluginClientAsset,
  MarkdownPluginClientResource,
  MarkdownPluginClientResourceDirectory,
  MarkdownPluginStyleAsset,
  MarkdownUnknownLanguagePolicy,
  RenderMarkdownOptions
} from './compiler/prepareMarkdown.js'
export type {
  MarkdownRenderer,
  MarkdownRenderOptions,
  MdxRenderOptions,
  RenderedMarkdown
} from './server/createMarkdownRenderer.js'
