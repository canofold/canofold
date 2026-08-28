import type { ReactNode } from 'react'
import { MarkdownSlotsProvider } from '../react/slots'
import type { MarkdownIslandRenderOptions } from './options'

/** Keep the common Island wrapper independent from serialized HAST support. */
export function withIslandOptions(children: ReactNode, options: MarkdownIslandRenderOptions = {}) {
  return <MarkdownSlotsProvider slots={options.slots}>{children}</MarkdownSlotsProvider>
}
