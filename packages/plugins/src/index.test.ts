import { describe, expect, it } from 'vitest'
import * as plugins from './index'

describe('@docfuse/plugins aggregate entry', () => {
  it('exports every documented factory', () => {
    expect(Object.keys(plugins).sort()).toEqual([
      'externalLinks',
      'kroki',
      'linkCard',
      'math',
      'mermaid',
      'pagefind',
      'plantUml',
      'readingTime'
    ])
    Object.values(plugins).forEach((factory) => expect(factory).toBeTypeOf('function'))
  })
})
