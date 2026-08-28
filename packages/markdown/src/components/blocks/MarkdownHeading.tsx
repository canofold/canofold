import { useEffect, useState, type ElementType, type HTMLAttributes, type ReactNode } from 'react'
import { DEFAULT_MARKDOWN_LABELS } from '../../compiler/defaultLabels'
import { copyMarkdownText } from '../shared/MarkdownActions'
import { MarkdownIcon } from '../shared/MarkdownIcon'
import { ACTION_FEEDBACK_DURATION_MS } from '../shared/interactionConstants'

function MarkdownHeadingAnchor({
  anchor,
  anchorLabel,
  copyFailureLabel = DEFAULT_MARKDOWN_LABELS.copyFailed
}: {
  anchor: string
  anchorLabel?: string
  copyFailureLabel?: string
}) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  useEffect(() => {
    if (status === 'idle') return
    const timeout = setTimeout(() => setStatus('idle'), ACTION_FEEDBACK_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [status])

  const copy = async () => {
    const value =
      typeof window === 'undefined'
        ? anchor
        : `${window.location.origin}${window.location.pathname}${window.location.search}${anchor}`
    try {
      setStatus((await copyMarkdownText(value)) ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }
  const label = anchorLabel || DEFAULT_MARKDOWN_LABELS.copySectionLink
  const feedbackLabel = status === 'success' ? `${label} ✓` : status === 'error' ? copyFailureLabel : label
  return (
    <button
      className={`df-anchor${status === 'success' ? ' df-action-success' : ''}${
        status === 'error' ? ' df-action-error' : ''
      }`}
      type="button"
      data-anchor={anchor}
      data-df-action="copy-section-link"
      data-df-anchor-label={label}
      data-df-copy-error={status === 'error' ? 'true' : undefined}
      aria-label={feedbackLabel}
      title={feedbackLabel}
      onClick={copy}
    >
      <MarkdownIcon name="link" />
      <span className="df-sr-only" aria-live="polite" aria-atomic="true">
        {status === 'idle' ? '' : feedbackLabel}
      </span>
    </button>
  )
}

interface MarkdownHeadingProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'children' | 'id'> {
  level: 1 | 2 | 3 | 4 | 5 | 6
  as?: ElementType
  id?: string
  anchor?: string
  anchorLabel?: string
  copyFailureLabel?: string
  'data-df-element'?: string
  children?: ReactNode
}

export function MarkdownHeading({
  level,
  as,
  id,
  anchor,
  anchorLabel,
  copyFailureLabel,
  children,
  className,
  ...props
}: MarkdownHeadingProps) {
  const Heading: ElementType = as ?? `h${level}`
  const headingClasses = className?.split(/\s+/).filter(Boolean) ?? []
  const isVisuallyHidden = headingClasses.some((name) => name === 'sr-only' || name === 'df-sr-only')
  const showsAnchor = level > 1 && Boolean(anchor) && !isVisuallyHidden
  if (isVisuallyHidden && !headingClasses.includes('df-sr-only')) headingClasses.push('df-sr-only')
  if (showsAnchor) headingClasses.push('df-heading-with-anchor')
  const headingClass = headingClasses.join(' ')
  return (
    <Heading {...props} id={id} className={headingClass || undefined}>
      {children}
      {showsAnchor && anchor ? (
        <span
          className="df-anchor-island"
          data-df-behavior="heading"
          data-df-anchor={anchor}
          data-df-anchor-label={anchorLabel || DEFAULT_MARKDOWN_LABELS.copySectionLink}
          data-df-copy-failure-label={copyFailureLabel || DEFAULT_MARKDOWN_LABELS.copyFailed}
        >
          <MarkdownHeadingAnchor
            anchor={anchor}
            anchorLabel={anchorLabel}
            copyFailureLabel={copyFailureLabel}
          />
        </span>
      ) : null}
    </Heading>
  )
}
