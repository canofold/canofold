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
          <span className="df-terminal-prompt">{`${prompt[1]}${prompt[2]}`}</span>
          {prompt[3] || ' '}
          {line.slice(prompt[0].length)}
        </>
      ) : status ? (
        <>
          <span className="df-terminal-status">{`${status[1]}${status[2]}`}</span>
          {status[3] || ' '}
          {line.slice(status[0].length)}
        </>
      ) : (
        <span className="df-terminal-output">{line}</span>
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
    directTitle || stringProp(props, 'data-df-title', 'dataDfTitle') || DEFAULT_MARKDOWN_LABELS.terminalTitle
  const source = directSource ?? stringProp(props, 'data-df-source', 'dataDfSource')
  const copyLabel =
    directCopyLabel ||
    stringProp(props, 'data-df-copy-label', 'dataDfCopyLabel') ||
    DEFAULT_MARKDOWN_LABELS.copyTerminal
  const copyFailureLabel =
    directCopyFailureLabel ||
    stringProp(props, 'data-df-copy-failure-label', 'dataDfCopyFailureLabel') ||
    DEFAULT_MARKDOWN_LABELS.copyFailed
  const className = mergeMarkdownClasses('df-terminal', props.className)
  const { className: _className, ...rest } = markdownDomProps(props)
  return (
    <div {...rest} className={className} data-df-component="terminal" data-df-slot="root">
      <MarkdownTerminalToolbar
        title={title}
        source={source}
        copyLabel={copyLabel}
        copyFailureLabel={copyFailureLabel}
      />
      <pre data-df-slot="content">{terminalLines(source)}</pre>
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
        className="df-copy-snippet-button"
        failureLabel={copyFailureLabel}
      />
    </>
  )
  if (inner) return content
  return (
    <div
      className="df-terminal-head"
      data-df-slot="toolbar"
      data-df-behavior="terminal-toolbar"
      data-df-title={title}
      data-df-copy-label={copyLabel}
      data-df-copy-failure-label={copyFailureLabel}
    >
      {content}
    </div>
  )
}
