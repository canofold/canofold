export const DEFAULT_BRAND_ASSET_PATHS = {
  logo: '/assets/canofold-brand/logo-light.webp',
  logoDark: '/assets/canofold-brand/logo-dark.webp',
  favicon: '/assets/canofold-brand/favicon.webp'
} as const

export const BUILT_IN_BRAND_OUTPUT_PATHS = Object.values(DEFAULT_BRAND_ASSET_PATHS).map((path) =>
  path.slice(1)
)
