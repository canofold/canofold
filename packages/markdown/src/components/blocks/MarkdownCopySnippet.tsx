import type { HTMLAttributes, ReactNode } from 'react'
import { DEFAULT_MARKDOWN_LABELS } from '../../compiler/defaultLabels'
import { MarkdownCopyButton } from '../shared/MarkdownActions'
import { markdownDomProps, mergeMarkdownClasses, reactText, stringProp } from '../shared/reactText'

export interface MarkdownCopySnippetProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children?: ReactNode
  value?: string
  copyLabel?: string
  copyFailureLabel?: string
  className?: string
}

interface InternalMarkdownCopySnippetProps extends MarkdownCopySnippetProps {
  inner?: boolean
}

/** Inline copy interaction shared by React applications and static islands. */
export function MarkdownCopySnippet(props: MarkdownCopySnippetProps): ReactNode
/** @internal */
export function MarkdownCopySnippet(props: InternalMarkdownCopySnippetProps): ReactNode
export function MarkdownCopySnippet({
  children,
  value: directValue,
  copyLabel: directCopyLabel,
  copyFailureLabel: directCopyFailureLabel,
  className: directClassName,
  inner = false,
  ...props
}: InternalMarkdownCopySnippetProps) {
  const value = directValue ?? (stringProp(props, 'data-cf-value', 'dataCfValue') || reactText(children))
  const copyLabel =
    directCopyLabel ||
    stringProp(props, 'data-cf-copy-label', 'dataCfCopyLabel') ||
    DEFAULT_MARKDOWN_LABELS.copySnippet
  const copyFailureLabel =
    directCopyFailureLabel ||
    stringProp(props, 'data-cf-copy-failure-label', 'dataCfCopyFailureLabel') ||
    DEFAULT_MARKDOWN_LABELS.copyFailed
  const className = mergeMarkdownClasses('cf-copy-snippet', directClassName)
  const { className: _className, ...rest } = markdownDomProps(props)
  const content = (
    <>
      <code data-cf-slot="content">{children ?? value}</code>
      <MarkdownCopyButton
        value={value}
        label={copyLabel}
        action="copy-snippet"
        className="cf-copy-snippet-button"
        failureLabel={copyFailureLabel}
      />
    </>
  )

  if (inner) return content
  return (
    <span
      {...rest}
      className={className}
      data-cf-component="copy-snippet"
      data-cf-slot="root"
      data-cf-behavior="copy-snippet"
      data-cf-value={value}
      data-cf-copy-label={copyLabel}
      data-cf-copy-failure-label={copyFailureLabel}
    >
      {content}
    </span>
  )
}
