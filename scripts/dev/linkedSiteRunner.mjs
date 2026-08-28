const DEFAULT_LEASE_MS = 15_000

function readyKey(states, now, leaseMs, workspaceId) {
  const byPackage = new Map(states.filter(Boolean).map((state) => [state.package, state]))
  const markdown = byPackage.get('markdown')
  const docfuse = byPackage.get('docfuse')
  if (!markdown || !docfuse) return undefined
  for (const state of [markdown, docfuse]) {
    const heartbeat = Date.parse(state.heartbeatAt)
    if (
      state.status !== 'ready' ||
      (workspaceId !== undefined && state.workspaceId !== workspaceId) ||
      !Number.isFinite(heartbeat) ||
      now - heartbeat > leaseMs
    ) {
      return undefined
    }
  }
  return `${markdown.sessionId}:${markdown.generation}|${docfuse.sessionId}:${docfuse.generation}`
}

export function createLinkedSiteReconciler({
  readStates,
  startSite,
  stopSite,
  now = Date.now,
  leaseMs = DEFAULT_LEASE_MS,
  workspaceId,
  onError = console.error
}) {
  let child
  let currentKey
  let failedKey
  let contentRevision = 0
  let closed = false
  let queue = Promise.resolve()

  const stopCurrent = async () => {
    if (!child) return
    const stopping = child
    child = undefined
    currentKey = undefined
    await stopSite(stopping)
  }

  const reconcileNow = async () => {
    if (closed) return
    const key = readyKey(await readStates(), now(), leaseMs, workspaceId)
    if (!key) {
      await stopCurrent()
      return
    }
    if ((child && currentKey === key) || (!child && failedKey === key)) return

    await stopCurrent()
    let started
    const startedAtRevision = contentRevision
    try {
      started = await startSite(() => {
        if (child !== started) return
        child = undefined
        currentKey = undefined
        failedKey = startedAtRevision === contentRevision ? key : undefined
        if (!failedKey && !closed) queue = queue.catch(onError).then(reconcileNow)
      })
      if (closed) {
        await stopSite(started)
        return
      }
      child = started
      currentKey = key
      failedKey = undefined
    } catch (error) {
      failedKey = key
      onError(error)
    }
  }

  return {
    reconcile() {
      queue = queue.catch(onError).then(reconcileNow)
      return queue
    },
    retry() {
      contentRevision += 1
      queue = queue
        .catch(onError)
        .then(() => {
          failedKey = undefined
        })
        .then(reconcileNow)
      return queue
    },
    async close() {
      closed = true
      await queue.catch(onError)
      await stopCurrent()
    }
  }
}
