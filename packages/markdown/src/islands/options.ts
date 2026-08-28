import type { MarkdownClassNames, MarkdownIntrinsicComponents } from '../react/componentMap'
import type { MarkdownSlots } from '../react/slots'

export interface MarkdownIslandRenderOptions {
  classNames?: MarkdownClassNames
  /** Intrinsic elements used while rebuilding serialized island children. */
  components?: MarkdownIntrinsicComponents
  slots?: MarkdownSlots
}
