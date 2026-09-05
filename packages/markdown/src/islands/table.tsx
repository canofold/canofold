import { hydrateRoot } from 'react-dom/client'
import { MarkdownTable } from '../components/blocks/MarkdownTable'
import { readSerializedNode } from './serialized'
import { withIslandOptions } from './provider'
import type { MarkdownIslandRenderOptions } from './options'

export function hydrate(root: HTMLElement, options?: MarkdownIslandRenderOptions) {
  return hydrateRoot(
    root,
    withIslandOptions(
      <MarkdownTable
        className={root.className}
        tableTitle={root.dataset.cfTableTitle}
        copyLabel={root.dataset.cfCopyLabel}
        copyFailureLabel={root.dataset.cfCopyFailureLabel}
        downloadLabel={root.dataset.cfDownloadLabel}
        zoomLabel={root.dataset.cfZoomLabel}
        closeLabel={root.dataset.cfCloseLabel}
        sortLabel={root.dataset.cfSortLabel}
        serializedTable={root.dataset.cfTable}
        inner
      >
        {readSerializedNode(root.dataset.cfTable, options)}
      </MarkdownTable>,
      options
    )
  )
}
