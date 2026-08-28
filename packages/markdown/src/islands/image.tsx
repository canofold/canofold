import { hydrateRoot } from 'react-dom/client'
import { MarkdownImage } from '../components/blocks/MarkdownImage'
import { readSerializedChildren } from './serialized'
import { withIslandOptions } from './provider'
import type { MarkdownIslandRenderOptions } from './options'

export function hydrate(root: HTMLElement, options?: MarkdownIslandRenderOptions) {
  const image = root.querySelector('img')
  if (!image) return
  const serializedChildren = readSerializedChildren(root.dataset.dfIslandData, options)
  return hydrateRoot(
    root,
    withIslandOptions(
      <MarkdownImage
        src={serializedChildren ? undefined : (image.getAttribute('src') ?? '')}
        alt={serializedChildren ? undefined : (image.getAttribute('alt') ?? '')}
        title={serializedChildren ? undefined : (image.getAttribute('title') ?? undefined)}
        width={serializedChildren ? undefined : (image.getAttribute('width') ?? undefined)}
        height={serializedChildren ? undefined : (image.getAttribute('height') ?? undefined)}
        loading={
          serializedChildren || !image.hasAttribute('loading')
            ? undefined
            : image.getAttribute('loading') === 'eager'
              ? 'eager'
              : 'lazy'
        }
        srcSet={serializedChildren ? undefined : (image.getAttribute('srcset') ?? undefined)}
        sizes={serializedChildren ? undefined : (image.getAttribute('sizes') ?? undefined)}
        caption={
          serializedChildren ? undefined : (root.querySelector('figcaption')?.textContent ?? undefined)
        }
        className={root.className || undefined}
        zoomLabel={root.dataset.dfZoomLabel}
        closeLabel={root.dataset.dfCloseLabel}
        inner
      >
        {serializedChildren}
      </MarkdownImage>,
      options
    )
  )
}
