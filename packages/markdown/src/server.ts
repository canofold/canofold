/** Build/SSR-only entry point with compiler details hidden behind renderers. */
export { createMarkdownRenderer } from './server/createMarkdownRenderer'
export { defineMarkdownPlugin } from './compiler/plugins'
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
} from './compiler/prepareMarkdown'
export type {
  MarkdownRenderer,
  MarkdownRenderOptions,
  MdxRenderOptions,
  RenderedMarkdown
} from './server/createMarkdownRenderer'
