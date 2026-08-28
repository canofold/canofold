import { enhanceDiagrams } from './shared'

export function enhance(root: ParentNode = document) {
  return enhanceDiagrams(root, 'kroki')
}
