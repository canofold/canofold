import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ThemeDefinition } from '@canofold/themes'

const require = createRequire(import.meta.url)

function resolveFromModule(specifier: string): string {
  return require.resolve(specifier)
}

function resolveFromProject(specifier: string, cwd: string): string {
  try {
    return require.resolve(specifier, { paths: [cwd] })
  } catch (error) {
    throw new Error(
      `Cannot resolve ${specifier} from ${cwd}. Install @canofold/plugins to include math styles.`,
      { cause: error }
    )
  }
}

export function resolveThemeStylePath(cwd: string, specifier: string): string {
  if (specifier.startsWith('file:')) return fileURLToPath(specifier)
  if (isAbsolute(specifier)) return specifier
  if (specifier.startsWith('./') || specifier.startsWith('../')) return resolve(cwd, specifier)
  try {
    return require.resolve(specifier, { paths: [cwd] })
  } catch {
    return resolveFromModule(specifier)
  }
}

async function readInputCss(): Promise<string> {
  // styles.input.css sits next to this module in dist (copied by tsup) and in src during tests.
  return readFile(new URL('./styles.input.css', import.meta.url), 'utf8')
}

/** Fonts referenced relative to @canofold/plugins/math.css. */
export function mathFontsDir(cwd = process.cwd()): string {
  return join(dirname(resolveFromProject('@canofold/plugins/math.css', cwd)), 'fonts')
}

/** File icons referenced relative to @canofold/markdown/base.css. */
export function markdownFileIconsDir(): string {
  return join(dirname(resolveFromModule('@canofold/markdown/base.css')), 'file-icons')
}

async function readPublishedCss(specifier: string, cwd?: string): Promise<string> {
  return readFile(cwd ? resolveFromProject(specifier, cwd) : resolveFromModule(specifier), 'utf8')
}

/** Assemble theme-independent Markdown structure, optional math, and the site shell. */
export async function compileCss({
  math = false,
  cwd = process.cwd()
}: { math?: boolean; cwd?: string } = {}): Promise<string> {
  const [shell, base, mathCss] = await Promise.all([
    readInputCss(),
    readPublishedCss('@canofold/markdown/base.css'),
    math ? readPublishedCss('@canofold/plugins/math.css', cwd) : undefined
  ])
  return `/* Markdown base */\n${base}\n${mathCss ? `/* Math */\n${mathCss}\n` : ''}/* Canofold shell */\n${shell}\n`
}

/** Include only the CSS owned by configured first- or third-party theme definitions. */
export async function compileThemes(
  themes: readonly ThemeDefinition[],
  cwd = process.cwd()
): Promise<string> {
  const stylePaths = [
    ...new Set(themes.flatMap((theme) => theme.styles).map((style) => resolveThemeStylePath(cwd, style)))
  ]
  return (await Promise.all(stylePaths.map((path) => readFile(path, 'utf8')))).join('\n')
}
