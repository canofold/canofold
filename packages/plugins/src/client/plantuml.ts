import { enhanceDiagrams, renderWithClientRenderer, type DiagramClientOptions } from './shared'

export type {
  DiagramClientOptions,
  DiagramRenderer,
  DiagramRenderRequest,
  DiagramRenderResult
} from './shared'

export function enhance(root: ParentNode = document, options: DiagramClientOptions = {}) {
  return enhanceDiagrams(
    root,
    'plantuml',
    options.renderer ? renderWithClientRenderer('plantuml', options.renderer) : undefined
  )
}
