import { describe, expect, it } from 'vitest'
import { queryCompactIndex, type CompactSearchIndex } from './queryCompact'

const index: CompactSearchIndex = {
  docs: [
    {
      title: '组件开发工作流',
      description: '使用 Vite 编写真实组件示例',
      routePath: '/component-development/',
      excerpt: '组件文档与源码保持同步。',
      tags: ['组件库']
    },
    {
      title: '内容编辑',
      description: '编写普通产品文档',
      routePath: '/content/',
      excerpt: '文档内容与组件无关。',
      tags: []
    }
  ],
  postings: {
    组: [0, 1],
    件: [0, 1],
    组件: [0, 1],
    开: [0],
    发: [0],
    开发: [0]
  }
}

describe('queryCompactIndex', () => {
  it('ranks a complete Chinese phrase above partial token matches', () => {
    expect(queryCompactIndex('组件开发', index).map((document) => document.routePath)).toEqual([
      '/component-development/',
      '/content/'
    ])
  })

  it('honors the result limit', () => {
    expect(queryCompactIndex('组件', index, 1)).toHaveLength(1)
  })
})
