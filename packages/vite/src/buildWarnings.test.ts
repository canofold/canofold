import { describe, expect, it, vi } from 'vitest'
import { onDemoBuildWarning } from './buildWarnings'

type BuildWarning = Parameters<typeof onDemoBuildWarning>[0]

describe('onDemoBuildWarning', () => {
  it('suppresses only lucide-react use-client directives in the browser bundle', () => {
    const defaultHandler = vi.fn()

    onDemoBuildWarning(
      {
        code: 'MODULE_LEVEL_DIRECTIVE',
        id: '/node_modules/lucide-react/dist/esm/Icon.mjs',
        message: 'The semantics of the module level directive "use client" may not be preserved.'
      } as BuildWarning,
      defaultHandler
    )

    expect(defaultHandler).not.toHaveBeenCalled()
  })

  it('forwards unrelated build warnings unchanged', () => {
    const defaultHandler = vi.fn()
    const warning = {
      code: 'MODULE_LEVEL_DIRECTIVE',
      id: '/node_modules/another-package/index.js',
      message: 'The semantics of the module level directive "use client" may not be preserved.'
    } as BuildWarning

    onDemoBuildWarning(warning, defaultHandler)

    expect(defaultHandler).toHaveBeenCalledWith(warning)
  })

  it('forwards other directives from lucide-react unchanged', () => {
    const defaultHandler = vi.fn()
    const warning = {
      code: 'MODULE_LEVEL_DIRECTIVE',
      id: '/node_modules/lucide-react/dist/esm/server.mjs',
      message: 'The semantics of the module level directive "use server" may not be preserved.'
    } as BuildWarning

    onDemoBuildWarning(warning, defaultHandler)

    expect(defaultHandler).toHaveBeenCalledWith(warning)
  })
})
