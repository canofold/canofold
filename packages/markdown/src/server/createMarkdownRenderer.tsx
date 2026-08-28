import { evaluate } from '@mdx-js/mdx'
import { type ElementType, type ReactNode } from 'react'
import * as runtime from 'react/jsx-runtime'
import {
  createMarkdownMdxComponentMap,
  type MarkdownClassNames,
  type MarkdownComponents
} from '../react/componentMap'
import type { MarkdownAssets } from '../compiler/assets'
import { createMarkdownMdxPlugins } from '../compiler/mdxPlugins'
import { normalizeCallouts } from '../compiler/plugins/directives'
import { createMarkdownServerContext, type MarkdownServerContextOptions } from './cache'
import type { RenderMarkdownOptions } from '../compiler/types'
import { MarkdownDocument, MarkdownRoot } from '../react/Markdown'
import { type MarkdownSlots } from '../react/slots'
import type { MarkdownUrlTransform } from '../react/urlTransform'

export interface MarkdownRenderOptions {
  markdown?: RenderMarkdownOptions
  classNames?: MarkdownClassNames
  components?: MarkdownComponents
  slots?: MarkdownSlots
  className?: string
  as?: ElementType
  urlTransform?: MarkdownUrlTransform
}

export interface MdxRenderOptions extends Omit<MarkdownRenderOptions, 'components'> {
  /** Host and author components made available to trusted MDX. */
  components?: MarkdownComponents & Record<string, ElementType>
  /** Base URL used by the MDX runtime for generated module metadata. */
  baseUrl?: URL
}

export interface RenderedMarkdown {
  content: ReactNode
  assets: MarkdownAssets
}

export interface MarkdownRenderer {
  render(source: string, options?: MarkdownRenderOptions): Promise<RenderedMarkdown>
  renderMdx(source: string, options?: MdxRenderOptions): Promise<RenderedMarkdown>
  clear(): void
}

/**
 * Build/SSR renderer for Markdown and trusted MDX.
 *
 * The interface returns React content plus resource facts. HAST, Unified
 * processors, plugin ordering and compiler caches remain private so hosts do
 * not have to assemble the rendering pipeline themselves.
 */
export function createMarkdownRenderer(contextOptions: MarkdownServerContextOptions = {}): MarkdownRenderer {
  const warningState = new Set<string>()
  const context = createMarkdownServerContext({ ...contextOptions, warningState })

  return {
    async render(source, options = {}) {
      const prepared = await context.prepare(source, options.markdown)
      return {
        content: (
          <MarkdownDocument
            document={prepared.document}
            classNames={options.classNames}
            components={options.components}
            slots={options.slots}
            className={options.className}
            as={options.as}
            data-df-runtime="static"
            urlTransform={options.urlTransform}
          />
        ),
        assets: prepared.assets
      }
    },

    async renderMdx(source, options = {}) {
      if (options.markdown?.html && options.markdown.html !== 'trusted') {
        throw new Error('MDX executes trusted JSX and does not support sanitize or strip HTML policies')
      }
      const plugins = await createMarkdownMdxPlugins(options.markdown, source, {
        warnedLanguages: warningState
      })
      const evaluated = await evaluate(
        {
          value: normalizeCallouts(source),
          data: { docfuseLocale: options.markdown?.locale?.trim() || undefined }
        },
        {
          ...runtime,
          remarkPlugins: plugins.remarkPlugins,
          rehypePlugins: plugins.rehypePlugins,
          remarkRehypeOptions: plugins.remarkRehypeOptions,
          baseUrl: options.baseUrl ?? import.meta.url
        }
      )
      const Content = evaluated.default
      const componentMap = createMarkdownMdxComponentMap(
        options.classNames,
        options.slots,
        options.components,
        options.urlTransform
      )

      return {
        content: (
          <MarkdownRoot
            data-df-runtime="static"
            as={options.as}
            className={options.className}
            classNames={options.classNames}
            slots={options.slots}
            urlTransform={options.urlTransform}
          >
            <Content components={componentMap} />
          </MarkdownRoot>
        ),
        assets: plugins.getAssets()
      }
    },

    clear() {
      context.clear()
    }
  }
}
