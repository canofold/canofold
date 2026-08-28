import type { UserConfig } from 'vite'

type RollupOptions = NonNullable<NonNullable<UserConfig['build']>['rollupOptions']>
type WarningHandler = NonNullable<RollupOptions['onwarn']>

interface PackageManifestDependencies {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export function externalPackageNames(manifest: PackageManifestDependencies) {
  return [
    ...new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})])
  ]
}

export const onMarkdownBuildWarning: WarningHandler = (warning, defaultHandler) => {
  const isLucideUseClientDirective =
    warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
    warning.message.includes('"use client"') &&
    /[/\\]lucide-react[/\\]/.test(warning.id ?? '')

  if (!isLucideUseClientDirective) defaultHandler(warning)
}
