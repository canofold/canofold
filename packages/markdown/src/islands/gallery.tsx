import { hydrateRoot } from 'react-dom/client'
import { ImageGallery, type MarkdownGalleryItem } from '../components/gallery/ImageGallery'
import { withIslandOptions } from './provider'
import type { MarkdownIslandRenderOptions } from './options'

function readItems(root: HTMLElement): MarkdownGalleryItem[] {
  try {
    const value = JSON.parse(root.dataset.cfGalleryItems ?? '[]')
    return Array.isArray(value)
      ? value.filter((item): item is MarkdownGalleryItem =>
          Boolean(
            item &&
            typeof item === 'object' &&
            typeof (item as { src?: unknown }).src === 'string' &&
            typeof (item as { alt?: unknown }).alt === 'string'
          )
        )
      : []
  } catch {
    return []
  }
}

export function hydrate(root: HTMLElement, options?: MarkdownIslandRenderOptions) {
  return hydrateRoot(
    root,
    withIslandOptions(
      <ImageGallery
        items={readItems(root)}
        className={root.className || undefined}
        role={root.getAttribute('role') === 'region' ? 'region' : 'group'}
        labels={{
          gallery: root.dataset.cfGalleryLabel,
          close: root.dataset.cfCloseLabel,
          previous: root.dataset.cfPreviousLabel,
          next: root.dataset.cfNextLabel,
          thumbnails: root.dataset.cfThumbnailsLabel,
          image: root.dataset.cfImageLabel
        }}
        inner
      />,
      options
    )
  )
}
