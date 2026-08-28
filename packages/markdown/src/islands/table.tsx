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
        tableTitle={root.dataset.dfTableTitle}
        copyLabel={root.dataset.dfCopyLabel}
        copyFailureLabel={root.dataset.dfCopyFailureLabel}
        downloadLabel={root.dataset.dfDownloadLabel}
        zoomLabel={root.dataset.dfZoomLabel}
        closeLabel={root.dataset.dfCloseLabel}
        sortLabel={root.dataset.dfSortLabel}
        serializedTable={root.dataset.dfTable}
        inner
      >
        {readSerializedNode(root.dataset.dfTable, options)}
      </MarkdownTable>,
      options
    )
  )
}
