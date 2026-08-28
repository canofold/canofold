/**
 * Official plugins and providers for Docfuse and @docfuse/markdown.
 *
 * Markdown plugin factories are passed to `markdown.plugins`; search provider
 * factories are passed to `search.provider`.
 */
export { kroki } from './kroki/index'
export type { KrokiOptions } from './kroki/index'
export { externalLinks } from './external-links/index'
export type { ExternalLinksOptions } from './external-links/index'
export { linkCard } from './link-card/index'
export type { LinkCardOptions } from './link-card/index'
export { math } from './math/index'
export type { MathOptions } from './math/index'
export { mermaid } from './mermaid/index'
export type { MermaidOptions } from './mermaid/index'
export { pagefind } from './pagefind/index'
export type { PagefindOptions } from './pagefind/index'
export { plantUml } from './plantuml/index'
export type { PlantUmlOptions } from './plantuml/index'
export { readingTime } from './reading-time/index'
export type { ReadingTimeCounts, ReadingTimeOptions } from './reading-time/index'
export type { MarkdownPlugin } from '@docfuse/markdown'
