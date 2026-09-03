import { SKIP, visit } from 'unist-util-visit'
import type { Element, ElementContent, Root } from 'hast'
import type { MarkdownAssetCollector } from '../assets'
import type { NormalizedMarkdownOptions } from '../normalizeOptions'

function componentName(node: Element | undefined) {
  if (!node) return ''
  const properties = node.properties
  return String(properties.dataCfComponent ?? properties['data-cf-component'] ?? '')
}

const DOCUMENT_FILE_TYPES = new Map([
  ['pdf', { kind: 'pdf', badge: 'PDF', label: 'PDF document' }],
  ['doc', { kind: 'word', badge: 'DOC', label: 'Microsoft Word' }],
  ['docx', { kind: 'word', badge: 'DOCX', label: 'Microsoft Word' }],
  ['ppt', { kind: 'powerpoint', badge: 'PPT', label: 'Microsoft PowerPoint' }],
  ['pptx', { kind: 'powerpoint', badge: 'PPTX', label: 'Microsoft PowerPoint' }],
  ['xls', { kind: 'excel', badge: 'XLS', label: 'Microsoft Excel' }],
  ['xlsx', { kind: 'excel', badge: 'XLSX', label: 'Microsoft Excel' }]
])

function documentFile(href: unknown) {
  if (typeof href !== 'string' || !href.trim()) return undefined
  const value = href.trim()
  const scheme = value.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
  if (scheme && scheme !== 'http' && scheme !== 'https') return undefined

  let path = (value.split('#')[0] ?? '').split('?')[0] ?? ''
  try {
    if (scheme || value.startsWith('//')) {
      path = new URL(value.startsWith('//') ? `https:${value}` : value).pathname
    }
  } catch {
    return undefined
  }

  const encodedName = path.split('/').filter(Boolean).at(-1)
  if (!encodedName) return undefined
  let filename = encodedName
  try {
    filename = decodeURIComponent(encodedName)
  } catch {
    // Keep the encoded URL segment when it is not valid percent-encoding.
  }
  const extension = filename.toLowerCase().match(/\.([a-z\d]+)$/)?.[1]
  const type = extension ? DOCUMENT_FILE_TYPES.get(extension) : undefined
  return type ? { ...type, filename } : undefined
}

function classNames(node: Element) {
  const value: unknown = node.properties?.className
  return Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/\s+/) : []
}

function trackTrustedComponent(
  node: Element,
  assets: MarkdownAssetCollector,
  labels: NormalizedMarkdownOptions['labels']
) {
  const properties = node.properties ?? {}
  const component = componentName(node)

  if (component === 'gallery') {
    assets.markBehavior('gallery')
    const galleryLabel =
      typeof properties.dataCfGalleryLabel === 'string' && properties.dataCfGalleryLabel.trim()
        ? properties.dataCfGalleryLabel
        : typeof properties['data-cf-gallery-label'] === 'string' &&
            properties['data-cf-gallery-label'].trim()
          ? properties['data-cf-gallery-label']
          : labels.imageGallery
    node.properties = {
      ...properties,
      dataCfGalleryLabel: galleryLabel,
      dataCfCloseLabel: labels.closeImageGallery,
      dataCfPreviousLabel: labels.previousGalleryImage,
      dataCfNextLabel: labels.nextGalleryImage,
      dataCfThumbnailsLabel: labels.galleryThumbnails,
      dataCfImageLabel: labels.galleryImage
    }
  }
  if (component === 'tabs' || component === 'code-group') assets.markBehavior('tabs')
  if (component === 'details') assets.markBehavior('details')
  if (component === 'file-tree') assets.markBehavior('file-tree')
  if (component === 'code-block') assets.markBehavior('code-toolbar')
  if (component === 'copy-snippet') {
    assets.markBehavior('copy-snippet')
    node.properties = {
      ...properties,
      dataCfCopyLabel: labels.copySnippet,
      dataCfCopyFailureLabel: labels.copyFailed
    }
  }
  if (component === 'table') assets.markBehavior('table')
  if (component === 'image') assets.markBehavior('image')
  if (component === 'terminal') assets.markBehavior('terminal-toolbar')
}

/** Add document-level semantics shared by the static and React renderers. */
export const rehypeDocumentBlocks = (
  assets: MarkdownAssetCollector,
  labels: NormalizedMarkdownOptions['labels']
) => {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index === undefined) return
      trackTrustedComponent(node, assets, labels)

      if (node.tagName === 'input' && node.properties?.type === 'checkbox') {
        node.properties.ariaLabel = node.properties.checked ? labels.taskCompleted : labels.taskIncomplete
        return
      }

      if (node.tagName === 'section' && node.properties?.dataFootnotes !== undefined) {
        node.properties = { ...node.properties, dataCfElement: 'footnotes' }
        return
      }

      const parentElement = parent.type === 'element' ? parent : undefined
      if (node.tagName === 'figure' && !componentName(node) && componentName(parentElement) !== 'gallery') {
        const meaningful = node.children.filter((child) => child.type !== 'text' || child.value.trim() !== '')
        const image = meaningful.find(
          (child): child is Element => child.type === 'element' && child.tagName === 'img'
        )
        const caption = meaningful.find(
          (child): child is Element => child.type === 'element' && child.tagName === 'figcaption'
        )
        const isImageFigure =
          image &&
          meaningful.every(
            (child) => child.type === 'element' && (child.tagName === 'img' || child.tagName === 'figcaption')
          )
        if (isImageFigure) {
          const existingClasses = classNames(node)
          assets.markBehavior('image')
          node.properties = {
            ...node.properties,
            className: [...new Set([...existingClasses, 'cf-media-frame'])],
            dataCfComponent: 'image',
            dataCfIsland: 'image',
            dataCfSlot: 'root',
            dataCfZoomLabel: labels.zoomImage,
            dataCfCloseLabel: labels.closeImagePreview
          }
          if (caption) caption.properties = { ...caption.properties, dataCfSlot: 'caption' }
          return
        }
      }

      if (node.tagName === 'details') {
        assets.markBehavior('details')
        node.properties = {
          ...node.properties,
          dataCfComponent: 'details',
          dataCfBehavior: 'details',
          dataCfSlot: 'root'
        }
        const summary = node.children?.find(
          (child): child is Element => child.type === 'element' && child.tagName === 'summary'
        )
        if (summary) summary.properties = { ...summary.properties, dataCfSlot: 'summary' }
        return
      }

      if (/^h[2-6]$/.test(node.tagName) && node.properties?.id) {
        assets.markBehavior('heading')
        node.properties = {
          ...node.properties,
          dataCfAnchor: `#${node.properties.id}`,
          dataCfAnchorLabel: labels.copySectionLink,
          dataCfCopyFailureLabel: labels.copyFailed
        }
        return
      }

      if (node.tagName !== 'p') return
      const meaningful = node.children.filter((child) => child.type !== 'text' || child.value.trim() !== '')
      const onlyChild = meaningful[0]
      if (meaningful.length !== 1 || onlyChild?.type !== 'element') return

      if (onlyChild.tagName === 'a') {
        const file = documentFile(onlyChild.properties?.href)
        if (!file) return
        parent.children[index] = {
          ...onlyChild,
          properties: {
            ...onlyChild.properties,
            className: [...new Set([...classNames(onlyChild), 'cf-file-link'])],
            dataCfFileKind: file.kind,
            dataCfElement: 'file-link'
          },
          children: [
            {
              type: 'element',
              tagName: 'span',
              properties: {
                className: ['cf-file-icon'],
                dataCfFileIcon: file.kind,
                ariaHidden: 'true'
              },
              children: []
            },
            {
              type: 'element',
              tagName: 'span',
              properties: { className: ['cf-file-details'] },
              children: [
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { className: ['cf-file-name'] },
                  children: [{ type: 'text', value: file.filename }]
                },
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { className: ['cf-file-meta'] },
                  children: [{ type: 'text', value: `${file.label} · ${file.badge}` }]
                }
              ]
            },
            {
              type: 'element',
              tagName: 'span',
              properties: { className: ['cf-file-download'], ariaHidden: 'true' },
              children: []
            }
          ]
        }
        return [SKIP]
      }

      if (onlyChild.tagName !== 'img') return
      const image = onlyChild

      assets.markBehavior('image')
      const caption = image.properties?.title
      const children: ElementContent[] = [image]
      if (caption) {
        children.push({
          type: 'element',
          tagName: 'figcaption',
          properties: { dataCfSlot: 'caption' },
          children: [{ type: 'text', value: String(caption) }]
        })
      }
      parent.children[index] = {
        type: 'element',
        tagName: 'figure',
        properties: {
          className: ['cf-media-frame'],
          dataCfComponent: 'image',
          dataCfIsland: 'image',
          dataCfSlot: 'root',
          dataCfZoomLabel: labels.zoomImage,
          dataCfCloseLabel: labels.closeImagePreview
        },
        children
      }
      return [SKIP]
    })
  }
}
