import type { MarkdownPlugin } from '@canofold/markdown/server'
import { createHash } from 'node:crypto'
import type { DocPage } from '../content/types'
import type { CanofoldDemoLabels } from './labels'
import type { CanofoldDemoManifest, CanofoldPreparedDemo } from './types'

interface AstNode {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined>
  children?: AstNode[]
  position?: { start?: { line?: number; column?: number } }
  data?: Record<string, unknown>
  value?: string
  lang?: string | null
  meta?: string | null
}

function properties(hName: string, hProperties: Record<string, unknown>) {
  return { hName, hProperties }
}

function demoNode(demo: CanofoldPreparedDemo, labels: CanofoldDemoLabels): AstNode {
  const sourceId = `cf-demo-source-${demo.id}`
  const titleId = `cf-demo-title-${demo.id}`
  const details: AstNode[] = []
  if (demo.title) {
    details.push({
      type: 'textDirective',
      name: 'canofold-demo-title',
      children: [{ type: 'text', value: demo.title }],
      data: properties('strong', { id: titleId, className: ['cf-demo-title'] })
    })
  }
  if (demo.description) {
    details.push({
      type: 'textDirective',
      name: 'canofold-demo-description',
      children: [{ type: 'text', value: demo.description }],
      data: properties('p', { className: ['cf-demo-description'] })
    })
  }

  const actionIcon = (name: string, className: string): AstNode => ({
    type: 'textDirective',
    name,
    children: [],
    data: properties('span', { className: ['cf-demo-action-icon', className], ariaHidden: true })
  })
  const tooltip = (name: string, value: string): AstNode => ({
    type: 'textDirective',
    name,
    children: [{ type: 'text', value }],
    data: properties('span', {
      className: ['cf-demo-tooltip'],
      ariaHidden: true,
      dataCfDemoTooltip: ''
    })
  })

  const actions: AstNode[] = [
    {
      type: 'textDirective',
      name: 'canofold-demo-open',
      children: [
        actionIcon('canofold-demo-open-icon', 'cf-demo-open-icon'),
        tooltip('canofold-demo-open-tooltip', labels.openPreview)
      ],
      data: properties('a', {
        className: ['cf-demo-action', 'cf-demo-open'],
        href: `?canofold-demo=${demo.id}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        ariaLabel: labels.openPreview
      })
    },
    {
      type: 'textDirective',
      name: 'canofold-demo-source-toggle',
      children: [
        actionIcon('canofold-demo-source-icon', 'cf-demo-source-icon'),
        tooltip('canofold-demo-source-tooltip', labels.showSource)
      ],
      data: properties('button', {
        className: ['cf-demo-action', 'cf-demo-source-toggle'],
        type: 'button',
        ariaLabel: labels.showSource,
        ariaControls: sourceId,
        ariaExpanded: false,
        dataCfDemoSourceToggle: '',
        dataCfDemoShowLabel: labels.showSource,
        dataCfDemoHideLabel: labels.hideSource
      })
    }
  ]

  return {
    type: 'containerDirective',
    name: 'canofold-demo-card',
    data: properties('figure', {
      className: ['cf-demo'],
      dataCfComponent: 'demo',
      dataCfDemoId: demo.id,
      dataCfDemoSandbox: demo.sandbox,
      ...(demo.title ? { ariaLabelledBy: titleId } : {}),
      ...(!demo.title && demo.description ? { ariaLabel: demo.description } : {})
    }),
    children: [
      {
        type: 'paragraph',
        data: properties('div', {
          className: ['cf-demo-preview'],
          dataCfDemoPreview: '',
          dataCfDemoId: demo.id,
          dataCfDemoLoadingLabel: labels.loading,
          dataCfDemoFailedLabel: labels.failed
        }),
        children: []
      },
      ...(details.length > 0
        ? [
            {
              type: 'paragraph',
              data: properties('div', { className: ['cf-demo-details'] }),
              children: details
            } satisfies AstNode
          ]
        : []),
      {
        type: 'paragraph',
        data: properties('div', { className: ['cf-demo-toolbar'] }),
        children: actions
      },
      {
        type: 'containerDirective',
        name: 'canofold-demo-source',
        data: properties('div', {
          id: sourceId,
          className: ['cf-demo-source'],
          hidden: true,
          dataCfDemoSource: ''
        }),
        children: [
          {
            type: 'code',
            lang: demo.language,
            meta: `filename=${JSON.stringify(demo.specifier)}`,
            value: demo.source
          }
        ]
      }
    ]
  }
}

function matchingDemo(page: DocPage, manifest: CanofoldDemoManifest, node: AstNode, used: Set<string>) {
  const src = node.attributes?.src?.trim()
  const line = node.position?.start?.line
  const column = node.position?.start?.column
  const reference = page.demos.find(
    (demo) =>
      !used.has(demo.id) &&
      demo.specifier === src &&
      (line === undefined || demo.line === line) &&
      (column === undefined || demo.column === column)
  )
  if (!reference) return undefined
  const prepared = manifest.demos[reference.id]
  if (!prepared) {
    throw new Error(`Demo engine did not prepare ${reference.specifier} for ${page.sourceRelativePath}`)
  }
  used.add(reference.id)
  return prepared
}

function transformDemoNodes(
  tree: AstNode,
  page: DocPage,
  manifest: CanofoldDemoManifest,
  labels: CanofoldDemoLabels
) {
  const used = new Set<string>()
  const walk = (node: AstNode) => {
    if (!node.children) return
    node.children.forEach((child, index) => {
      if (child.type === 'leafDirective' && child.name === 'demo') {
        const demo = matchingDemo(page, manifest, child, used)
        if (!demo) {
          throw new Error(`Could not match demo directive in ${page.sourceRelativePath}`)
        }
        node.children![index] = demoNode(demo, labels)
        return
      }
      walk(child)
    })
  }
  walk(tree)
}

export function createDemoMarkdownPlugin({
  page,
  manifest,
  labels
}: {
  page: DocPage
  manifest: CanofoldDemoManifest
  labels: CanofoldDemoLabels
}): MarkdownPlugin {
  const preparedDemos = page.demos.flatMap((reference) => {
    const demo = manifest.demos[reference.id]
    return demo ? [demo] : []
  })
  return {
    name: 'canofold-demo-renderer',
    version: '2',
    cacheKey: {
      page: page.sourceRelativePath,
      demos: preparedDemos.map((demo) => [demo.id, createHash('sha256').update(demo.source).digest('hex')])
    },
    directiveNames: ['demo'],
    highlightLanguages: [...new Set(preparedDemos.map((demo) => demo.language))],
    remarkPlugins: [() => (tree: AstNode) => transformDemoNodes(tree, page, manifest, labels)]
  }
}
