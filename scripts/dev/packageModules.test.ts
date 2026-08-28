import { describe, expect, it } from 'vitest'
import { packageFunction } from './packageModules.mjs'

describe('packageFunction', () => {
  it('loads functions from both ESM and CommonJS-shaped dynamic imports', () => {
    const esmBuild = () => 'esm'
    const commonJsBuild = () => 'commonjs'

    expect(packageFunction({ build: esmBuild }, 'build')).toBe(esmBuild)
    expect(packageFunction({ default: { build: commonJsBuild } }, 'build')).toBe(commonJsBuild)
  })

  it('rejects a package module that does not expose the requested function', () => {
    expect(() => packageFunction({ default: {} }, 'build')).toThrow(
      'Package module does not export a build function'
    )
  })
})
