import {
  Children,
  cloneElement,
  createElement,
  Fragment,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type DetailsHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode
} from 'react'
import { CheckCircle2, ChevronDown, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { MarkdownCodeBlock } from '../blocks/MarkdownCodeBlock'
import { MarkdownCopySnippet } from '../blocks/MarkdownCopySnippet'
import { MarkdownImage } from '../blocks/MarkdownImage'
import { MarkdownTable } from '../blocks/MarkdownTable'
import { MarkdownTerminal } from '../blocks/MarkdownTerminal'
import { elementTag, markdownDomProps, mergeMarkdownClasses } from '../shared/reactText'

type MarkdownCompositeKind =
  | 'callout'
  | 'tabs'
  | 'code-group'
  | 'steps'
  | 'code-block'
  | 'copy-snippet'
  | 'table'
  | 'image'
  | 'terminal'
  | 'details'
  | 'file-tree'
  | 'gallery'
  | 'card-grid'
  | 'api'
  | 'aside'
  | 'badge'

export interface MarkdownCompositeProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children?: ReactNode
}

export interface MarkdownDetailsProps extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'children'> {
  children?: ReactNode
}

type InternalMarkdownDetailsProps = MarkdownDetailsProps

function withComponent(props: MarkdownCompositeProps, kind: MarkdownCompositeKind, baseClass?: string) {
  const cleanProps = markdownDomProps(props)
  return {
    ...cleanProps,
    ...(baseClass ? { className: mergeMarkdownClasses(baseClass, props.className) } : {}),
    'data-cf-component': kind,
    'data-cf-slot': 'root'
  }
}

export function MarkdownCallout({ children, ...props }: MarkdownCompositeProps) {
  const callout = String(
    (props as Record<string, unknown>)['data-callout'] ??
      (props as Record<string, unknown>).dataCallout ??
      'info'
  )
  const Icon =
    callout === 'tip'
      ? CheckCircle2
      : callout === 'warning'
        ? TriangleAlert
        : callout === 'danger'
          ? CircleAlert
          : Info
  const content = Children.map(children, (child) => {
    if (!isValidElement(child)) return child
    const element = child as ReactElement<Record<string, unknown>>
    const isTitle = element.props['data-cf-slot'] === 'title' || element.props.dataCfSlot === 'title'
    if (!isTitle) return child
    return cloneElement(element, {
      children: (
        <>
          <Icon className="cf-callout-icon" size={17} strokeWidth={2} aria-hidden="true" />
          {element.props.children as ReactNode}
        </>
      )
    })
  })
  return createElement('div', withComponent(props, 'callout', 'cf-callout'), content)
}

export function MarkdownSteps({ children, ...props }: MarkdownCompositeProps) {
  return createElement('ol', withComponent(props, 'steps', 'cf-steps'), children)
}

function splitDetailsChildren(children: ReactNode) {
  const nodes = Children.toArray(children)
  const summaryIndex = nodes.findIndex(
    (child) =>
      isValidElement(child) && elementTag(child as ReactElement<Record<string, unknown>>) === 'summary'
  )
  if (summaryIndex < 0) return { summary: undefined, content: nodes }
  return {
    summary: nodes[summaryIndex],
    content: nodes.filter(
      (child, index) => index !== summaryIndex && !(typeof child === 'string' && child.trim().length === 0)
    )
  }
}

/**
 * Keeps native <details> semantics for static output, then upgrades its content
 * area to a deterministic React disclosure transition after hydration.
 */
export function MarkdownDetails(props: MarkdownDetailsProps): ReactNode
/** @internal */
export function MarkdownDetails(props: InternalMarkdownDetailsProps): ReactNode
export function MarkdownDetails({ children, onToggle, ...props }: InternalMarkdownDetailsProps) {
  const initialOpen = props.open === true
  const [open, setOpen] = useState(initialOpen)
  const [enhanced, setEnhanced] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const { summary, content } = splitDetailsChildren(children)
  const enhancedSummary = isValidElement(summary)
    ? (() => {
        const summaryElement = summary as ReactElement<{
          children?: ReactNode
          onClick?: (event: React.MouseEvent<HTMLElement>) => void
        }>
        const onClick = summaryElement.props.onClick
        return cloneElement(summaryElement, {
          children: (
            <>
              {summaryElement.props.children as ReactNode}
              <ChevronDown className="cf-details-chevron" size={17} strokeWidth={2} aria-hidden="true" />
            </>
          ),
          onClick: (event: React.MouseEvent<HTMLElement>) => {
            onClick?.(event)
            if (event.defaultPrevented) return
            const details = event.currentTarget.closest('details')
            queueMicrotask(() => setOpen(details?.open ?? false))
          }
        })
      })()
    : summary

  useEffect(() => {
    setEnhanced(true)
  }, [])

  const detailsContent = (
    <>
      {enhancedSummary}
      <div
        ref={contentRef}
        className="cf-details-content"
        data-cf-slot="content"
        inert={enhanced && !open ? true : undefined}
      >
        <div className="cf-details-content-inner">
          {content.map((child, index) => (
            <Fragment key={isValidElement(child) && child.key !== null ? child.key : `details-${index}`}>
              {child}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <details
      {...withComponent(props as MarkdownCompositeProps, 'details')}
      data-cf-behavior="details"
      data-cf-enhanced={enhanced ? 'true' : undefined}
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
        onToggle?.(event)
      }}
    >
      {detailsContent}
    </details>
  )
}

function slotChildren(children: ReactNode, slot: string) {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child
    return cloneElement(child as ReactElement<Record<string, unknown>>, { 'data-cf-slot': slot })
  })
}

/** Structural React wrappers for trusted/document extension blocks. */
export { ImageGallery as MarkdownGallery } from '../gallery/ImageGallery'
export { MarkdownTabs } from './MarkdownTabs'
export { MarkdownFileTree } from './MarkdownFileTree'

export function MarkdownCardGrid({ children, ...props }: MarkdownCompositeProps) {
  return <div {...withComponent(props, 'card-grid', 'cf-card-grid')}>{slotChildren(children, 'card')}</div>
}

export function MarkdownApiBlock({ children, ...props }: MarkdownCompositeProps) {
  return (
    <section {...withComponent(props, 'api', 'cf-api-block')}>{slotChildren(children, 'section')}</section>
  )
}

export function MarkdownAside({ children, ...props }: MarkdownCompositeProps) {
  return <aside {...withComponent(props, 'aside', 'cf-aside')}>{children}</aside>
}

export function MarkdownBadge({ children, ...props }: MarkdownCompositeProps) {
  const componentProps = withComponent(props, 'badge', 'cf-badge')
  return (
    <span {...componentProps} data-cf-slot="label">
      {children}
    </span>
  )
}

export { MarkdownCodeBlock, MarkdownCopySnippet, MarkdownImage, MarkdownTable, MarkdownTerminal }
