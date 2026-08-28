import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

function resolveFromModule(specifier: string): string {
  if (typeof import.meta.resolve === 'function') {
    return fileURLToPath(import.meta.resolve(specifier))
  }
  return require.resolve(specifier)
}

function resolveFromProject(specifier: string): string {
  try {
    return require.resolve(specifier, { paths: [process.cwd()] })
  } catch (error) {
    throw new Error(
      `Cannot resolve ${specifier} from ${process.cwd()}. Install @docfuse/plugins to include math styles.`,
      { cause: error }
    )
  }
}

async function readInputCss(): Promise<string> {
  // styles.input.css sits next to this module in dist (copied by tsup) and in src during tests.
  return readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
}

/** Fonts referenced relative to @docfuse/plugins/math.css. */
export function mathFontsDir(): string {
  return join(dirname(resolveFromProject('@docfuse/plugins/math.css')), 'fonts')
}

/** File icons referenced relative to @docfuse/markdown/base.css. */
export function markdownFileIconsDir(): string {
  return join(dirname(resolveFromModule('@docfuse/markdown/base.css')), 'file-icons')
}

async function readPublishedCss(specifier: string, fromProject = false): Promise<string> {
  return readFile(fromProject ? resolveFromProject(specifier) : resolveFromModule(specifier), 'utf8')
}

/** Assemble explicit Markdown, theme, optional math, and site-shell layers. */
export async function compileCss({ math = false }: { math?: boolean } = {}): Promise<string> {
  const [shell, base, theme, mathCss] = await Promise.all([
    readInputCss(),
    readPublishedCss('@docfuse/markdown/base.css'),
    readPublishedCss('@docfuse/markdown/theme.css'),
    math ? readPublishedCss('@docfuse/plugins/math.css', true) : undefined
  ])
  return `/* Markdown base */\n${base}\n/* Default theme */\n${theme}\n${
    mathCss ? `/* Math */\n${mathCss}\n` : ''
  }/* Docfuse shell */\n${shell}\n`
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
