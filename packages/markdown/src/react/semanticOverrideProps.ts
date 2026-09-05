import { Children, isValidElement, type ReactNode } from 'react'
import { resolveMarkdownGalleryItems } from '../components/gallery/ImageGallery'
import {
  elementTag,
  reactText,
  readProp,
  stringProp,
  type MarkdownReactElement
} from '../components/shared/reactText'
import type { MarkdownComponentName, MarkdownElementProps } from './componentMap'

function childElement(children: ReactNode, tagName: string) {
  return Children.toArray(children).find((child): child is MarkdownReactElement => {
    if (!isValidElement(child)) return false
    const element = child as MarkdownReactElement
    return (
      elementTag(element) === tagName ||
      (tagName === 'figcaption' &&
        (element.props['data-cf-slot'] === 'caption' || element.props.dataCfSlot === 'caption'))
    )
  })
}

/** Normalize compiler data attributes into the public props promised to named replacements. */
export function semanticOverrideProps(
  component: MarkdownComponentName,
  props: MarkdownElementProps,
  children: ReactNode
): MarkdownElementProps {
  const base = { ...props, children }
  if (component === 'code-block')
    return {
      ...base,
      source: stringProp(props, 'data-cf-source', 'dataCfSource') || reactText(children),
      language: stringProp(props, 'data-cf-language', 'dataCfLanguage') || 'text',
      copyLabel: stringProp(props, 'data-cf-copy-label', 'dataCfCopyLabel') || undefined,
      copyFailureLabel: stringProp(props, 'data-cf-copy-failure-label', 'dataCfCopyFailureLabel') || undefined
    }
  if (component === 'copy-snippet')
    return {
      ...base,
      value: stringProp(props, 'data-cf-value', 'dataCfValue') || reactText(children),
      copyLabel: stringProp(props, 'data-cf-copy-label', 'dataCfCopyLabel') || undefined,
      copyFailureLabel: stringProp(props, 'data-cf-copy-failure-label', 'dataCfCopyFailureLabel') || undefined
    }
  if (component === 'table')
    return {
      ...base,
      tableTitle: stringProp(props, 'data-cf-table-title', 'dataCfTableTitle') || undefined,
      copyLabel: stringProp(props, 'data-cf-copy-label', 'dataCfCopyLabel') || undefined,
      copyFailureLabel:
        stringProp(props, 'data-cf-copy-failure-label', 'dataCfCopyFailureLabel') || undefined,
      downloadLabel: stringProp(props, 'data-cf-download-label', 'dataCfDownloadLabel') || undefined,
      zoomLabel: stringProp(props, 'data-cf-zoom-label', 'dataCfZoomLabel') || undefined,
      closeLabel: stringProp(props, 'data-cf-close-label', 'dataCfCloseLabel') || undefined,
      sortLabel: stringProp(props, 'data-cf-sort-label', 'dataCfSortLabel') || undefined
    }
  if (component === 'image') {
    const image = childElement(children, 'img')
    const caption = childElement(children, 'figcaption')
    const width = image ? readProp(image.props, 'width') : undefined
    const height = image ? readProp(image.props, 'height') : undefined
    const loading = image ? readProp(image.props, 'loading') : undefined
    return {
      ...base,
      src: image ? stringProp(image.props, 'src') || undefined : undefined,
      alt: image ? stringProp(image.props, 'alt') : undefined,
      caption: caption ? reactText(caption.props.children) : undefined,
      title: image ? stringProp(image.props, 'title') || undefined : undefined,
      width: typeof width === 'string' || typeof width === 'number' ? width : undefined,
      height: typeof height === 'string' || typeof height === 'number' ? height : undefined,
      loading: loading === 'eager' || loading === 'lazy' ? loading : undefined,
      srcSet: image ? stringProp(image.props, 'srcSet', 'srcset') || undefined : undefined,
      sizes: image ? stringProp(image.props, 'sizes') || undefined : undefined,
      zoomLabel: stringProp(props, 'data-cf-zoom-label', 'dataCfZoomLabel') || undefined,
      closeLabel: stringProp(props, 'data-cf-close-label', 'dataCfCloseLabel') || undefined
    }
  }
  if (component === 'terminal')
    return {
      ...base,
      title: stringProp(props, 'data-cf-title', 'dataCfTitle') || undefined,
      source: stringProp(props, 'data-cf-source', 'dataCfSource'),
      copyLabel: stringProp(props, 'data-cf-copy-label', 'dataCfCopyLabel') || undefined,
      copyFailureLabel: stringProp(props, 'data-cf-copy-failure-label', 'dataCfCopyFailureLabel') || undefined
    }
  if (component === 'gallery')
    return {
      ...base,
      items: resolveMarkdownGalleryItems(undefined, props.node, children),
      labels: {
        gallery: stringProp(props, 'data-cf-gallery-label', 'dataCfGalleryLabel') || undefined,
        close: stringProp(props, 'data-cf-close-label', 'dataCfCloseLabel') || undefined,
        previous: stringProp(props, 'data-cf-previous-label', 'dataCfPreviousLabel') || undefined,
        next: stringProp(props, 'data-cf-next-label', 'dataCfNextLabel') || undefined,
        thumbnails: stringProp(props, 'data-cf-thumbnails-label', 'dataCfThumbnailsLabel') || undefined,
        image: stringProp(props, 'data-cf-image-label', 'dataCfImageLabel') || undefined
      }
    }
  return base
}
