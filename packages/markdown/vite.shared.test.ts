import { describe, expect, it, vi } from 'vitest'
import { externalPackageNames, onMarkdownBuildWarning } from './vite.shared'

type BuildWarning = Parameters<typeof onMarkdownBuildWarning>[0]

describe('onMarkdownBuildWarning', () => {
  it('suppresses only the known lucide-react use-client directive warning', () => {
    const defaultHandler = vi.fn()

    onMarkdownBuildWarning(
      {
        code: 'MODULE_LEVEL_DIRECTIVE',
        id: '/node_modules/lucide-react/dist/esm/Icon.mjs',
        message: 'Module level directives cause errors when bundled, "use client" was ignored.'
      } as BuildWarning,
      defaultHandler
    )

    expect(defaultHandler).not.toHaveBeenCalled()
  })

  it('forwards other warnings to Rollup unchanged', () => {
    const defaultHandler = vi.fn()
    const warning = {
      code: 'MODULE_LEVEL_DIRECTIVE',
      id: '/node_modules/another-package/index.js',
      message: 'Module level directives cause errors when bundled, "use client" was ignored.'
    } as BuildWarning

    onMarkdownBuildWarning(warning, defaultHandler)

    expect(defaultHandler).toHaveBeenCalledWith(warning)
  })
})

describe('externalPackageNames', () => {
  it('supports manifests without dependency sections and removes duplicates', () => {
    expect(externalPackageNames({})).toEqual([])
    expect(
      externalPackageNames({
        dependencies: { unified: '^11.0.0', react: '^19.0.0' },
        peerDependencies: { react: '^18.2.0 || ^19.0.0', 'react-dom': '^19.0.0' }
      })
    ).toEqual(['unified', 'react', 'react-dom'])
  })
})
