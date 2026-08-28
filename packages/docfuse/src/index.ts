export { docfuseVersion } from './version'
export { defineConfig } from './config/define'

export { defineSearchProvider, type SearchProvider, type SearchProviderContext } from './search'

export type { DocfuseConfigInput, DocfuseExtensionDescriptor, DocfuseJsonValue } from './config/types'
export {
  DOCFUSE_EXTENSION_API_VERSION,
  defineExtension,
  type DocfuseExtension,
  type DocfuseExtensionFactory,
  type DocfuseExtensionGenerateContext,
  type DocfuseExtensionPage,
  type DocfuseExtensionPagePatch,
  type DocfuseExtensionSourceContext
} from './extensions/types'
