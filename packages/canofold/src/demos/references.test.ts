import { describe, expect, it } from 'vitest'
import { analyzeMarkdown } from '@canofold/markdown/server/analyze'
import type { DocPage } from '../content/types'
import { demoDirectivePlugin, demoReferencesForPage } from './references'

const page = {
  version: 'current',
  sourcePath: '/project/docs/button.md',
  sourceRelativePath: 'docs/button.md',
  routePath: '/button/',
  locale: 'zh'
} as DocPage

function references(source: string) {
  const analysis = analyzeMarkdown(source, { plugins: [demoDirectivePlugin] })
  return demoReferencesForPage(page, analysis.directives)
}

describe('demoReferencesForPage', () => {
  it('collects an optional label and project module source', () => {
    expect(
      references(
        '::demo[基础用法]{src="/src/components/button/demo/basic.tsx" description="展示四种按钮类型。"}'
      )
    ).toEqual([
      expect.objectContaining({
        title: '基础用法',
        description: '展示四种按钮类型。',
        specifier: '/src/components/button/demo/basic.tsx',
        sandbox: 'inline',
        pageSourceRelativePath: 'docs/button.md',
        line: 1,
        column: 1
      })
    ])
  })

  it('allows an untitled iframe demo', () => {
    expect(references('::demo{src="./demo/basic.tsx" sandbox="iframe"}')[0]).toEqual(
      expect.objectContaining({ specifier: './demo/basic.tsx', sandbox: 'iframe' })
    )
  })

  it('rejects unsupported forms and attributes', () => {
    expect(() => references(':::demo\ntext\n:::')).toThrow('must use leaf syntax')
    expect(() => references('::demo[Missing]')).toThrow('require a `src` attribute')
    expect(() => references('::demo{src="https://example.com/demo.tsx"}')).toThrow(
      'must reference a project module'
    )
    expect(() => references('::demo{src="./demo.tsx" unknown="value"}')).toThrow('do not support `unknown`')
  })

  it('creates stable ids and separates repeated declarations by position', () => {
    const first = references('::demo{src="./demo.tsx"}\n\n::demo{src="./demo.tsx"}')
    const second = references('::demo{src="./demo.tsx"}\n\n::demo{src="./demo.tsx"}')
    expect(first.map((demo) => demo.id)).toEqual(second.map((demo) => demo.id))
    expect(first[0]?.id).not.toBe(first[1]?.id)
  })
})
