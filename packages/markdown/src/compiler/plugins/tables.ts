import { SKIP, visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'
import type { MarkdownAssetCollector } from '../assets'
import type { NormalizedMarkdownOptions } from '../normalizeOptions'
import { serializeMarkdownNode } from '../../protocol/serializedNode'

function isComponent(node: unknown, component: string) {
  if (!node || typeof node !== 'object' || !('properties' in node)) return false
  const properties = (node as Element).properties
  return properties?.dataDfComponent === component || properties?.['data-df-component'] === component
}

/** Turn GFM tables into a serializable data block; React owns table UI/state. */
export const rehypeTables = (assets: MarkdownAssetCollector, labels: NormalizedMarkdownOptions['labels']) => {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || !parent || index === undefined || isComponent(parent, 'table')) return

      assets.markBehavior('table')
      const table = { ...node, properties: { ...node.properties, dataDfSlot: 'table' } }
      const figure: Element = {
        type: 'element',
        tagName: 'figure',
        properties: {
          className: ['df-table-window'],
          dataDfComponent: 'table',
          dataDfIsland: 'table',
          dataDfSlot: 'root',
          dataDfTableTitle: labels.tableTitle,
          dataDfCopyLabel: labels.copyTableCsv,
          dataDfCopyFailureLabel: labels.copyFailed,
          dataDfDownloadLabel: labels.downloadTableCsv,
          dataDfZoomLabel: labels.zoomTable,
          dataDfCloseLabel: labels.closeTablePreview,
          dataDfSortLabel: labels.sortTableColumn,
          // The raw HAST subtree lets the static React island hydrate the
          // same table without reparsing Markdown or reading rendered HTML.
          dataDfTable: serializeMarkdownNode(table)
        },
        children: [table]
      }
      parent.children[index] = figure
      return [SKIP]
    })
  }
}
