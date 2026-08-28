import type { MarkdownBehaviorName } from './compiler/assets'
import type { Root } from 'react-dom/client'
import type { MarkdownIslandRenderOptions } from './islands/options'

interface IslandModule {
  hydrate(root: HTMLElement, options?: MarkdownIslandRenderOptions): Root | undefined
}

/** Behaviors that require an on-demand React island rather than native DOM enhancement. */
export const RICH_MARKDOWN_BEHAVIOR_NAMES = [
  'gallery',
  'image',
  'table'
] as const satisfies readonly MarkdownBehaviorName[]

type RichBehaviorName = (typeof RICH_MARKDOWN_BEHAVIOR_NAMES)[number]

const selectors: Record<RichBehaviorName, string> = {
  gallery: '[data-df-island="gallery"]',
  image: '[data-df-island="image"]',
  table: '[data-df-island="table"]'
}

const loaders: Record<RichBehaviorName, () => Promise<IslandModule>> = {
  gallery: () => import('./islands/gallery'),
  image: () => import('./islands/image'),
  table: () => import('./islands/table')
}

const hydratedRoots = new WeakMap<HTMLElement, Root>()
const pendingRoots = new WeakSet<HTMLElement>()
const cancelledRoots = new WeakSet<HTMLElement>()

function knownRichNames(names: readonly MarkdownBehaviorName[]): RichBehaviorName[] {
  return [...new Set(names)].filter((name): name is RichBehaviorName => Object.hasOwn(loaders, name))
}

function matchingElements(root: ParentNode, selector: string) {
  const own = root instanceof HTMLElement && root.matches(selector) ? [root] : []
  return [...own, ...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => !element.closest('[data-df-runtime="react"]')
  )
}

/**
 * Hydrate only the interaction types requested by the host.
 *
 * Importing this module has no browser side effects. Static hosts own startup
 * timing and pass the resource facts returned by the server renderer.
 */
export async function enhanceRichMarkdown(
  root: ParentNode = document,
  names: readonly MarkdownBehaviorName[] = Object.keys(loaders) as RichBehaviorName[],
  renderOptions: MarkdownIslandRenderOptions = {}
) {
  const uniqueNames = knownRichNames(names)
  await Promise.all(
    uniqueNames.map(async (name) => {
      const elements = matchingElements(root, selectors[name]).filter(
        (element) => !hydratedRoots.has(element) && !pendingRoots.has(element)
      )
      if (!elements.length) return
      elements.forEach((element) => {
        cancelledRoots.delete(element)
        pendingRoots.add(element)
      })
      try {
        const island = await loaders[name]()
        for (const element of elements) {
          if (cancelledRoots.has(element) || hydratedRoots.has(element)) continue
          const reactRoot = island.hydrate(element, renderOptions)
          if (reactRoot) hydratedRoots.set(element, reactRoot)
        }
      } finally {
        elements.forEach((element) => {
          pendingRoots.delete(element)
          cancelledRoots.delete(element)
        })
      }
    })
  )
}

/** Unmount hydrated interactions below a navigation or preview boundary. */
export function disposeRichMarkdown(
  root: ParentNode = document,
  names: readonly MarkdownBehaviorName[] = Object.keys(loaders) as RichBehaviorName[]
) {
  for (const name of knownRichNames(names)) {
    for (const element of matchingElements(root, selectors[name])) {
      if (pendingRoots.has(element)) cancelledRoots.add(element)
      const reactRoot = hydratedRoots.get(element)
      if (!reactRoot) continue
      reactRoot.unmount()
      hydratedRoots.delete(element)
    }
  }
}
