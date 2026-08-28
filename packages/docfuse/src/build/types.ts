export const BUILD_MANIFEST_SCHEMA_VERSION = 3

export interface PageBuildState {
  fingerprint: string
  outputPath: string
  markdownOutputPath: string
  assetOutputPaths: string[]
}

export interface OutputFileState {
  fingerprint: string
  size: number
}

export interface BuildManifest {
  schemaVersion: typeof BUILD_MANIFEST_SCHEMA_VERSION
  docfuseVersion: string
  buildFingerprint: string
  sharedFingerprint: string
  pages: Record<string, PageBuildState>
  outputs: Record<string, OutputFileState>
}

export type BuildMode = 'clean' | 'incremental' | 'cached'

export interface BuildPlan {
  mode: BuildMode
  changedPageKeys: string[]
  removedPageKeys: string[]
  reason: string
}
