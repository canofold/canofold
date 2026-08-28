import { defineMarkdownPlugin, type MarkdownPlugin } from '@docfuse/markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { hasMarkdownFenceLanguage, markdownProse } from '../shared/markdownSource'

const PLUGIN_VERSION = '3'

export interface MathOptions {
  /** KaTeX should throw instead of rendering unsupported input. */
  throwOnError?: boolean
  /** Color used by KaTeX when `throwOnError` is false. */
  errorColor?: string
  /** Trust KaTeX commands that can emit URLs or HTML. Disabled by default. */
  trust?: boolean
  /** KaTeX strictness policy. */
  strict?: boolean | 'ignore' | 'warn' | 'error'
  /** Macros passed to KaTeX. */
  macros?: Readonly<Record<string, string>>
}

/** Conservative opt-in detector; escaped dollar signs and code do not activate KaTeX. */
export function hasMathSyntax(source: string) {
  const prose = markdownProse(source)
  return (
    hasMarkdownFenceLanguage(source, new Set(['math'])) ||
    /(^|[^\\])\$\$[\s\S]+?\$\$/.test(prose) ||
    /(^|[^\\$])\$(?!\s)(?:\\.|[^$\n])+?(?<!\s)\$/.test(prose)
  )
}

export function math(options: MathOptions = {}): MarkdownPlugin {
  const resolved = {
    throwOnError: options.throwOnError ?? false,
    errorColor: options.errorColor ?? '#b42318',
    trust: options.trust ?? false,
    strict: options.strict ?? 'warn',
    macros: { ...(options.macros ?? {}) }
  }

  return defineMarkdownPlugin({
    name: 'math',
    version: PLUGIN_VERSION,
    cacheKey: resolved,
    browserCompiler: { module: '@docfuse/plugins/math', exportName: 'math', options: resolved },
    appliesTo: ({ source }) => hasMathSyntax(source),
    fenceLanguages: ['math'],
    assets: { math: true },
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, resolved]]
  })
}
