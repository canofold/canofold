import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const clientReady = () => true
const serverReady = () => false

/** Static HTML must not offer a React-only action before its handlers are mounted. */
export function useInteractionReady() {
  // React distinguishes hydration from client-only mounting. CSR controls already
  // have their handlers at commit; only hydration needs the disabled first pass.
  return useSyncExternalStore(subscribe, clientReady, serverReady)
}
