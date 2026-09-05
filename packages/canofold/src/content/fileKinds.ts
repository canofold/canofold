const markdownExtensionPattern = /\.(?:md|mdx)$/i

export function isMarkdownPath(path: string) {
  return markdownExtensionPattern.test(path)
}

export function isMdxPath(path: string) {
  return /\.mdx$/i.test(path)
}

export function isMarkdownIndexName(name: string) {
  return /^index\.(?:md|mdx)$/i.test(name)
}

export function stripMarkdownExtension(path: string) {
  return path.replace(markdownExtensionPattern, '')
}
