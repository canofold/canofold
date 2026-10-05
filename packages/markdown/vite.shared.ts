import type { UserConfig } from 'vite'

type RolldownOptions = NonNullable<NonNullable<UserConfig['build']>['rolldownOptions']>
type WarningHandler = NonNullable<RolldownOptions['onwarn']>

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
