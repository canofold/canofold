import { type HTMLAttributes, type ReactNode } from 'react'
import { DEFAULT_MARKDOWN_LABELS } from '../../compiler/defaultLabels'
import { MarkdownCopyButton } from '../shared/MarkdownActions'
import { MarkdownFileIcon } from '../shared/MarkdownFileIcon'
import {
  elementChildren,
  elementTag,
  markdownDomProps,
  mergeMarkdownClasses,
  reactText,
  stringProp
} from '../shared/reactText'

export interface MarkdownCodeBlockProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children?: ReactNode
  language?: string
  filename?: string
  source?: string
  copyLabel?: string
  copyFailureLabel?: string
}

function codeSource(children: ReactNode) {
  const pre = elementChildren(children).find((child) => elementTag(child) === 'pre')
  return reactText(pre ? (pre.props as { children?: ReactNode }).children : children)
}

export function MarkdownCodeBlock({
  children,
  source: directSource,
  language: directLanguage,
  filename: directFilename,
  copyLabel: directCopyLabel,
  copyFailureLabel: directCopyFailureLabel,
  ...inputProps
}: MarkdownCodeBlockProps) {
  const props = inputProps as Record<string, unknown>
  const source = directSource ?? (stringProp(props, 'data-df-source', 'dataDfSource') || codeSource(children))
  const language = directLanguage ?? (stringProp(props, 'data-df-language', 'dataDfLanguage') || 'text')
  const filename = directFilename ?? (stringProp(props, 'data-df-filename', 'dataDfFilename') || undefined)
  const copyLabel =
    directCopyLabel ??
    (stringProp(props, 'data-df-copy-label', 'dataDfCopyLabel') || DEFAULT_MARKDOWN_LABELS.copyCode)
  const copyFailureLabel =
    directCopyFailureLabel ??
    (stringProp(props, 'data-df-copy-failure-label', 'dataDfCopyFailureLabel') ||
      DEFAULT_MARKDOWN_LABELS.copyFailed)
  const className = mergeMarkdownClasses('df-code', props.className)
  const { className: _className, ...rest } = markdownDomProps(props)

  return (
    <figure {...rest} className={className} data-df-component="code-block" data-df-slot="root">
      <MarkdownCodeToolbar
        source={source}
        language={language}
        filename={filename}
        copyLabel={copyLabel}
        copyFailureLabel={copyFailureLabel}
      />
      {children}
    </figure>
  )
}

/** @internal */
function MarkdownCodeToolbar({
  source,
  language,
  filename,
  copyLabel = DEFAULT_MARKDOWN_LABELS.copyCode,
  copyFailureLabel = DEFAULT_MARKDOWN_LABELS.copyFailed
}: {
  source: string
  language: string
  filename?: string
  copyLabel?: string
  copyFailureLabel?: string
}) {
  const title = filename ? (
    <span className="df-code-file" data-df-slot="title" data-df-language={language}>
      <MarkdownFileIcon filename={filename} language={language} />
      <span className="df-code-file-name">{filename}</span>
    </span>
  ) : (
    <span className="df-code-lang" data-df-slot="title">
      {language}
    </span>
  )
  const content = (
    <>
      {title}
      <div className="df-block-actions" data-df-slot="actions">
        <MarkdownCopyButton
          value={source}
          label={copyLabel}
          failureLabel={copyFailureLabel}
          action="copy-code"
        />
      </div>
    </>
  )
  return (
    <div
      className="df-code-bar"
      data-df-slot="toolbar"
      data-df-behavior="code-toolbar"
      data-df-language={language}
      data-df-filename={filename}
      data-df-copy-label={copyLabel}
      data-df-copy-failure-label={copyFailureLabel}
    >
      {content}
    </div>
  )
}
