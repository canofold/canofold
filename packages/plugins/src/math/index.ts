import { defineMarkdownPlugin, type MarkdownPlugin } from '@canofold/markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { hasMarkdownFenceLanguage, markdownProse } from '../shared/markdownSource'

const PLUGIN_VERSION = '4'

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

function hasDisplayMath(prose: string) {
  let index = 0
  while (index < prose.length) {
    const start = prose.indexOf('$$', index)
    if (start === -1) return false
    if (start > 0 && prose[start - 1] === '\\') {
      index = start + 2
      continue
    }
    return prose.indexOf('$$', start + 2) !== -1
  }
  return false
}

function hasInlineMath(prose: string) {
  for (let index = 0; index < prose.length; index += 1) {
    if (prose[index] !== '$' || prose[index + 1] === '$') continue
    const previous = index === 0 ? '' : prose[index - 1]
    const next = prose[index + 1]
    if (previous === '\\' || previous === '$' || !next || next === ' ' || next === '\n') continue
    let cursor = index + 1
    while (cursor < prose.length && prose[cursor] !== '\n') {
      if (prose[cursor] === '\\') {
        cursor += 2
        continue
      }
      if (prose[cursor] === '$') return prose[cursor - 1] !== ' '
      cursor += 1
    }
  }
  return false
}

/** Conservative opt-in detector; escaped dollar signs and code do not activate KaTeX. */
export function hasMathSyntax(source: string) {
  const prose = markdownProse(source)
  return hasMarkdownFenceLanguage(source, new Set(['math'])) || hasDisplayMath(prose) || hasInlineMath(prose)
}

function rehypeMath(options: MathOptions) {
  return (
    tree: Parameters<ReturnType<typeof rehypeKatex>>[0],
    file: Parameters<ReturnType<typeof rehypeKatex>>[1]
  ) => {
    const firstMessage = file.messages.length
    // KaTeX mutates macros for \gdef. Share within this document, never across
    // documents or with the immutable plugin/cache configuration.
    rehypeKatex({ ...options, macros: { ...options.macros } })(tree, file)
    if (options.throwOnError) {
      const error = file.messages.slice(firstMessage).find((message) => message.source === 'rehype-katex')
      if (error) file.fail(error)
    }
  }
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
    browserCompiler: { module: '@canofold/plugins/math', exportName: 'math', options: resolved },
    appliesTo: ({ source }) => hasMathSyntax(source),
    fenceLanguages: ['math'],
    assets: { math: true },
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeMath, resolved]]
  })
}
