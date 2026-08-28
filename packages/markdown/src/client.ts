import { MARKDOWN_BEHAVIOR_NAMES, type MarkdownAssets, type MarkdownBehaviorName } from './compiler/assets'
import { enhanceNativeMarkdown } from './client/nativeBehaviors'
import { enhanceRichMarkdown, disposeRichMarkdown } from './islands'

interface RootEnhancementState {
  behaviorOwners: Map<MarkdownBehaviorName, number>
}

const rootEnhancements = new WeakMap<ParentNode, RootEnhancementState>()

export interface MarkdownEnhancement {
  /** Resolves when all requested rich behaviors have loaded. */
  ready: Promise<void>
  /** Removes native listeners and unmounts rich behavior roots. */
  dispose(): void
}

/**
 * Enhance the semantic Markdown DOM produced by the server renderer.
 *
 * The implementation chooses native DOM behavior or a lazy rich runtime for
 * each resource fact; hosts do not need to know how an interaction is built.
 */
export function enhanceMarkdown(
  root: ParentNode = document,
  assets: Pick<MarkdownAssets, 'behaviors'> = { behaviors: [...MARKDOWN_BEHAVIOR_NAMES] }
): MarkdownEnhancement {
  const behaviors = [...new Set(assets.behaviors)].filter((name) => MARKDOWN_BEHAVIOR_NAMES.includes(name))
  const state = rootEnhancements.get(root) ?? ({ behaviorOwners: new Map() } satisfies RootEnhancementState)
  rootEnhancements.set(root, state)
  behaviors.forEach((behavior) =>
    state.behaviorOwners.set(behavior, (state.behaviorOwners.get(behavior) ?? 0) + 1)
  )
  const disposeNative = enhanceNativeMarkdown(root, behaviors)
  const ready = enhanceRichMarkdown(root, behaviors)
  let disposed = false

  return {
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      disposeNative()
      const unownedBehaviors = behaviors.filter((behavior) => {
        const owners = (state.behaviorOwners.get(behavior) ?? 1) - 1
        if (owners > 0) {
          state.behaviorOwners.set(behavior, owners)
          return false
        }
        state.behaviorOwners.delete(behavior)
        return true
      })
      disposeRichMarkdown(root, unownedBehaviors)
      if (state.behaviorOwners.size === 0) rootEnhancements.delete(root)
    }
  }
}

export type { MarkdownAssets, MarkdownBehaviorName } from './compiler/assets'
