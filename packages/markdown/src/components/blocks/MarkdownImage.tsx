import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode
} from 'react'
import { DEFAULT_MARKDOWN_LABELS } from '../../compiler/defaultLabels'
import { MarkdownIcon } from '../shared/MarkdownIcon'
import {
  elementTag,
  markdownDomProps,
  mergeMarkdownClasses,
  reactText,
  stringProp
} from '../shared/reactText'
import { serializeMarkdownNode } from '../../protocol/serializedNode'
import type { MarkdownReactElement } from '../shared/reactText'
import { getMarkdownCaptionSlot, useMarkdownSlots } from '../../react/slots'
import { MarkdownDialogPortal, useMarkdownDialog } from '../shared/MarkdownDialog'
import { transformMarkdownSrcSet, useMarkdownUrlTransform } from '../../react/urlTransform'

export interface MarkdownImageProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> {
  children?: ReactNode
  src?: string
  alt?: string
  caption?: string
  title?: string
  width?: number | string
  height?: number | string
  loading?: 'eager' | 'lazy'
  srcSet?: string
  sizes?: string
  zoomLabel?: string
  closeLabel?: string
}

interface InternalMarkdownImageProps extends MarkdownImageProps {
  node?: unknown
  inner?: boolean
}

export function MarkdownImage(props: MarkdownImageProps): ReactNode
/** @internal */
export function MarkdownImage(props: InternalMarkdownImageProps): ReactNode
export function MarkdownImage({
  children,
  node,
  src: directSrc,
  alt: directAlt,
  caption: directCaption,
  title: directTitle,
  width: directWidth,
  height: directHeight,
  loading: directLoading,
  srcSet: directSrcSet,
  sizes: directSizes,
  zoomLabel: directZoomLabel,
  closeLabel: directCloseLabel,
  inner = false,
  ...inputProps
}: InternalMarkdownImageProps) {
  const props = inputProps as Record<string, unknown>
  const urlTransform = useMarkdownUrlTransform()
  const resolvedDirectSrc = directSrc && urlTransform ? urlTransform(directSrc, 'src') : directSrc
  const resolvedDirectSrcSet =
    directSrcSet && urlTransform ? transformMarkdownSrcSet(directSrcSet, urlTransform) : directSrcSet
  const Caption = getMarkdownCaptionSlot(useMarkdownSlots())
  const image = Children.toArray(children).find(
    (child): child is MarkdownReactElement =>
      isValidElement(child) && elementTag(child as MarkdownReactElement) === 'img'
  )
  const caption = Children.toArray(children).find((child): child is MarkdownReactElement => {
    if (!isValidElement(child)) return false
    const element = child as MarkdownReactElement
    return elementTag(element) === 'figcaption' || element.props['data-cf-slot'] === 'caption'
  })
  const zoomLabel =
    directZoomLabel ||
    stringProp(props, 'data-cf-zoom-label', 'dataCfZoomLabel') ||
    DEFAULT_MARKDOWN_LABELS.zoomImage
  const closeLabel =
    directCloseLabel ||
    stringProp(props, 'data-cf-close-label', 'dataCfCloseLabel') ||
    DEFAULT_MARKDOWN_LABELS.closeImagePreview
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeDialog = () => setOpen(false)
  const onDialogKeyDown = useMarkdownDialog({
    open,
    close: closeDialog,
    dialogRef,
    initialFocusRef: closeRef,
    triggerRef
  })
  const resolvedImage =
    image ??
    (resolvedDirectSrc ? (
      <img
        src={resolvedDirectSrc}
        alt={directAlt ?? ''}
        title={directTitle}
        width={directWidth}
        height={directHeight}
        loading={directLoading}
        srcSet={resolvedDirectSrcSet}
        sizes={directSizes}
        data-cf-element="image"
      />
    ) : null)
  const resolvedCaption =
    caption ?? (directCaption ? <figcaption data-cf-slot="caption">{directCaption}</figcaption> : null)
  const className = mergeMarkdownClasses('cf-media-frame', props.className)
  const { className: _className, ...rest } = markdownDomProps(props)
  if (!resolvedImage)
    return inner ? (
      <>{children}</>
    ) : (
      <figure {...rest} className={className} data-cf-component="image" data-cf-slot="root">
        {children}
      </figure>
    )
  const content = (
    <>
      <button
        ref={triggerRef}
        className="cf-media-zoom"
        type="button"
        data-cf-action="zoom-image"
        data-cf-slot="action"
        aria-label={zoomLabel}
        aria-haspopup="dialog"
        title={zoomLabel}
        onClick={() => setOpen(true)}
      >
        {resolvedImage}
      </button>
      {resolvedCaption ? (
        Caption ? (
          <Caption {...(resolvedCaption.props as Record<string, unknown>)} data-cf-slot="caption">
            {resolvedCaption.props.children}
          </Caption>
        ) : (
          <figcaption data-cf-slot="caption">{resolvedCaption.props.children}</figcaption>
        )
      ) : null}
      {open ? (
        <MarkdownDialogPortal>
          <div
            ref={dialogRef}
            className="cf-image-lightbox"
            data-cf-slot="lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={zoomLabel}
            tabIndex={-1}
            onKeyDown={onDialogKeyDown}
          >
            <div
              className="cf-image-lightbox-backdrop"
              data-cf-action="close-image"
              aria-hidden="true"
              onClick={closeDialog}
            />
            <div className="cf-image-lightbox-card">
              <button
                ref={closeRef}
                className="cf-icon-button cf-image-lightbox-close"
                type="button"
                data-cf-action="close-image"
                data-cf-slot="close"
                aria-label={closeLabel}
                onClick={closeDialog}
              >
                <MarkdownIcon name="close" />
              </button>
              {cloneElement(resolvedImage, { loading: 'eager' })}
              {resolvedCaption ? <p>{reactText(resolvedCaption.props.children)}</p> : null}
            </div>
          </div>
        </MarkdownDialogPortal>
      ) : null}
    </>
  )
  if (inner) return content
  return (
    <figure
      {...rest}
      className={className}
      data-cf-component="image"
      data-cf-slot="root"
      data-cf-island="image"
      data-cf-zoom-label={zoomLabel}
      data-cf-close-label={closeLabel}
      data-cf-island-data={serializeMarkdownNode(node)}
    >
      {content}
    </figure>
  )
}
