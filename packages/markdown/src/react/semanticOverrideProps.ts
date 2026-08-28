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
        (element.props['data-df-slot'] === 'caption' || element.props.dataDfSlot === 'caption'))
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
      source: stringProp(props, 'data-df-source', 'dataDfSource') || reactText(children),
      language: stringProp(props, 'data-df-language', 'dataDfLanguage') || 'text',
      copyLabel: stringProp(props, 'data-df-copy-label', 'dataDfCopyLabel') || undefined,
      copyFailureLabel: stringProp(props, 'data-df-copy-failure-label', 'dataDfCopyFailureLabel') || undefined
    }
  if (component === 'copy-snippet')
    return {
      ...base,
      value: stringProp(props, 'data-df-value', 'dataDfValue') || reactText(children),
      copyLabel: stringProp(props, 'data-df-copy-label', 'dataDfCopyLabel') || undefined,
      copyFailureLabel: stringProp(props, 'data-df-copy-failure-label', 'dataDfCopyFailureLabel') || undefined
    }
  if (component === 'table')
    return {
      ...base,
      tableTitle: stringProp(props, 'data-df-table-title', 'dataDfTableTitle') || undefined,
      copyLabel: stringProp(props, 'data-df-copy-label', 'dataDfCopyLabel') || undefined,
      copyFailureLabel:
        stringProp(props, 'data-df-copy-failure-label', 'dataDfCopyFailureLabel') || undefined,
      downloadLabel: stringProp(props, 'data-df-download-label', 'dataDfDownloadLabel') || undefined,
      zoomLabel: stringProp(props, 'data-df-zoom-label', 'dataDfZoomLabel') || undefined,
      closeLabel: stringProp(props, 'data-df-close-label', 'dataDfCloseLabel') || undefined,
      sortLabel: stringProp(props, 'data-df-sort-label', 'dataDfSortLabel') || undefined
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
      zoomLabel: stringProp(props, 'data-df-zoom-label', 'dataDfZoomLabel') || undefined,
      closeLabel: stringProp(props, 'data-df-close-label', 'dataDfCloseLabel') || undefined
    }
  }
  if (component === 'terminal')
    return {
      ...base,
      title: stringProp(props, 'data-df-title', 'dataDfTitle') || undefined,
      source: stringProp(props, 'data-df-source', 'dataDfSource'),
      copyLabel: stringProp(props, 'data-df-copy-label', 'dataDfCopyLabel') || undefined,
      copyFailureLabel: stringProp(props, 'data-df-copy-failure-label', 'dataDfCopyFailureLabel') || undefined
    }
  if (component === 'gallery')
    return {
      ...base,
      items: resolveMarkdownGalleryItems(undefined, props.node, children),
      labels: {
        gallery: stringProp(props, 'data-df-gallery-label', 'dataDfGalleryLabel') || undefined,
        close: stringProp(props, 'data-df-close-label', 'dataDfCloseLabel') || undefined,
        previous: stringProp(props, 'data-df-previous-label', 'dataDfPreviousLabel') || undefined,
        next: stringProp(props, 'data-df-next-label', 'dataDfNextLabel') || undefined,
        thumbnails: stringProp(props, 'data-df-thumbnails-label', 'dataDfThumbnailsLabel') || undefined,
        image: stringProp(props, 'data-df-image-label', 'dataDfImageLabel') || undefined
      }
    }
  return base
}
