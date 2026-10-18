import type { CanofoldConfig, CanofoldVersionItem } from './types'

/** Unversioned sites still need a content scope, without opting into the version control. */
export function documentationVersions(config: CanofoldConfig): CanofoldVersionItem[] {
  return config.versions.length
    ? config.versions
    : [{ id: 'current', label: 'Current', docsDir: config.docsDir, base: '/' }]
}
