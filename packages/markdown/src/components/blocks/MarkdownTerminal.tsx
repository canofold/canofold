import type { HTMLAttributes, ReactNode } from 'react'
import { DEFAULT_MARKDOWN_LABELS } from '../../compiler/defaultLabels'
import { MarkdownCopyButton } from '../shared/MarkdownActions'
import { markdownDomProps, mergeMarkdownClasses, stringProp } from '../shared/reactText'

export interface MarkdownTerminalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
  children?: ReactNode
  title?: string
  source?: string
  copyLabel?: string
  copyFailureLabel?: string
}

interface InternalMarkdownTerminalProps extends MarkdownTerminalProps {
  node?: unknown
}

function terminalLines(source: string) {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, index, lines) => {
      const prompt = line.match(/^(\s*)([$>])(\s*)/)
      const status = prompt ? null : line.match(/^(\s*)([✓✔✕✖!→•])(\s*)/)
      const content = prompt ? (
        <>
          <span className="cf-terminal-prompt">{`${prompt[1]}${prompt[2]}`}</span>
          {prompt[3] || ' '}
          {line.slice(prompt[0].length)}
        </>
      ) : status ? (
        <>
          <span className="cf-terminal-status">{`${status[1]}${status[2]}`}</span>
          {status[3] || ' '}
          {line.slice(status[0].length)}
        </>
      ) : (
        <span className="cf-terminal-output">{line}</span>
      )
      return (
        <span key={`${index}-${line}`}>
          {content}
          {index < lines.length - 1 ? '\n' : null}
        </span>
      )
    })
}

export function MarkdownTerminal(props: MarkdownTerminalProps): ReactNode
/** @internal */
export function MarkdownTerminal(props: InternalMarkdownTerminalProps): ReactNode
export function MarkdownTerminal({
  children: _children,
  node: _node,
  title: directTitle,
  source: directSource,
  copyLabel: directCopyLabel,
  copyFailureLabel: directCopyFailureLabel,
  ...inputProps
}: InternalMarkdownTerminalProps) {
  const props = inputProps as Record<string, unknown>
  const title =
    directTitle || stringProp(props, 'data-cf-title', 'dataCfTitle') || DEFAULT_MARKDOWN_LABELS.terminalTitle
  const source = directSource ?? stringProp(props, 'data-cf-source', 'dataCfSource')
  const copyLabel =
    directCopyLabel ||
    stringProp(props, 'data-cf-copy-label', 'dataCfCopyLabel') ||
    DEFAULT_MARKDOWN_LABELS.copyTerminal
  const copyFailureLabel =
    directCopyFailureLabel ||
    stringProp(props, 'data-cf-copy-failure-label', 'dataCfCopyFailureLabel') ||
    DEFAULT_MARKDOWN_LABELS.copyFailed
  const className = mergeMarkdownClasses('cf-terminal', props.className)
  const { className: _className, ...rest } = markdownDomProps(props)
  return (
    <div {...rest} className={className} data-cf-component="terminal" data-cf-slot="root">
      <MarkdownTerminalToolbar
        title={title}
        source={source}
        copyLabel={copyLabel}
        copyFailureLabel={copyFailureLabel}
      />
      <pre data-cf-slot="content">{terminalLines(source)}</pre>
    </div>
  )
}

/** @internal */
function MarkdownTerminalToolbar({
  title,
  source,
  copyLabel = DEFAULT_MARKDOWN_LABELS.copyTerminal,
  copyFailureLabel = DEFAULT_MARKDOWN_LABELS.copyFailed,
  inner = false
}: {
  title: string
  source: string
  copyLabel?: string
  copyFailureLabel?: string
  inner?: boolean
}) {
  const content = (
    <>
      <span>{title}</span>
      <MarkdownCopyButton
        value={source}
        label={copyLabel}
        action="copy-terminal"
        className="cf-copy-snippet-button"
        failureLabel={copyFailureLabel}
      />
    </>
  )
  if (inner) return content
  return (
    <div
      className="cf-terminal-head"
      data-cf-slot="toolbar"
      data-cf-behavior="terminal-toolbar"
      data-cf-title={title}
      data-cf-copy-label={copyLabel}
      data-cf-copy-failure-label={copyFailureLabel}
    >
      {content}
    </div>
  )
}
