import { markdownFileIconName, markdownFileKind } from '../../shared/fileKinds'

export function MarkdownFileIcon({ filename, language }: { filename: string; language?: string }) {
  const kind = markdownFileKind(filename, language)
  const icon = markdownFileIconName(filename, language)
  return (
    <span
      className="cf-code-file-icon"
      data-cf-file-icon={icon}
      data-cf-file-kind={kind}
      aria-hidden="true"
    />
  )
}
