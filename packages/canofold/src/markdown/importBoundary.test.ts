import { describe, expect, it } from 'vitest'
import { prepareMdxSource } from './importBoundary'

describe('prepareMdxSource', () => {
  it('allows React runtimes and project-local imports', () => {
    expect(() =>
      prepareMdxSource(`
        import React from 'react'
        import { jsx } from 'react/jsx-runtime'
        import { LocalBadge } from './LocalBadge'
      `)
    ).not.toThrow()
  })

  it('rejects retired package component imports', () => {
    expect(() => prepareMdxSource(`import { Alert } from 'canofold/components'`)).toThrow(
      'External import is not allowed: canofold/components'
    )
    expect(() => prepareMdxSource(`import { MarkdownBadge } from '@canofold/markdown'`)).toThrow(
      'External import is not allowed: @canofold/markdown'
    )
  })

  it('rejects arbitrary npm imports', () => {
    expect(() => prepareMdxSource(`import Chart from 'third-party-chart'`)).toThrow(
      'External import is not allowed: third-party-chart'
    )
  })

  it('rejects absolute file imports', () => {
    expect(() => prepareMdxSource(`import { Badge } from '/tmp/Badge'`)).toThrow(
      'External import is not allowed: /tmp/Badge'
    )
  })

  it('strips multiline imports as one declaration', () => {
    expect(prepareMdxSource("import {\n  Alert,\n  Tabs\n} from './Blocks'\n\n# Page").source).toBe('# Page')
  })

  it('does not treat fenced import examples as module declarations', () => {
    const source = "```ts\nimport Chart from 'third-party-chart'\n```\n"
    expect(() => prepareMdxSource(source)).not.toThrow()
    expect(prepareMdxSource(source).source).toBe(source)
  })

  it('returns parsed aliases for the component binder', () => {
    expect(prepareMdxSource("import { Alert as Notice } from './Blocks'\n\n<Notice />").imports).toEqual([
      {
        specifier: './Blocks',
        bindings: [{ imported: 'Alert', local: 'Notice' }]
      }
    ])
  })

  it('removes imports without deleting adjacent MDX exports', () => {
    const prepared = prepareMdxSource(
      "import { Alert } from './Blocks'\nexport const version = 'next'\n\n# Page"
    )
    expect(prepared.source).toContain("export const version = 'next'")
    expect(prepared.source).toContain('# Page')
  })

  it('rejects dynamic imports and re-exports', () => {
    expect(() => prepareMdxSource('{import("third-party-chart")}')).toThrow('Dynamic import is not allowed')
    expect(() => prepareMdxSource("export { Chart } from 'third-party-chart'")).toThrow(
      'Re-export is not allowed'
    )
  })
})
