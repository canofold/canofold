import { markdownFileIconName, markdownFileKind } from '../../shared/fileKinds'

export function MarkdownFileIcon({ filename, language }: { filename: string; language?: string }) {
  const kind = markdownFileKind(filename, language)
  const icon = markdownFileIconName(filename, language)
  return (
    <span
      className="df-code-file-icon"
      data-df-file-icon={icon}
      data-df-file-kind={kind}
      aria-hidden="true"
    />
  )
}
