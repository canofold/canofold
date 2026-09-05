import type { CanofoldConfigInput } from './types'

/** Add contextual typing to canofold.config.ts without changing its runtime value. */
export function defineConfig(config: CanofoldConfigInput): CanofoldConfigInput {
  return config
}
