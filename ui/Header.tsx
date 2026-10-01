import { useState } from 'react'
import { setSystemNotices, systemNoticesEnabled } from './noticeStore'
import { AlephiumConnectButton } from '@alephium/web3-react'
import { useAnchor } from './useAnchor'
import { IconInfo, IconWallet } from './icons'
import { Logo } from './Logo'
import { SyncChip, SyncPanel } from './SyncStatus'
import { useSync } from './useSync'
import { shortAddress } from '../core/format'

export function Header({ onHome }: { onHome: () => void }) {
  const { anchor, mode, setMode, alephiumAvailable } = useAnchor()
  const [open, setOpen] = useState(false)
  const [system, setSystem] = useState(systemNoticesEnabled)
  const canNotify = typeof Notification !== 'undefined'
  const sync = useSync()

  return (
    <header className="header">
      <button className="brand" onClick={onHome} aria-label="Go to overview">
        <Logo height={24} />
      </button>
      <div className="header-right">
        <SyncChip state={sync.state} restore={() => void sync.restore()} />
        <button className="badge" onClick={() => {
            // Opening the panel re-checks, so the backup status reflects what was just anchored
            if (!open) sync.check()
            setOpen(!open)
          }} aria-expanded={open} style={{ cursor: 'pointer' }}>
          <span className="dot pulse" style={{ background: mode === 'simulation' ? 'var(--taupe)' : 'var(--sage)' }} />
          <span className="long">{anchor.label}</span>
          <IconInfo size={16} />
        </button>
        {mode === 'alephium' && (
          <AlephiumConnectButton.Custom>
            {({ isConnected, show, disconnect, account }) =>
              isConnected && account ? (
                <button className="pill pill-glass pill-small" onClick={() => disconnect()} title="Disconnect wallet">
                  <span className="dot" style={{ background: 'var(--sage)' }} />
                  <span className="mono" style={{ fontSize: 13 }}>
                    {shortAddress(account.address)}
                  </span>
                </button>
              ) : (
                <button className="pill pill-black pill-small" onClick={show}>
                  <IconWallet size={18} />
                  <span className="long">Connect wallet</span>
                </button>
              )
            }
          </AlephiumConnectButton.Custom>
        )}
      </div>
      {open && (
        <div
          className="glass glass-strong fade-in"
          role="dialog"
          aria-label="Network"
          style={{ position: 'absolute', right: 0, top: 72, zIndex: 30, background: 'rgba(250, 251, 250, 0.94)', width: 'min(380px, calc(100vw - 32px))', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <p className="eyebrow" style={{ margin: 0 }}>
            Anchoring
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="chip" aria-pressed={mode === 'simulation'} onClick={() => setMode('simulation')}>
              Simulation
            </button>
            <button className="chip" aria-pressed={mode === 'alephium'} onClick={() => setMode('alephium')} disabled={!alephiumAvailable} style={{ opacity: alephiumAvailable ? 1 : 0.45 }}>
              Alephium
            </button>
          </div>
          <p className="muted small" style={{ margin: 0, lineHeight: 1.55 }}>
            {mode === 'simulation'
              ? 'The simulation behaves like the real registry but only stores in this browser. Ideal for trying things out – no wallet, no fees.'
              : 'Entries are anchored as events of the ProofRegistry contract on Alephium. Only fingerprints go on-chain, never content.'}
          </p>
          {!alephiumAvailable && (
            <p className="muted small" style={{ margin: 0, lineHeight: 1.55 }}>
              Alephium becomes available once the contract is deployed and <span className="mono">VITE_TRAYZE_REGISTRY</span> is set (see README).
            </p>
          )}
          {mode === 'simulation' && anchor.owner() && (
            <div className="row" style={{ borderBottom: 0, padding: 0 }}>
              <span>Simulated address</span>
              <span className="mono">{shortAddress(anchor.owner()!)}</span>
            </div>
          )}
          <SyncPanel state={sync.state} check={() => void sync.check()} restore={() => void sync.restore()} />
          {canNotify && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 15 }}>System notifications</span>
                <span className="muted small" style={{ lineHeight: 1.45 }}>
                  {typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'Blocked in your browser settings.' : 'When a co-signer responds while trayze is in the background.'}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={system}
                aria-label="System notifications"
                className="switch"
                onClick={() => void setSystemNotices(!system).then(setSystem)}
                disabled={typeof Notification !== 'undefined' && Notification.permission === 'denied'}
              />
            </div>
          )}
        </div>
      )}
    </header>
  )
}
