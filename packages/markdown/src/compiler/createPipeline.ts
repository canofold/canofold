import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified, type Pluggable, type Plugin, type Transformer } from 'unified'
import type { Root as HastRoot } from 'hast'
import type { MarkdownAssetCollector } from './assets'
import type { NormalizedMarkdownOptions } from './normalizeOptions'
import { createMarkdownPluginPlan } from './pluginPlan'
import type { MarkdownSyntaxFeatures } from './syntaxFeatures'
import type { Options as SanitizeOptions } from 'rehype-sanitize'
import { createCompilerSanitizeBoundary } from './sanitizeBoundary'

interface CreateMarkdownProcessorOptions {
  assets: MarkdownAssetCollector
  options: NormalizedMarkdownOptions
  rehypeRaw?: () => Transformer<HastRoot, HastRoot>
  rehypeSanitize?: Plugin<[SanitizeOptions?], HastRoot, HastRoot>
  sanitizeSchema?: SanitizeOptions
  syntax: MarkdownSyntaxFeatures
  syntaxHighlighter?: Pluggable
}

/** Assemble Markdown and MDX from the same ordered plugin plan. */
export function createMarkdownProcessor({
  assets,
  options,
  rehypeRaw,
  rehypeSanitize,
  sanitizeSchema,
  syntax,
  syntaxHighlighter
}: CreateMarkdownProcessorOptions) {
  const parseRawHtml = options.htmlPolicy !== 'strip'
  const plan = createMarkdownPluginPlan('markdown', assets, options, syntax, syntaxHighlighter)
  const processor = unified().use(remarkParse).use(plan.remarkPlugins).use(remarkRehype, {
    allowDangerousHtml: parseRawHtml,
    handlers: plan.handlers
  })

  if (options.htmlPolicy === 'sanitize' && rehypeRaw && rehypeSanitize && sanitizeSchema) {
    const boundary = createCompilerSanitizeBoundary(sanitizeSchema)
    processor
      .use(boundary.mark)
      .use(rehypeRaw)
      .use(boundary.protect)
      .use(rehypeSanitize, boundary.schema)
      .use(boundary.restore)
  } else if (parseRawHtml && rehypeRaw) {
    processor.use(rehypeRaw)
  }

  return processor.use(plan.rehypePlugins)
}
