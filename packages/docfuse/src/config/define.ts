import type { DocfuseConfigInput } from './types'

/** Add contextual typing to docfuse.config.ts without changing its runtime value. */
export function defineConfig(config: DocfuseConfigInput): DocfuseConfigInput {
  return config
}
