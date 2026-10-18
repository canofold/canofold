/** Build-tool analysis entry point, isolated from the SSR renderer graph. */
export { detectMarkdownAssets } from '../compiler/assets.js'
export { analyzeMarkdown } from '../compiler/analyze.js'
export { analyzeMdxModuleBoundary } from '../compiler/mdxModules.js'
export type {
  AnalyzeMarkdownOptions,
  MarkdownAnalysis,
  MarkdownCodeExample,
  MarkdownDirective,
  MarkdownHeading
} from '../compiler/analyze.js'
export type { MdxImportBinding, MdxImportDeclaration, MdxModuleBoundary } from '../compiler/mdxModules.js'
