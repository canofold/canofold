import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { DEFAULT_MARKDOWN_LABELS } from '../../compiler/defaultLabels'
import { MarkdownIcon } from '../shared/MarkdownIcon'
import { markdownDomProps, reactText, stringProp } from '../shared/reactText'
import { MarkdownDialogPortal, useMarkdownDialog } from '../shared/MarkdownDialog'
import { transformMarkdownSrcSet, useMarkdownUrlTransform } from '../../react/urlTransform'

export interface MarkdownGalleryItem {
  src: string
  alt: string
  caption?: string
  title?: string
  srcSet?: string
  sizes?: string
  width?: number | string
  height?: number | string
}

export interface ImageGalleryProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> {
  children?: ReactNode
  items?: MarkdownGalleryItem[]
  role?: 'group' | 'region'
  labels?: Partial<{
    gallery: string
    close: string
    previous: string
    next: string
    thumbnails: string
    image: string
  }>
}

interface InternalImageGalleryProps extends ImageGalleryProps {
  inner?: boolean
  node?: unknown
}

function childElement(
  children: ReactNode,
  tagName: string
): ReactElement<Record<string, unknown>> | undefined {
  return Children.toArray(children).find((child): child is ReactElement<Record<string, unknown>> => {
    if (!isValidElement(child)) return false
    return child.type === tagName
  })
}

function itemsFromChildren(children: ReactNode): MarkdownGalleryItem[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== 'figure') return []
    const figureProps = child.props as { children?: ReactNode }
    const image = childElement(figureProps.children, 'img')
    if (!image || typeof image.props.src !== 'string') return []
    const caption = childElement(figureProps.children, 'figcaption')
    return [
      {
        src: image.props.src,
        alt: typeof image.props.alt === 'string' ? image.props.alt : '',
        caption: caption ? reactText(caption.props.children) : undefined,
        title: typeof image.props.title === 'string' ? image.props.title : undefined,
        srcSet: typeof image.props.srcSet === 'string' ? image.props.srcSet : undefined,
        sizes: typeof image.props.sizes === 'string' ? image.props.sizes : undefined,
        width:
          typeof image.props.width === 'number' || typeof image.props.width === 'string'
            ? image.props.width
            : undefined,
        height:
          typeof image.props.height === 'number' || typeof image.props.height === 'string'
            ? image.props.height
            : undefined
      }
    ]
  })
}

function nonGalleryChildren(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter((child) => {
    if (!isValidElement(child)) return true
    const figureProps = child.props as { children?: ReactNode; node?: unknown }
    if (child.type === 'figure') {
      const image = childElement(figureProps.children, 'img')
      return !image || typeof image.props.src !== 'string'
    }
    return itemsFromNode({ children: [figureProps.node] }).length === 0
  })
}

function itemsFromNode(node: unknown): MarkdownGalleryItem[] {
  if (!node || typeof node !== 'object') return []
  const children = Array.isArray((node as { children?: unknown[] }).children)
    ? (node as { children: unknown[] }).children
    : []
  return children.flatMap((figure) => {
    if (!figure || typeof figure !== 'object' || (figure as { tagName?: string }).tagName !== 'figure')
      return []
    const figureChildren = Array.isArray((figure as { children?: unknown[] }).children)
      ? (figure as { children: unknown[] }).children
      : []
    const image = figureChildren.find(
      (child) => child && typeof child === 'object' && (child as { tagName?: string }).tagName === 'img'
    ) as { properties?: Record<string, unknown> } | undefined
    if (!image?.properties || typeof image.properties.src !== 'string') return []
    const captionNode = figureChildren.find(
      (child) =>
        child && typeof child === 'object' && (child as { tagName?: string }).tagName === 'figcaption'
    )
    return [
      {
        src: image.properties.src,
        alt: typeof image.properties.alt === 'string' ? image.properties.alt : '',
        caption: captionNode ? reactText(captionNode) : undefined,
        title: typeof image.properties.title === 'string' ? image.properties.title : undefined,
        srcSet: typeof image.properties.srcSet === 'string' ? image.properties.srcSet : undefined,
        sizes: typeof image.properties.sizes === 'string' ? image.properties.sizes : undefined,
        width:
          typeof image.properties.width === 'number' || typeof image.properties.width === 'string'
            ? image.properties.width
            : undefined,
        height:
          typeof image.properties.height === 'number' || typeof image.properties.height === 'string'
            ? image.properties.height
            : undefined
      }
    ]
  })
}

/** @internal Resolve one canonical item list for React, MDX, and HAST-backed rendering. */
export function resolveMarkdownGalleryItems(
  items: MarkdownGalleryItem[] | undefined,
  node: unknown,
  children: ReactNode
) {
  if (items?.length) return items
  const nodeItems = itemsFromNode(node)
  return nodeItems.length ? nodeItems : itemsFromChildren(children)
}

function galleryLabels(labels: ImageGalleryProps['labels'], props: Record<string, unknown>) {
  return {
    gallery:
      labels?.gallery ??
      (stringProp(props, 'data-cf-gallery-label', 'dataCfGalleryLabel') ||
        DEFAULT_MARKDOWN_LABELS.imageGallery),
    close:
      labels?.close ??
      (stringProp(props, 'data-cf-close-label', 'dataCfCloseLabel') ||
        DEFAULT_MARKDOWN_LABELS.closeImageGallery),
    previous:
      labels?.previous ??
      (stringProp(props, 'data-cf-previous-label', 'dataCfPreviousLabel') ||
        DEFAULT_MARKDOWN_LABELS.previousGalleryImage),
    next:
      labels?.next ??
      (stringProp(props, 'data-cf-next-label', 'dataCfNextLabel') ||
        DEFAULT_MARKDOWN_LABELS.nextGalleryImage),
    thumbnails:
      labels?.thumbnails ??
      (stringProp(props, 'data-cf-thumbnails-label', 'dataCfThumbnailsLabel') ||
        DEFAULT_MARKDOWN_LABELS.galleryThumbnails),
    image:
      labels?.image ??
      (stringProp(props, 'data-cf-image-label', 'dataCfImageLabel') || DEFAULT_MARKDOWN_LABELS.galleryImage)
  }
}

export function ImageGallery(props: ImageGalleryProps): ReactNode
/** @internal */
export function ImageGallery(props: InternalImageGalleryProps): ReactNode
export function ImageGallery({
  children,
  items,
  className,
  role = 'group',
  labels: labelOverrides,
  node,
  inner = false,
  ...props
}: InternalImageGalleryProps) {
  const inputProps = props as Record<string, unknown>
  const urlTransform = useMarkdownUrlTransform()
  const nodeItems = itemsFromNode(node)
  const resolvedItems = resolveMarkdownGalleryItems(items, node, children).map((item) => ({
    ...item,
    src: urlTransform ? urlTransform(item.src, 'src') : item.src,
    srcSet: item.srcSet && urlTransform ? transformMarkdownSrcSet(item.srcSet, urlTransform) : item.srcSet
  }))
  const serializedItems = JSON.stringify(resolvedItems)
  const preservedChildren = resolvedItems.length && nodeItems.length === 0 ? nonGalleryChildren(children) : []
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const activeItem = activeIndex === null ? undefined : resolvedItems[activeIndex]
  const previousTrigger = useRef<HTMLButtonElement | HTMLImageElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const labels = galleryLabels(labelOverrides, inputProps)

  const open = (index: number, trigger: HTMLButtonElement | HTMLImageElement) => {
    previousTrigger.current = trigger
    setActiveIndex(index)
  }

  const close = () => setActiveIndex(null)
  const trapDialogFocus = useMarkdownDialog({
    open: Boolean(activeItem),
    close,
    dialogRef,
    initialFocusRef: closeRef,
    triggerRef: previousTrigger
  })
  useEffect(() => {
    if (activeIndex !== null && !activeItem) setActiveIndex(null)
  }, [activeIndex, activeItem])
  const move = (offset: number) => {
    if (!resolvedItems.length) return
    setActiveIndex((current) =>
      current === null ? 0 : (current + offset + resolvedItems.length) % resolvedItems.length
    )
  }

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    trapDialogFocus(event)
    if (event.defaultPrevented) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      move(event.key === 'ArrowLeft' ? -1 : 1)
    }
  }

  const content = (
    <>
      {resolvedItems.length
        ? resolvedItems.map((item, index) => (
            <figure key={`${item.src}-${index}`} data-cf-slot="item">
              <button
                className="cf-gallery-trigger"
                type="button"
                data-cf-action="open-gallery"
                aria-label={`${item.alt || labels.image} ${index + 1}`}
                aria-haspopup="dialog"
                onClick={(event) => open(index, event.currentTarget)}
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  title={item.title}
                  srcSet={item.srcSet}
                  sizes={item.sizes}
                  width={item.width}
                  height={item.height}
                  loading="lazy"
                />
              </button>
              {item.caption ? <figcaption>{item.caption}</figcaption> : null}
            </figure>
          ))
        : children}
      {preservedChildren}
      {activeIndex !== null && activeItem ? (
        <MarkdownDialogPortal>
          <div
            ref={dialogRef}
            className="cf-gallery-lightbox"
            data-cf-slot="lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={labels.gallery}
            tabIndex={-1}
            onKeyDown={onDialogKeyDown}
          >
            <div
              className="cf-gallery-backdrop"
              data-cf-action="close-gallery"
              aria-hidden="true"
              onClick={close}
            />
            <div className="cf-gallery-dialog">
              <div className="cf-gallery-dialog-head">
                <span>{labels.gallery}</span>
                <button
                  ref={closeRef}
                  className="cf-icon-button"
                  type="button"
                  data-cf-action="close-gallery"
                  aria-label={labels.close}
                  title={labels.close}
                  onClick={close}
                >
                  <MarkdownIcon name="close" size={20} />
                </button>
              </div>
              <div className="cf-gallery-stage">
                {resolvedItems.length > 1 ? (
                  <button
                    className="cf-gallery-nav cf-gallery-prev"
                    type="button"
                    data-cf-action="previous-gallery-image"
                    aria-label={labels.previous}
                    title={labels.previous}
                    onClick={() => move(-1)}
                  >
                    <MarkdownIcon name="previous" size={20} />
                  </button>
                ) : null}
                <figure>
                  <img
                    src={activeItem.src}
                    alt={activeItem.alt}
                    title={activeItem.title}
                    srcSet={activeItem.srcSet}
                    sizes={activeItem.sizes}
                    width={activeItem.width}
                    height={activeItem.height}
                  />
                  <figcaption>
                    <span className="cf-gallery-caption">{activeItem.caption || activeItem.alt}</span>
                    <small
                      className="cf-gallery-count"
                      data-cf-gallery-count=""
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {activeIndex + 1} / {resolvedItems.length}
                    </small>
                  </figcaption>
                </figure>
                {resolvedItems.length > 1 ? (
                  <button
                    className="cf-gallery-nav cf-gallery-next"
                    type="button"
                    data-cf-action="next-gallery-image"
                    aria-label={labels.next}
                    title={labels.next}
                    onClick={() => move(1)}
                  >
                    <MarkdownIcon name="next" size={20} />
                  </button>
                ) : null}
              </div>
              {resolvedItems.length > 1 ? (
                <div className="cf-gallery-thumbs" role="group" aria-label={labels.thumbnails}>
                  {resolvedItems.map((item, index) => (
                    <button
                      key={`${item.src}-thumb-${index}`}
                      className={index === activeIndex ? 'is-current' : undefined}
                      type="button"
                      data-cf-action="select-gallery-image"
                      aria-current={index === activeIndex ? 'true' : undefined}
                      aria-label={`${item.alt || labels.image} ${index + 1}`}
                      onClick={() => setActiveIndex(index)}
                    >
                      <img src={item.src} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </MarkdownDialogPortal>
      ) : null}
    </>
  )
  if (inner) return content
  return (
    <div
      {...markdownDomProps(inputProps)}
      className={['cf-image-gallery', className].filter(Boolean).join(' ')}
      data-cf-component="gallery"
      data-cf-slot="root"
      data-cf-island="gallery"
      data-cf-gallery-items={serializedItems}
      data-cf-gallery-label={labels.gallery}
      data-cf-close-label={labels.close}
      data-cf-previous-label={labels.previous}
      data-cf-next-label={labels.next}
      data-cf-thumbnails-label={labels.thumbnails}
      data-cf-image-label={labels.image}
      role={role}
      aria-label={labels.gallery}
    >
      {content}
    </div>
  )
}
