import { useMemo, useSyncExternalStore } from 'react'
import { PaymentsClient } from '../chain/payments'
import { paymentsConfigured } from '../chain/config'
import { useAnchor } from './useAnchor'
import type { SignedOffer } from '../core/offer'

/** Payments client for the connected wallet – undefined outside Alephium mode or without contract. */
export function usePayments(): PaymentsClient | undefined {
  const { mode, wallet } = useAnchor()
  return useMemo(() => (mode === 'alephium' && paymentsConfigured() ? new PaymentsClient(wallet?.signer, wallet?.address) : undefined), [mode, wallet])
}

// ---------- offers the seller created in this browser ----------

export interface SavedOffer {
  ref: string
  payload: string
  signed: SignedOffer
  /** What it belongs to, for listing it in the right place */
  agreementId?: string
  fileHash?: string
}

const KEY = 'trayze.offers.v1'
const listeners = new Set<() => void>()
let cache: SavedOffer[] | undefined

function read(): SavedOffer[] {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedOffer[]
    } catch {
      cache = []
    }
  }
  return cache
}

export function saveOffer(o: SavedOffer) {
  cache = [o, ...read().filter((x) => x.ref !== o.ref)]
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage full or blocked – the link still works */
  }
  listeners.forEach((l) => l())
}

export function useOffers(filter: (o: SavedOffer) => boolean): SavedOffer[] {
  const all = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read
  )
  return all.filter(filter)
}

export const payLink = (payload: string) => `${location.origin}${location.pathname}#/pay/${payload}`
