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
  const source = directSource ?? (stringProp(props, 'data-cf-source', 'dataCfSource') || codeSource(children))
  const language = directLanguage ?? (stringProp(props, 'data-cf-language', 'dataCfLanguage') || 'text')
  const filename = directFilename ?? (stringProp(props, 'data-cf-filename', 'dataCfFilename') || undefined)
  const copyLabel =
    directCopyLabel ??
    (stringProp(props, 'data-cf-copy-label', 'dataCfCopyLabel') || DEFAULT_MARKDOWN_LABELS.copyCode)
  const copyFailureLabel =
    directCopyFailureLabel ??
    (stringProp(props, 'data-cf-copy-failure-label', 'dataCfCopyFailureLabel') ||
      DEFAULT_MARKDOWN_LABELS.copyFailed)
  const className = mergeMarkdownClasses('cf-code', props.className)
  const { className: _className, ...rest } = markdownDomProps(props)

  return (
    <figure {...rest} className={className} data-cf-component="code-block" data-cf-slot="root">
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
    <span className="cf-code-file" data-cf-slot="title" data-cf-language={language}>
      <MarkdownFileIcon filename={filename} language={language} />
      <span className="cf-code-file-name">{filename}</span>
    </span>
  ) : (
    <span className="cf-code-lang" data-cf-slot="title">
      {language}
    </span>
  )
  const content = (
    <>
      {title}
      <div className="cf-block-actions" data-cf-slot="actions">
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
      className="cf-code-bar"
      data-cf-slot="toolbar"
      data-cf-behavior="code-toolbar"
      data-cf-language={language}
      data-cf-filename={filename}
      data-cf-copy-label={copyLabel}
      data-cf-copy-failure-label={copyFailureLabel}
    >
      {content}
    </div>
  )
}
