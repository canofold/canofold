import { run } from '@mdx-js/mdx'
import { type ElementType, type ReactNode } from 'react'
import * as runtime from 'react/jsx-runtime'
import {
  createMarkdownMdxComponentMap,
  type MarkdownClassNames,
  type MarkdownComponents
} from '../react/componentMap.js'
import type { MarkdownAssets } from '../compiler/assets.js'
import type { MarkdownContentAnalysis } from '../compiler/analyze.js'
import { createMarkdownServerContext, type MarkdownServerContextOptions } from './cache.js'
import type { RenderMarkdownOptions } from '../compiler/types.js'
import { MarkdownDocument, MarkdownRoot } from '../react/Markdown.js'
import { type MarkdownSlots } from '../react/slots.js'
import { transformMarkdownUrlProps, type MarkdownUrlTransform } from '../react/urlTransform.js'

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
  /** Static content after compiler plugins; never executes author MDX components. */
  analyze(
    source: string,
    options?: { markdown?: RenderMarkdownOptions; mode?: 'markdown' | 'mdx' }
  ): Promise<MarkdownContentAnalysis>
  render(source: string, options?: MarkdownRenderOptions): Promise<RenderedMarkdown>
  renderMdx(source: string, options?: MdxRenderOptions): Promise<RenderedMarkdown>
  clear(): void
}

/** Explicit native JSX bypasses the MDX component map. Transform its final props here. */
function withUrlTransform(factory: typeof runtime.jsx, transform?: MarkdownUrlTransform): typeof runtime.jsx {
  return (type, props, key) =>
    factory(
      type,
      typeof type === 'string' && props && typeof props === 'object'
        ? transformMarkdownUrlProps(props as Record<string, unknown>, transform)
        : props,
      key
    )
}

/**
 * Build/SSR renderer for Markdown and trusted MDX.
 *
 * The interface returns React content plus resource facts. HAST, Unified
 * processors, plugin ordering and compiler caches remain private so hosts do
 * not have to assemble the rendering pipeline themselves.
 */
export function createMarkdownRenderer(contextOptions: MarkdownServerContextOptions = {}): MarkdownRenderer {
  const context = createMarkdownServerContext(contextOptions)

  return {
    async analyze(source, { markdown, mode = 'markdown' } = {}) {
      const prepared =
        mode === 'mdx' ? await context.prepareMdx(source, markdown) : await context.prepare(source, markdown)
      return structuredClone(prepared.analysis)
    },
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
            data-cf-runtime="static"
            urlTransform={options.urlTransform}
          />
        ),
        assets: prepared.assets
      }
    },

    async renderMdx(source, options = {}) {
      const prepared = await context.prepareMdx(source, options.markdown)
      const evaluated = await run(prepared.code, {
        ...runtime,
        jsx: withUrlTransform(runtime.jsx, options.urlTransform),
        jsxs: withUrlTransform(runtime.jsxs, options.urlTransform),
        baseUrl: options.baseUrl ?? import.meta.url
      })
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
            data-cf-runtime="static"
            as={options.as}
            className={options.className}
            classNames={options.classNames}
            slots={options.slots}
            urlTransform={options.urlTransform}
          >
            <Content components={componentMap} />
          </MarkdownRoot>
        ),
        assets: prepared.assets
      }
    },

    clear() {
      context.clear()
    }
  }
}
