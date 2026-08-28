import { describe, expect, it, vi } from 'vitest'
import { createLinkedSiteReconciler } from './linkedSiteRunner.mjs'

const now = Date.parse('2026-07-23T00:00:10.000Z')

function state(
  packageName: 'markdown' | 'docfuse',
  generation: number,
  status: 'building' | 'ready' | 'error' = 'ready'
) {
  return {
    package: packageName,
    status,
    generation,
    sessionId: `${packageName}-session`,
    heartbeatAt: new Date(now).toISOString()
  }
}

describe('createLinkedSiteReconciler', () => {
  it('starts only when both packages are ready and restarts once for a new generation', async () => {
    let states = [state('markdown', 1, 'building'), state('docfuse', 1)]
    let nextChild = 0
    const startSite = vi.fn(async () => ({ id: ++nextChild }))
    const stopSite = vi.fn(async () => {})
    const reconciler = createLinkedSiteReconciler({
      readStates: async () => states,
      startSite,
      stopSite,
      now: () => now
    })

    await reconciler.reconcile()
    expect(startSite).not.toHaveBeenCalled()

    states = [state('markdown', 1), state('docfuse', 1)]
    await reconciler.reconcile()
    await reconciler.reconcile()
    expect(startSite).toHaveBeenCalledTimes(1)
    expect(stopSite).not.toHaveBeenCalled()

    states = [state('markdown', 2), state('docfuse', 1)]
    await reconciler.reconcile()
    expect(stopSite).toHaveBeenCalledWith({ id: 1 })
    expect(startSite).toHaveBeenCalledTimes(2)
  })

  it('stops the site when a package is building, failed, missing, or stale', async () => {
    let states = [state('markdown', 1), state('docfuse', 1)]
    const child = { id: 1 }
    const startSite = vi.fn(async () => child)
    const stopSite = vi.fn(async () => {})
    const reconciler = createLinkedSiteReconciler({
      readStates: async () => states,
      startSite,
      stopSite,
      now: () => now
    })

    await reconciler.reconcile()
    states = [state('markdown', 2, 'error'), state('docfuse', 1)]
    await reconciler.reconcile()
    expect(stopSite).toHaveBeenCalledWith(child)

    states = [
      { ...state('markdown', 3), heartbeatAt: new Date(now - 16_000).toISOString() },
      state('docfuse', 1)
    ]
    await reconciler.reconcile()
    expect(startSite).toHaveBeenCalledTimes(1)

    states = [state('markdown', 4)]
    await reconciler.reconcile()
    expect(startSite).toHaveBeenCalledTimes(1)
  })

  it('ignores ready states written by another workspace session', async () => {
    const states = [
      { ...state('markdown', 1), workspaceId: 'older-workspace' },
      { ...state('docfuse', 1), workspaceId: 'older-workspace' }
    ]
    const startSite = vi.fn(async () => ({ id: 1 }))
    const reconciler = createLinkedSiteReconciler({
      readStates: async () => states,
      startSite,
      stopSite: vi.fn(async () => {}),
      now: () => now,
      workspaceId: 'current-workspace'
    })

    await reconciler.reconcile()
    expect(startSite).not.toHaveBeenCalled()
  })

  it('retries a failed site generation after site content changes', async () => {
    const states = [state('markdown', 1), state('docfuse', 1)]
    let onUnexpectedExit: (() => void) | undefined
    let nextChild = 0
    const startSite = vi.fn(async (onExit: () => void) => {
      onUnexpectedExit = onExit
      return { id: ++nextChild }
    })
    const reconciler = createLinkedSiteReconciler({
      readStates: async () => states,
      startSite,
      stopSite: vi.fn(async () => {}),
      now: () => now
    })

    await reconciler.reconcile()
    onUnexpectedExit?.()
    await reconciler.reconcile()
    expect(startSite).toHaveBeenCalledTimes(1)

    await reconciler.retry()
    expect(startSite).toHaveBeenCalledTimes(2)
  })

  it('does not lose a content change that arrives while the site is starting', async () => {
    const states = [state('markdown', 1), state('docfuse', 1)]
    let onUnexpectedExit: (() => void) | undefined
    let releaseStart!: () => void
    const firstStart = new Promise<{ id: number }>((resolve) => {
      releaseStart = () => resolve({ id: 1 })
    })
    const startSite = vi
      .fn()
      .mockImplementationOnce(async (onExit: () => void) => {
        onUnexpectedExit = onExit
        return firstStart
      })
      .mockResolvedValueOnce({ id: 2 })
    const reconciler = createLinkedSiteReconciler({
      readStates: async () => states,
      startSite,
      stopSite: vi.fn(async () => {}),
      now: () => now
    })

    const initialStart = reconciler.reconcile()
    await vi.waitFor(() => expect(startSite).toHaveBeenCalledTimes(1))
    const contentChange = reconciler.retry()
    releaseStart()
    await initialStart
    onUnexpectedExit?.()
    await contentChange
    await vi.waitFor(() => expect(startSite).toHaveBeenCalledTimes(2))

    await reconciler.close()
  })
})
