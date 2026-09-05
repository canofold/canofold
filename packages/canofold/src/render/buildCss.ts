import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function resolveFromModule(specifier: string): string {
  return require.resolve(specifier)
}

function resolveFromProject(specifier: string): string {
  try {
    return require.resolve(specifier, { paths: [process.cwd()] })
  } catch (error) {
    throw new Error(
      `Cannot resolve ${specifier} from ${process.cwd()}. Install @canofold/plugins to include math styles.`,
      { cause: error }
    )
  }
}

async function readInputCss(): Promise<string> {
  // styles.input.css sits next to this module in dist (copied by tsup) and in src during tests.
  return readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
}

/** Fonts referenced relative to @canofold/plugins/math.css. */
export function mathFontsDir(): string {
  return join(dirname(resolveFromProject('@canofold/plugins/math.css')), 'fonts')
}

/** File icons referenced relative to @canofold/markdown/base.css. */
export function markdownFileIconsDir(): string {
  return join(dirname(resolveFromModule('@canofold/markdown/base.css')), 'file-icons')
}

async function readPublishedCss(specifier: string, fromProject = false): Promise<string> {
  return readFile(fromProject ? resolveFromProject(specifier) : resolveFromModule(specifier), 'utf8')
}

/** Assemble explicit Markdown, theme, optional math, and site-shell layers. */
export async function compileCss({ math = false }: { math?: boolean } = {}): Promise<string> {
  const [shell, base, theme, mathCss] = await Promise.all([
    readInputCss(),
    readPublishedCss('@canofold/markdown/base.css'),
    readPublishedCss('@canofold/markdown/theme.css'),
    math ? readPublishedCss('@canofold/plugins/math.css', true) : undefined
  ])
  return `/* Markdown base */\n${base}\n/* Default theme */\n${theme}\n${
    mathCss ? `/* Math */\n${mathCss}\n` : ''
  }/* Canofold shell */\n${shell}\n`
}

const cached = new Map<boolean, Promise<string>>()

export function buildCssCached(options: { math?: boolean } = {}): Promise<string> {
  const math = options.math === true
  let result = cached.get(math)
  if (!result) {
    result = compileCss({ math })
    cached.set(math, result)
  }
  return result
}
