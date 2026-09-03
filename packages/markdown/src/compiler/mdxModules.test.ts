import { describe, expect, it } from 'vitest'
import { analyzeMdxModuleBoundary } from './mdxModules'

describe('analyzeMdxModuleBoundary', () => {
  it('collects default, named, aliased, namespace, and side-effect imports', () => {
    const result = analyzeMdxModuleBoundary(`import React from 'react'
import { Alert, Badge as Status } from 'canofold/components'
import * as Markdown from '@canofold/markdown'
import './setup'

# Page`)

    expect(result.imports).toEqual([
      { specifier: 'react', bindings: [{ imported: 'default', local: 'React' }] },
      {
        specifier: 'canofold/components',
        bindings: [
          { imported: 'Alert', local: 'Alert' },
          { imported: 'Badge', local: 'Status' }
        ]
      },
      {
        specifier: '@canofold/markdown',
        bindings: [{ imported: '*', local: 'Markdown', namespace: true }]
      },
      { specifier: './setup', bindings: [] }
    ])
    expect(result.sourceWithoutImports).toBe('# Page')
  })

  it('reports dynamic imports and re-exports without inspecting fenced examples', () => {
    const result = analyzeMdxModuleBoundary(`export { Badge } from './Badge'

{import('./Chart')}

\`\`\`ts
import('./example')
\`\`\``)

    expect(result.unsupportedReferences).toEqual([
      { kind: 'dynamic-import', specifier: './Chart' },
      { kind: 'export-from', specifier: './Badge' }
    ])
  })
})
