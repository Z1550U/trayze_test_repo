import { useEffect, useState } from 'react'
import type { SyncState } from './useSync'
import { useAnchor } from './useAnchor'
import { forgetDevice, isRemembered, readKeyring, remember, renewCode, unlock, unlockedFor, useKeyringVersion } from './keyBroker'
import { addPasskey } from './keyActions'
import { passkeysAvailable } from '../core/passkey'
import { hasCode, passkeySlots, type Keyring } from '../core/keyring'

/** Header chip – only visible when something needs attention or just happened. */
export function SyncChip({ state, restore }: { state: SyncState; restore: () => void }) {
  // The "restored" confirmation fades after a few seconds: remember which result was dismissed.
  const [dismissed, setDismissed] = useState<SyncState>()
  useEffect(() => {
    if (state.kind !== 'restored') return
    const t = setTimeout(() => setDismissed(state), 8000)
    return () => clearTimeout(t)
  }, [state])
  const fresh = state.kind === 'restored' && dismissed !== state

  if (state.kind === 'restoring') {
    return (
      <span className="badge small">
        <span className="dot pulse" style={{ background: 'var(--taupe)' }} />
        <span className="long">Restoring…</span>
      </span>
    )
  }
  if (state.kind === 'restored' && fresh) {
    const n = state.result.entries + state.result.projects
    return (
      <span className="badge small fade-in">
        <span className="dot" style={{ background: 'var(--sage)' }} />
        <span className="long">Restored {n} from chain</span>
      </span>
    )
  }
  if (state.kind === 'checked') {
    const missing = state.rec.missingEntries.length + state.rec.missingProjects.length
    if (missing > 0) {
      return (
        <button className="pill pill-black pill-small fade-in" onClick={restore} title="Your wallet signs once to unlock the encrypted backup – no transaction, no fee.">
          Restore {missing} from chain
        </button>
      )
    }
    if (state.rec.notOnChain.length > 0) {
      return (
        <span className="badge small" title="These entries are marked as anchored in this browser but were not found in the registry.">
          <span className="dot" style={{ background: 'var(--warn)' }} />
          <span className="long">{state.rec.notOnChain.length} not on chain</span>
        </span>
      )
    }
  }
  return null
}

/** Section in the network popover. */
export function SyncPanel({ state, check, restore }: { state: SyncState; check: () => void; restore: () => void }) {
  let text: string
  switch (state.kind) {
    case 'idle':
      text = 'Connect your wallet to compare this browser with your on-chain backup.'
      break
    case 'checking':
      text = 'Comparing this browser with the chain…'
      break
    case 'restoring':
      text = 'Restoring from the chain…'
      break
    case 'error':
      text = state.message
      break
    default: {
      const r = state.rec
      const missing = r.missingEntries.length + r.missingProjects.length
      const parts = [`${r.inSync} ${r.inSync === 1 ? 'entry' : 'entries'} in sync`]
      if (missing) parts.push(`${missing} on chain but not here`)
      if (r.notOnChain.length) parts.push(`${r.notOnChain.length} not found on chain`)
      if (state.kind === 'restored' && state.result.unreadable) parts.push(`${state.result.unreadable} without readable backup`)
      text = parts.join(' · ')
    }
  }
  const missing = state.kind === 'checked' ? state.rec.missingEntries.length + state.rec.missingProjects.length : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 15 }}>Encrypted backup</span>
        <span className={`small ${state.kind === 'error' ? 'error' : 'muted'}`} style={{ lineHeight: 1.45 }}>
          {text}
        </span>
      </span>
      {state.kind !== 'idle' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {missing > 0 && (
            <button className="pill pill-black pill-small" onClick={restore}>
              Restore {missing}
            </button>
          )}
          <button className="pill pill-ghost pill-small" onClick={check} disabled={state.kind === 'checking' || state.kind === 'restoring'}>
            Check again
          </button>
        </div>
      )}
      <UnlockMethods active={state.kind !== 'idle'} />
    </div>
  )
}

/** Which ways exist to unlock the backup – and adding a passkey or a new recovery code. */
function UnlockMethods({ active }: { active: boolean }) {
  const { anchor } = useAnchor()
  const version = useKeyringVersion()
  const [chainRing, setChainRing] = useState<{ key: string; ring?: Keyring }>()
  const [busy, setBusy] = useState<'passkey' | 'code'>()
  const [message, setMessage] = useState('')
  const [kept, setKept] = useState<{ key: string; value: boolean }>()
  const scopeKey = `${anchor.scope}:${anchor.owner() ?? ''}:${version}`

  useEffect(() => {
    if (!active) return
    let live = true
    readKeyring(anchor)
      .then((ring) => live && setChainRing({ key: scopeKey, ring }))
      .catch(() => live && setChainRing({ key: scopeKey }))
    void isRemembered(anchor).then((value) => live && setKept({ key: scopeKey, value }))
    return () => {
      live = false
    }
  }, [active, anchor, scopeKey])

  const ring = unlockedFor(anchor)?.ring ?? (chainRing?.key === scopeKey ? chainRing.ring : undefined)
  const onDevice = kept?.key === scopeKey && kept.value
  const passkeys = passkeySlots(ring)
  const methods = [...passkeys.map((p) => p.label), ...(hasCode(ring) ? ['Recovery code'] : [])]

  const run = async (kind: 'passkey' | 'code') => {
    setBusy(kind)
    setMessage('')
    try {
      if (kind === 'passkey') {
        const updated = await addPasskey(anchor, await unlock(anchor))
        remember(anchor, updated)
        setMessage('Passkey added.')
      } else {
        await renewCode(anchor)
        setMessage('New recovery code saved – the old one no longer works.')
      }
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e)
      setMessage(/NotAllowedError/.test(t) ? 'Cancelled, or no suitable passkey was available.' : t)
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="muted small" style={{ lineHeight: 1.45 }}>
        Titles, notes and names are stored encrypted with each entry.{' '}
        {!active ? '' : ring ? `Unlock with: ${methods.join(' · ') || '–'}.` : (passkeysAvailable() ? 'Set up on your first anchor – with a passkey and a recovery code.' : 'Set up on your first anchor – with a recovery code.')}
      </span>
      {active && ring && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {passkeysAvailable() && (
            <button className="pill pill-ghost pill-small" onClick={() => void run('passkey')} disabled={!!busy}>
              {busy === 'passkey' ? 'Waiting…' : 'Add passkey'}
            </button>
          )}
          <button className="pill pill-ghost pill-small" onClick={() => void run('code')} disabled={!!busy}>
            New recovery code
          </button>
        </div>
      )}
      {active && onDevice && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="muted small">Remembered on this device.</span>
          <button
            className="pill pill-ghost pill-small"
            onClick={() =>
              void forgetDevice(anchor).then(() => {
                setKept({ key: scopeKey, value: false })
                setMessage('Forgotten on this device – you will need your code or passkey again.')
              })
            }
          >
            Forget on this device
          </button>
        </div>
      )}
      {message && <span className="small">{message}</span>}
    </div>
  )
}
