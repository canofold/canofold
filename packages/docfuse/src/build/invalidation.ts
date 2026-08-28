import type { BuildManifest, BuildPlan } from './types'

export function planBuild({
  current,
  previous,
  outputExists,
  outputValid = outputExists,
  forceClean = false
}: {
  current: BuildManifest
  previous?: BuildManifest
  outputExists: boolean
  outputValid?: boolean
  forceClean?: boolean
}): BuildPlan {
  if (forceClean) {
    return {
      mode: 'clean',
      changedPageKeys: Object.keys(current.pages),
      removedPageKeys: [],
      reason: 'forced'
    }
  }
  if (!previous) {
    return {
      mode: 'clean',
      changedPageKeys: Object.keys(current.pages),
      removedPageKeys: [],
      reason: 'missing-manifest'
    }
  }
  if (!outputExists) {
    return {
      mode: 'clean',
      changedPageKeys: Object.keys(current.pages),
      removedPageKeys: Object.keys(previous.pages).filter((key) => !current.pages[key]),
      reason: 'missing-output'
    }
  }
  if (!outputValid) {
    return {
      mode: 'clean',
      changedPageKeys: Object.keys(current.pages),
      removedPageKeys: Object.keys(previous.pages).filter((key) => !current.pages[key]),
      reason: 'invalid-output'
    }
  }
  if (current.buildFingerprint === previous.buildFingerprint) {
    return { mode: 'cached', changedPageKeys: [], removedPageKeys: [], reason: 'unchanged-inputs' }
  }
  if (current.sharedFingerprint !== previous.sharedFingerprint) {
    return {
      mode: 'clean',
      changedPageKeys: Object.keys(current.pages),
      removedPageKeys: Object.keys(previous.pages).filter((key) => !current.pages[key]),
      reason: 'shared-inputs-changed'
    }
  }

  const changedPageKeys = Object.entries(current.pages)
    .filter(([key, page]) => previous.pages[key]?.fingerprint !== page.fingerprint)
    .map(([key]) => key)
  const removedPageKeys = Object.keys(previous.pages).filter((key) => !current.pages[key])

  if (changedPageKeys.length === 0 && removedPageKeys.length === 0) {
    return {
      mode: 'clean',
      changedPageKeys: Object.keys(current.pages),
      removedPageKeys: [],
      reason: 'unclassified-inputs-changed'
    }
  }

  return {
    mode: 'incremental',
    changedPageKeys,
    removedPageKeys,
    reason: 'page-inputs-changed'
  }
}
