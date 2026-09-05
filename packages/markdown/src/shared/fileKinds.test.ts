import { describe, expect, it } from 'vitest'
import { markdownFileIconName, markdownFileKind } from './fileKinds'

describe('markdownFileKind', () => {
  it('prefers exact filenames over generic extensions', () => {
    expect(markdownFileKind('package.json', 'json')).toBe('package')
    expect(markdownFileKind('pnpm-workspace.yaml', 'yaml')).toBe('package')
    expect(markdownFileKind('tsconfig.json', 'json')).toBe('config')
    expect(markdownFileKind('biome.json', 'json')).toBe('config')
    expect(markdownFileKind('.github/workflows/docs.yml', 'yaml')).toBe('data')
  })

  it('recognizes config names, source extensions, and language fallbacks', () => {
    expect(markdownFileKind('canofold.config.ts', 'ts')).toBe('config')
    expect(markdownFileKind('StatusBadge.tsx')).toBe('typescript')
    expect(markdownFileKind('schema.sql')).toBe('database')
    expect(markdownFileKind('Dockerfile', 'dockerfile')).toBe('container')
    expect(markdownFileKind('navigation.diff', 'diff')).toBe('diff')
    expect(markdownFileKind('docs.conf', 'nginx')).toBe('config')
    expect(markdownFileKind('.env.production', 'text')).toBe('environment')
    expect(markdownFileKind('App.vue', 'vue')).toBe('component')
    expect(markdownFileKind('build.rs', 'rust')).toBe('source')
    expect(markdownFileKind('README', 'markdown')).toBe('markdown')
  })

  it('uses distinct Material-style icons for common configuration files', () => {
    expect(markdownFileIconName('canofold.config.ts')).toBe('canofold')
    expect(markdownFileIconName('.gitignore')).toBe('git')
    expect(markdownFileIconName('.env.production')).toBe('environment')
    expect(markdownFileIconName('tsconfig.json')).toBe('typescript')
    expect(markdownFileIconName('docs.conf')).toBe('config')
    expect(markdownFileIconName('status-badge.scss')).toBe('sass')
    expect(markdownFileIconName('package.json')).toBe('nodejs')
    expect(markdownFileIconName('settings.json')).toBe('json')
    expect(markdownFileIconName('StatusBadge.tsx')).toBe('react')
    expect(markdownFileIconName('.github/workflows/docs.yml')).toBe('github-actions')
  })
})
