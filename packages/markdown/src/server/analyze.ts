/** Build-tool analysis entry point, isolated from the SSR renderer graph. */
export { detectMarkdownAssets } from '../compiler/assets'
export { analyzeMarkdown } from '../compiler/analyze'
export { analyzeMdxModuleBoundary } from '../compiler/mdxModules'
export type {
  AnalyzeMarkdownOptions,
  MarkdownAnalysis,
  MarkdownCodeExample,
  MarkdownHeading
} from '../compiler/analyze'
export type { MdxImportBinding, MdxImportDeclaration, MdxModuleBoundary } from '../compiler/mdxModules'
