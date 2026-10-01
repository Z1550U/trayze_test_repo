import { useMemo, useState, type ReactNode } from 'react'
import { useWallet } from '@alephium/web3-react'
import type { Anchor } from '../chain/anchor'
import { SimulationAnchor } from '../chain/simulation'
import { AlephiumAnchor } from '../chain/alephium'
import { alephiumConfigured } from '../chain/config'

import { AnchorCtx, type Mode } from './useAnchor'
const simulation = new SimulationAnchor()

function readMode(): Mode {
  try {
    const m = localStorage.getItem('trayze.mode')
    if (m === 'simulation') return 'simulation'
  } catch {
    /* ignore */
  }
  return alephiumConfigured() ? 'alephium' : 'simulation'
}

export function AnchorProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet()
  const [mode, setModeRaw] = useState<Mode>(readMode)
  const connected = wallet.connectionStatus === 'connected'

  const signer = connected ? wallet.signer : undefined
  const address = connected ? wallet.account.address : undefined

  const anchor = useMemo<Anchor>(() => {
    if (mode === 'alephium' && alephiumConfigured()) {
      return signer && address ? new AlephiumAnchor(signer, address) : new AlephiumAnchor()
    }
    return simulation
  }, [mode, signer, address])

  const setMode = (m: Mode) => {
    setModeRaw(m)
    try {
      localStorage.setItem('trayze.mode', m)
    } catch {
      /* ignore */
    }
  }

  const account = connected ? wallet.account : undefined
  const walletInfo = useMemo(
    () => (mode === 'alephium' && signer && account ? { signer, address: account.address, publicKey: account.publicKey, keyType: account.keyType } : undefined),
    [mode, signer, account]
  )

  return <AnchorCtx.Provider value={{ anchor, mode, setMode, alephiumAvailable: alephiumConfigured(), walletConnected: connected, wallet: walletInfo }}>{children}</AnchorCtx.Provider>
}
