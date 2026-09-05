export type MarkdownFileKind =
  | 'package'
  | 'config'
  | 'typescript'
  | 'javascript'
  | 'markdown'
  | 'style'
  | 'data'
  | 'database'
  | 'shell'
  | 'container'
  | 'diff'
  | 'component'
  | 'source'
  | 'environment'
  | 'file'

export type MarkdownFileIconName =
  | 'astro'
  | 'bun'
  | 'console'
  | 'css'
  | 'database'
  | 'deno'
  | 'diff'
  | 'docker'
  | 'canofold'
  | 'document'
  | 'environment'
  | 'git'
  | 'github-actions'
  | 'go'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'nodejs'
  | 'npm'
  | 'pnpm'
  | 'python'
  | 'react'
  | 'rust'
  | 'sass'
  | 'config'
  | 'settings'
  | 'svelte'
  | 'typescript'
  | 'vue'
  | 'yaml'
  | 'yarn'

const exactFileKinds: Record<string, MarkdownFileKind> = {
  'package.json': 'package',
  'package-lock.json': 'package',
  'pnpm-lock.yaml': 'package',
  'yarn.lock': 'package',
  'bun.lock': 'package',
  'bun.lockb': 'package',
  'deno.json': 'package',
  'deno.jsonc': 'package',
  'pnpm-workspace.yaml': 'package',
  '.gitignore': 'config',
  '.editorconfig': 'config',
  '.npmrc': 'config',
  '.nvmrc': 'config',
  '.prettierrc': 'config',
  'biome.json': 'config',
  dockerfile: 'container',
  containerfile: 'container',
  'tsconfig.json': 'config',
  'jsconfig.json': 'config',
  'turbo.json': 'config',
  'vite.config.ts': 'config',
  'vite.config.js': 'config'
}

const extensionKinds: Record<string, MarkdownFileKind> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  md: 'markdown',
  mdx: 'markdown',
  css: 'style',
  conf: 'config',
  scss: 'style',
  sass: 'style',
  less: 'style',
  json: 'data',
  jsonc: 'data',
  yaml: 'data',
  yml: 'data',
  toml: 'data',
  sql: 'database',
  diff: 'diff',
  patch: 'diff',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  vue: 'component',
  svelte: 'component',
  astro: 'component',
  py: 'source',
  go: 'source',
  rs: 'source'
}

const languageKinds: Record<string, MarkdownFileKind> = {
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  markdown: 'markdown',
  md: 'markdown',
  mdx: 'markdown',
  css: 'style',
  scss: 'style',
  sass: 'style',
  less: 'style',
  json: 'data',
  jsonc: 'data',
  yaml: 'data',
  yml: 'data',
  toml: 'data',
  sql: 'database',
  diff: 'diff',
  docker: 'container',
  dockerfile: 'container',
  nginx: 'config',
  shell: 'shell',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  terminal: 'shell',
  vue: 'component',
  svelte: 'component',
  astro: 'component',
  python: 'source',
  py: 'source',
  go: 'source',
  rust: 'source',
  rs: 'source'
}

/** Filename associations take precedence over extension and language fallbacks. */
export function markdownFileKind(filename: string, language = ''): MarkdownFileKind {
  const basename = filename.split(/[\\/]/).pop()?.toLowerCase() || ''
  const exact = exactFileKinds[basename]
  if (exact) return exact
  if (/^\.env(?:\..+)?$/.test(basename)) return 'environment'
  if (/(^|\.)config\.[^.]+$/.test(basename) || /^\.[a-z0-9-]+rc(?:\.[^.]+)?$/.test(basename)) {
    return 'config'
  }
  const extension = basename.includes('.') ? basename.split('.').pop() || '' : ''
  return extensionKinds[extension] || languageKinds[language.toLowerCase()] || 'file'
}

const languageIconNames: Record<string, MarkdownFileIconName> = {
  astro: 'astro',
  bash: 'console',
  css: 'css',
  diff: 'diff',
  docker: 'docker',
  dockerfile: 'docker',
  go: 'go',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  jsonc: 'json',
  markdown: 'markdown',
  md: 'markdown',
  mdx: 'markdown',
  python: 'python',
  py: 'python',
  rust: 'rust',
  rs: 'rust',
  sass: 'sass',
  scss: 'sass',
  shell: 'console',
  sh: 'console',
  sql: 'database',
  svelte: 'svelte',
  terminal: 'console',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'vue',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'console'
}

/** Material Icon Theme-style filename associations, with filenames taking priority. */
export function markdownFileIconName(filename: string, language = ''): MarkdownFileIconName {
  const normalized = filename.replace(/\\/g, '/').toLowerCase()
  const basename = normalized.split('/').pop() || ''
  if (/^canofold\.config\.(?:[cm]?[jt]s)$/.test(basename)) return 'canofold'
  if (/^(?:.*\/)?\.github\/workflows\/[^/]+\.ya?ml$/.test(normalized)) return 'github-actions'
  if (['npm', 'pnpm', 'yarn', 'bun', 'deno'].includes(basename)) {
    return basename as Extract<MarkdownFileIconName, 'npm' | 'pnpm' | 'yarn' | 'bun' | 'deno'>
  }
  if (basename === 'package.json') return 'nodejs'
  if (basename.startsWith('pnpm-') || basename === 'pnpm-lock.yaml') return 'pnpm'
  if (basename === 'package-lock.json' || basename === '.npmrc') return 'npm'
  if (basename === 'yarn.lock') return 'yarn'
  if (basename === 'bun.lock' || basename === 'bun.lockb') return 'bun'
  if (basename === 'deno.json' || basename === 'deno.jsonc') return 'deno'
  if (basename === 'dockerfile' || basename === 'containerfile') return 'docker'
  if (basename === '.gitignore' || basename === '.gitattributes' || basename === '.gitmodules') {
    return 'git'
  }
  if (/^\.env(?:\.|$)/.test(basename)) return 'environment'
  if (basename === 'tsconfig.json' || basename === 'jsconfig.json') return 'typescript'
  if (/\.(?:jsx|tsx)$/.test(basename)) return 'react'

  const kind = markdownFileKind(basename, language)
  if (kind === 'config') return 'config'
  if (kind === 'database') return 'database'
  if (kind === 'diff') return 'diff'
  if (kind === 'shell') return 'console'
  if (kind === 'container') return 'docker'

  const extension = basename.includes('.') ? basename.split('.').pop() || '' : ''
  return languageIconNames[extension] || languageIconNames[language.toLowerCase()] || 'document'
}
