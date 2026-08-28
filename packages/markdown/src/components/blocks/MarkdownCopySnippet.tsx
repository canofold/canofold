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
  const value = directValue ?? (stringProp(props, 'data-df-value', 'dataDfValue') || reactText(children))
  const copyLabel =
    directCopyLabel ||
    stringProp(props, 'data-df-copy-label', 'dataDfCopyLabel') ||
    DEFAULT_MARKDOWN_LABELS.copySnippet
  const copyFailureLabel =
    directCopyFailureLabel ||
    stringProp(props, 'data-df-copy-failure-label', 'dataDfCopyFailureLabel') ||
    DEFAULT_MARKDOWN_LABELS.copyFailed
  const className = mergeMarkdownClasses('df-copy-snippet', directClassName)
  const { className: _className, ...rest } = markdownDomProps(props)
  const content = (
    <>
      <code data-df-slot="content">{children ?? value}</code>
      <MarkdownCopyButton
        value={value}
        label={copyLabel}
        action="copy-snippet"
        className="df-copy-snippet-button"
        failureLabel={copyFailureLabel}
      />
    </>
  )

  if (inner) return content
  return (
    <span
      {...rest}
      className={className}
      data-df-component="copy-snippet"
      data-df-slot="root"
      data-df-behavior="copy-snippet"
      data-df-value={value}
      data-df-copy-label={copyLabel}
      data-df-copy-failure-label={copyFailureLabel}
    >
      {content}
    </span>
  )
}
