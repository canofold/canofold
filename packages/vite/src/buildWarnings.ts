import type { BuildOptions } from 'vite'

type BundlerOptions = NonNullable<BuildOptions['rolldownOptions']>
type WarningHandler = NonNullable<BundlerOptions['onwarn']>

/** Keep actionable build warnings while ignoring a directive that is irrelevant after browser bundling. */
export const onDemoBuildWarning: WarningHandler = (warning, defaultHandler) => {
  const isLucideUseClientDirective =
    warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
    warning.message.includes('"use client"') &&
    /[/\\]lucide-react[/\\]/.test(warning.id ?? '')

  if (!isLucideUseClientDirective) defaultHandler(warning)
}
