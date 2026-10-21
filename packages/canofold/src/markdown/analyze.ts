import type { MarkdownRenderer } from '@canofold/markdown/server'
import type { CanofoldConfig } from '../config/types'
import { markdownLabelsFor } from '../config/locale'
import { demoDirectivePlugin } from '../demos/references'
import { prepareMdxSource } from './importBoundary'

/** Keep content analysis and render preparation on the same compiler cache key. */
export function analyzeDocument(
  renderer: MarkdownRenderer,
  config: CanofoldConfig,
  body: string,
  mode: 'markdown' | 'mdx',
  locale: string,
  hasDemos: boolean
) {
  return renderer.analyze(mode === 'mdx' ? prepareMdxSource(body).source : body, {
    mode,
    markdown: {
      ...config.markdown,
      ...(mode === 'mdx' ? { html: 'trusted' as const } : {}),
      plugins: hasDemos ? [...config.markdown.plugins, demoDirectivePlugin] : config.markdown.plugins,
      locale,
      labels: { ...markdownLabelsFor(locale, config.i18n.messages), ...config.markdown.labels }
    }
  })
}
