export { canofoldVersion } from './version'
export { defineConfig } from './config/define'

export { defineSearchProvider, type SearchProvider, type SearchProviderContext } from './search'

export type { CanofoldConfigInput, CanofoldExtensionDescriptor, CanofoldJsonValue } from './config/types'
export {
  CANOFOLD_EXTENSION_API_VERSION,
  defineExtension,
  type CanofoldExtension,
  type CanofoldExtensionFactory,
  type CanofoldExtensionGenerateContext,
  type CanofoldExtensionPage,
  type CanofoldExtensionPagePatch,
  type CanofoldExtensionSourceContext
} from './extensions/types'
