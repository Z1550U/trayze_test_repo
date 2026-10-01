import { useCallback, useEffect, useState } from 'react'
import type { Reconciliation } from '../core/reconcile'
import { useAnchor } from './useAnchor'
import { checkSync, restoreFromChain, type RestoreResult } from './sync'

export type SyncState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'checked'; rec: Reconciliation }
  | { kind: 'restoring'; rec: Reconciliation }
  | { kind: 'restored'; rec: Reconciliation; result: RestoreResult }
  | { kind: 'error'; message: string }

const message = (e: unknown) => {
  const t = e instanceof Error ? e.message : String(e)
  return /reject|denied|cancel/i.test(t) ? 'The signature was declined in the wallet.' : t
}

/**
 * Checks browser vs. chain whenever a wallet connects (or the network changes).
 * The result is stored together with the wallet/scope it belongs to, so switching wallets
 * shows "checking" until the new result is in – derived, not reset in an effect.
 */
export function useSync() {
  const { anchor, mode, walletConnected } = useAnchor()
  const owner = anchor.owner()
  const key = owner && (mode === 'simulation' || walletConnected) ? `${anchor.scope}:${owner}` : ''
  const [stored, setStored] = useState<{ key: string; state: SyncState }>()

  const run = useCallback(
    async (k: string) => {
      let next: SyncState
      try {
        next = { kind: 'checked', rec: await checkSync(anchor) }
      } catch (e) {
        next = { kind: 'error', message: message(e) }
      }
      setStored({ key: k, state: next })
    },
    [anchor]
  )

  // Check once per wallet/scope. The state is only set when the answer arrives.
  useEffect(() => {
    if (!key) return
    let live = true
    checkSync(anchor)
      .then(
        (rec): SyncState => ({ kind: 'checked', rec }),
        (e): SyncState => ({ kind: 'error', message: message(e) })
      )
      .then((state) => live && setStored({ key, state }))
    return () => {
      live = false
    }
  }, [key, anchor])

  const state: SyncState = !key ? { kind: 'idle' } : stored?.key === key ? stored.state : { kind: 'checking' }

  const check = () => {
    if (!key) return
    setStored({ key, state: { kind: 'checking' } })
    void run(key)
  }

  const restore = async () => {
    if (state.kind !== 'checked') return
    const rec = state.rec
    setStored({ key, state: { kind: 'restoring', rec } })
    try {
      const result = await restoreFromChain(anchor, rec)
      setStored({ key, state: { kind: 'restored', rec: await checkSync(anchor), result } })
    } catch (e) {
      // Cancelling the unlock dialog is not an error – offer the restore again.
      if (/cancelled/i.test(message(e))) setStored({ key, state: { kind: 'checked', rec } })
      else setStored({ key, state: { kind: 'error', message: message(e) } })
    }
  }

  return { state, check, restore, active: !!key }
}
