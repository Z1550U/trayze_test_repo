import { createContext, useContext } from 'react'
import type { KeyType, SignerProvider } from '@alephium/web3'
import type { Anchor } from '../chain/anchor'

export type Mode = 'simulation' | 'alephium'

interface AnchorValue {
  anchor: Anchor
  mode: Mode
  setMode: (m: Mode) => void
  alephiumAvailable: boolean
  walletConnected: boolean
  /** The connected wallet (Alephium mode) – for payments and signing offers */
  wallet?: { signer: SignerProvider; address: string; publicKey: string; keyType: KeyType }
}

export const AnchorCtx = createContext<AnchorValue | null>(null)

/** The active anchor (simulation or Alephium) and wallet state – provided by AnchorProvider. */
export function useAnchor(): AnchorValue {
  const v = useContext(AnchorCtx)
  if (!v) throw new Error('AnchorProvider missing')
  return v
}
