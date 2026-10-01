import { useEffect, useState } from 'react'
import {
  hasCode,
  newDataKey,
  newKeyring,
  newRecoveryCode,
  parseRecoveryCode,
  passkeySlots,
  setCodeSlot,
  unb64u,
  unlockWithCode,
  unlockWithPasskey,
  type Keyring
} from '../core/keyring'
import { passkeySecret, passkeysAvailable } from '../core/passkey'
import { storeKeyring, withNewPasskey } from './keyActions'
import { toUnlocked, useKeyRequest, type KeyRequest } from './keyBroker'
import { download } from './helpers'
import { IconCheck, IconClose, IconCopy, IconDownload, IconLock } from './icons'

/**
 * The dialog behind the key broker: sets up a keyring (passkey + recovery code), unlocks an
 * existing one, or issues a new recovery code. Mounted once in App.
 */
export function KeyGate() {
  const req = useKeyRequest()
  if (!req) return null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Encrypted backup">
      <section className="glass modal fade-in">
        <button className="icon-btn modal-close" onClick={() => req.reject(new Error(cancelText(req.mode)))} aria-label="Cancel">
          <IconClose size={16} />
        </button>
        {req.mode === 'setup' && <Setup req={req} />}
        {req.mode === 'unlock' && <Unlock req={req} />}
        {req.mode === 'renew-code' && <RenewCode req={req} />}
      </section>
    </div>
  )
}

const cancelText = (m: KeyRequest['mode']) =>
  m === 'unlock' ? 'Unlocking was cancelled – your private details stay locked.' : m === 'setup' ? 'Setting up the encrypted backup was cancelled.' : 'No new recovery code was created.'

const errorText = (e: unknown) => {
  const t = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  if (/NotAllowedError/.test(t)) return 'Cancelled, or no suitable passkey was available.'
  if (/reject|denied|cancel/i.test(t)) return 'The signature was declined in the wallet.'
  if (/insufficient|not enough/i.test(t)) return 'Not enough ALPH to pay the network fee.'
  return e instanceof Error ? e.message : t
}

// ---------- setup ----------

function Setup({ req }: { req: KeyRequest }) {
  const [raw] = useState(newDataKey)
  const [ring, setRing] = useState<Keyring>(newKeyring)
  const [step, setStep] = useState<'passkey' | 'code'>(() => (passkeysAvailable() ? 'passkey' : 'code'))
  const [added, setAdded] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const passkey = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await withNewPasskey(ring, raw)
      setRing(r.ring)
      setAdded(r.label)
      setStep('code')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'code') {
    return (
      <CodeStep
        title="Your recovery code"
        intro={
          added
            ? `Passkey added (${added}). The recovery code is your second way in – on any device, with or without passkey.`
            : passkeysAvailable()
              ? 'This code is how you unlock your private details on any device.'
              : 'This browser can\'t use passkeys, so this code is how you unlock your private details – here and on any other device. You can add a passkey later in a regular browser.'
        }
        offerRemember
        onSave={async (secret, keep) => {
          const final = await setCodeSlot(ring, raw, secret)
          await storeKeyring(req.anchor, final)
          req.resolve(await toUnlocked(raw, final), { keep })
        }}
      />
    )
  }

  return (
    <>
      <Head title="Protect your private details" />
      <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
        Titles, notes and names are stored encrypted with each entry, so you can restore them on any device. Choose how you'll unlock them.
      </p>
      <div className="note" style={{ flexDirection: 'column', gap: 6 }}>
        <span style={{ color: 'var(--ink)', fontSize: 15 }}>Passkey · recommended</span>
        <span className="muted small" style={{ lineHeight: 1.55 }}>
          On this device, your phone or a security key. You decide how to unlock it – PIN, security key or biometrics. It only works on trayze, so phishing sites can't use it.
        </span>
      </div>
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="pill pill-black" onClick={() => void passkey()} disabled={busy}>
          {busy ? 'Waiting for the passkey…' : 'Add a passkey'}
        </button>
        <button className="pill pill-ghost" onClick={() => setStep('code')} disabled={busy}>
          {error ? 'Continue with recovery code' : 'Skip – recovery code only'}
        </button>
      </div>
    </>
  )
}

// ---------- recovery code ----------

function CodeStep({ title, intro, onSave, offerRemember }: { title: string; intro: string; onSave: (secret: Uint8Array, keep: boolean) => Promise<void>; offerRemember?: boolean }) {
  const [code, setCode] = useState<{ code: string; secret: Uint8Array }>()
  const [keep, setKeep] = useState(false)
  const [stored, setStored] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    void newRecoveryCode().then((c) => live && setCode(c))
    return () => {
      live = false
    }
  }, [])

  if (!code) return <Head title={title} />

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.code)
    } catch {
      window.prompt('Copy your recovery code', code.code)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave(code.secret, keep)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <>
      <Head title={title} />
      <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
        {intro}
      </p>
      <div className="recovery-code mono">{code.code}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="pill pill-glass pill-small" onClick={() => void copy()}>
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          className="pill pill-glass pill-small"
          onClick={() =>
            download(
              'trayze-recovery-code.txt',
              `trayze recovery code\n\n${code.code}\n\nUnlocks the private details (titles, notes, names) of your trayze entries on any device.\nKeep it offline and private. Anyone with this code can read those details.\nIt does NOT give access to your wallet or funds. Created ${new Date().toISOString().slice(0, 10)}.\n`,
              'text/plain'
            )
          }
        >
          <IconDownload size={16} /> Save as file
        </button>
      </div>
      <div className="note small" style={{ lineHeight: 1.55 }}>
        Write it down or print it. trayze cannot recover it for you. It is not your wallet's seed phrase and gives no access to funds.
      </div>
      <label className="check">
        <input type="checkbox" checked={stored} onChange={(e) => setStored(e.target.checked)} />
        <span>I have stored this code somewhere safe.</span>
      </label>
      {offerRemember && <RememberOption keep={keep} setKeep={setKeep} />}
      {error && <div className="error">{error}</div>}
      <button className="pill pill-black" style={{ alignSelf: 'flex-start' }} onClick={() => void save()} disabled={!stored || busy}>
        {busy ? 'Saving on-chain – confirm in your wallet…' : 'Save and continue'}
      </button>
    </>
  )
}

function RenewCode({ req }: { req: KeyRequest }) {
  const current = req.current!
  return (
    <CodeStep
      title="New recovery code"
      intro="Your old code stops working as soon as this one is saved. Passkeys stay as they are."
      onSave={async (secret) => {
        const ring = await setCodeSlot(current.ring, current.raw, secret)
        await storeKeyring(req.anchor, ring)
        req.resolve({ ...current, ring })
      }}
    />
  )
}

// ---------- unlock ----------

function Unlock({ req }: { req: KeyRequest }) {
  const ring = req.ring!
  const passkeys = passkeySlots(ring)
  const canPasskey = passkeys.length > 0 && passkeysAvailable()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<'passkey' | 'code'>()
  const [error, setError] = useState('')
  const [keep, setKeep] = useState(false)

  const withPasskey = async () => {
    setBusy('passkey')
    setError('')
    try {
      const r = await passkeySecret(
        unb64u(ring.prfSalt),
        passkeys.map((p) => p.credId)
      )
      if (!r.secret) throw new Error('This passkey cannot derive keys here – use your recovery code.')
      const raw = await unlockWithPasskey(ring, r.id, r.secret)
      req.resolve(await toUnlocked(raw, ring), { keep })
    } catch (e) {
      setError(errorText(e))
      setBusy(undefined)
    }
  }

  const withCode = async () => {
    setBusy('code')
    setError('')
    try {
      const raw = await unlockWithCode(ring, await parseRecoveryCode(input))
      req.resolve(await toUnlocked(raw, ring), { keep })
    } catch (e) {
      setError(errorText(e))
      setBusy(undefined)
    }
  }

  return (
    <>
      <Head title="Unlock your private details" />
      <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
        Titles, notes and names are encrypted. Unlock them once for this session.
      </p>
      {canPasskey && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="pill pill-black" style={{ alignSelf: 'flex-start' }} onClick={() => void withPasskey()} disabled={!!busy}>
            {busy === 'passkey' ? 'Waiting for the passkey…' : 'Use passkey'}
          </button>
          <span className="muted small">{passkeys.map((p) => p.label).join(' · ')}</span>
        </div>
      )}
      {hasCode(ring) && (
        <div className="field">
          <span>{canPasskey ? 'Or enter your recovery code' : 'Recovery code'}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input mono"
              style={{ flex: '1 1 260px', fontSize: 14 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && input.trim() && void withCode()}
              placeholder="TRZ-XXXX-XXXX-…"
              spellCheck={false}
              autoComplete="off"
            />
            <button className="pill pill-glass" onClick={() => void withCode()} disabled={!!busy || !input.trim()}>
              {busy === 'code' ? 'Checking…' : 'Unlock'}
            </button>
          </div>
        </div>
      )}
      {passkeys.length > 0 && !canPasskey && (
        <span className="muted small" style={{ lineHeight: 1.5 }}>
          Passkeys don't work in this browser (for example inside a wallet app) – use your recovery code here.
        </span>
      )}
      {(canPasskey || hasCode(ring)) && <RememberOption keep={keep} setKeep={setKeep} />}
      {!hasCode(ring) && !canPasskey && <div className="error">This wallet's backup can only be unlocked with a passkey, which this browser doesn't support. Open trayze in a regular browser.</div>}
      {error && <div className="error">{error}</div>}
    </>
  )
}

function RememberOption({ keep, setKeep }: { keep: boolean; setKeep: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="check">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        <span>Remember on this device</span>
      </label>
      {keep && (
        <div className="note small" style={{ lineHeight: 1.55 }}>
          You won't need your code or passkey here again. But anyone who can use this device and browser can then read your titles, notes and names in trayze – only do this on your own device with a screen lock. You can forget it anytime in the backup panel; a new recovery code signs out all remembered devices.
        </div>
      )}
    </div>
  )
}

function Head({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 40 }}>
      <span className="tile">
        <IconLock size={18} />
      </span>
      <h2 style={{ margin: 0 }}>{title}</h2>
    </div>
  )
}
