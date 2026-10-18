import type { MarkdownClassNames, MarkdownIntrinsicComponents } from '../react/componentMap.js'
import type { MarkdownSlots } from '../react/slots.js'

export interface MarkdownIslandRenderOptions {
  classNames?: MarkdownClassNames
  /** Intrinsic elements used while rebuilding serialized island children. */
  components?: MarkdownIntrinsicComponents
  slots?: MarkdownSlots
}
