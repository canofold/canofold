import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { DEFAULT_MARKDOWN_LABELS } from '../../compiler/defaultLabels'
import { copyMarkdownText } from '../../shared/copyText'
import { MarkdownIcon, type MarkdownIconName } from './MarkdownIcon'
import { ACTION_FEEDBACK_DURATION_MS } from './interactionConstants'

export { copyMarkdownText } from '../../shared/copyText'

export function MarkdownCopyButton({
  value,
  label,
  action,
  className = 'df-block-button',
  icon = 'copy',
  failureLabel = DEFAULT_MARKDOWN_LABELS.copyFailed
}: {
  value: string
  label: string
  action: string
  className?: string
  icon?: MarkdownIconName
  failureLabel?: string
}) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  useEffect(() => {
    if (status === 'idle') return
    const timeout = setTimeout(() => setStatus('idle'), ACTION_FEEDBACK_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [status])

  const feedbackLabel = status === 'success' ? `${label} ✓` : status === 'error' ? failureLabel : label

  return (
    <button
      className={`${className}${status === 'success' ? ' df-action-success' : ''}${
        status === 'error' ? ' df-action-error' : ''
      }`}
      type="button"
      data-df-action={action}
      data-df-copied={status === 'success' ? 'true' : undefined}
      data-df-copy-error={status === 'error' ? 'true' : undefined}
      aria-label={feedbackLabel}
      title={feedbackLabel}
      onClick={async () => {
        try {
          setStatus((await copyMarkdownText(value)) ? 'success' : 'error')
        } catch {
          setStatus('error')
        }
      }}
    >
      <span className="df-action-icon df-action-icon-copy" aria-hidden="true">
        <MarkdownIcon name={icon} />
      </span>
      <span className="df-action-icon df-action-icon-success" aria-hidden="true">
        <Check size={16} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="df-sr-only" aria-live="polite" aria-atomic="true">
        {status === 'idle' ? '' : feedbackLabel}
      </span>
    </button>
  )
}

export function MarkdownDownloadButton({
  value,
  filename,
  label,
  action,
  className = 'df-block-button',
  contentType = 'text/plain;charset=utf-8'
}: {
  value: string
  filename: string
  label: string
  action: string
  className?: string
  contentType?: string
}) {
  const [downloadUrl, setDownloadUrl] = useState<string>()
  useEffect(() => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(new Blob([value], { type: contentType }))
    setDownloadUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [contentType, value])

  return (
    <a
      className={className}
      href={downloadUrl ?? '#'}
      download={filename}
      data-df-action={action}
      aria-disabled={downloadUrl ? undefined : 'true'}
      aria-label={label}
      title={label}
      tabIndex={downloadUrl ? undefined : -1}
      onClick={(event) => {
        if (!downloadUrl) event.preventDefault()
      }}
    >
      <MarkdownIcon name="download" />
    </a>
  )
}
