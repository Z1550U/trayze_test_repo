import { useEffect, useState } from 'react'
import { createPasskey, passkeySecret, prfCapability, prfSalt, relyingPartyId, type CreatedPasskey } from '../core/passkey'
import { hashText } from '../core/hash'
import { IconCheck, IconCopy } from '../ui/icons'

/**
 * Key lab – checks whether this browser + authenticator can derive a stable secret from a passkey
 * (WebAuthn PRF). Nothing is stored on-chain or sent anywhere; the test passkey only lives on the
 * device or security key and can be deleted there afterwards.
 */
type Row = { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }

const LAST = 'trayze.lab.credential'
const hex = async (b: Uint8Array) => (await hashText(Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''))).slice(0, 12)
const attachmentLabel = (a?: string) => (a === 'platform' ? 'this device' : a === 'cross-platform' ? 'security key or other device' : 'unknown')

export function KeyLab() {
  const [capability, setCapability] = useState<boolean | undefined | 'loading'>('loading')
  const [created, setCreated] = useState<CreatedPasskey>()
  const [rows, setRows] = useState<Row[]>([])
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState<'create' | 'unlock'>()
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [lastId, setLastId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(LAST) ?? undefined
    } catch {
      return undefined
    }
  })

  useEffect(() => {
    let live = true
    void prfCapability().then((c) => live && setCapability(c))
    return () => {
      live = false
    }
  }, [])

  const fail = (e: unknown) => {
    const t = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    setError(/NotAllowedError/.test(t) ? 'Cancelled, or the browser did not allow it (timeout / no suitable authenticator).' : t)
  }

  const create = async () => {
    setBusy('create')
    setError('')
    setVerdict(undefined)
    try {
      const c = await createPasskey(`trayze test · ${new Date().toLocaleDateString('en-GB')}`, await prfSalt('lab'))
      setCreated(c)
      setLastId(c.id)
      try {
        localStorage.setItem(LAST, c.id)
      } catch {
        /* ignore */
      }
      setRows([
        { label: 'Passkey created', value: 'yes', tone: 'good' },
        { label: 'Stored on', value: attachmentLabel(c.attachment) },
        { label: 'PRF at creation', value: c.prfEnabled === true ? 'enabled' : c.prfEnabled === false ? 'not supported' : 'no answer (check step 2)', tone: c.prfEnabled === false ? 'bad' : c.prfEnabled ? 'good' : 'neutral' }
      ])
    } catch (e) {
      fail(e)
    } finally {
      setBusy(undefined)
    }
  }

  const unlock = async () => {
    setBusy('unlock')
    setError('')
    try {
      const salt = await prfSalt('lab')
      const a = await passkeySecret(salt, created?.id ?? lastId)
      const b = await passkeySecret(salt, a.id)
      const next: Row[] = [...rows.filter((r) => !['Secret on unlock', 'Same secret twice', 'Secret fingerprint'].includes(r.label))]
      if (!a.secret || !b.secret) {
        next.push({ label: 'Secret on unlock', value: 'none – PRF not supported here', tone: 'bad' })
        setVerdict({ ok: false, text: 'This browser or authenticator cannot unlock trayze backups with a passkey. A recovery code would still work.' })
      } else {
        const same = (await hex(a.secret)) === (await hex(b.secret))
        next.push({ label: 'Secret on unlock', value: `${a.secret.length} bytes`, tone: 'good' })
        next.push({ label: 'Same secret twice', value: same ? 'yes' : 'no', tone: same ? 'good' : 'bad' })
        next.push({ label: 'Secret fingerprint', value: await hex(a.secret) })
        setVerdict(
          same
            ? { ok: true, text: 'Works. This passkey can unlock trayze backups – without a password, and only on this domain.' }
            : { ok: false, text: 'The secret changed between two unlocks – not usable as a key.' }
        )
      }
      setRows(next)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(undefined)
    }
  }

  const copy = async () => {
    const text = [
      'trayze key lab',
      `Domain: ${relyingPartyId()}`,
      `Browser says PRF: ${capability === 'loading' ? '…' : capability === undefined ? 'no answer' : capability ? 'yes' : 'no'}`,
      ...rows.map((r) => `${r.label}: ${r.value}`),
      verdict ? `Result: ${verdict.text}` : '',
      `Device: ${navigator.userAgent}`
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.prompt('Copy the result', text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tone = (t?: Row['tone']) => (t === 'good' ? 'var(--sage)' : t === 'bad' ? 'var(--warn)' : 'var(--line)')

  return (
    <div className="stage fade-in">
      <div className="stage-left">
        <div>
          <p className="eyebrow">Key lab · test</p>
          <h1 className="title">
            Passkey check
            <span className="grey">for the encrypted backup</span>
          </h1>
        </div>
        <p className="lead">
          Checks whether a passkey on this device – or a security key – can unlock trayze backups. You choose how to unlock it: device PIN, security-key PIN, fingerprint or face. trayze never sees which.
        </p>
        <div className="note" style={{ flexDirection: 'column', gap: 6 }}>
          <span>Nothing is sent anywhere and nothing goes on-chain.</span>
          <span className="muted small">
            The test creates a passkey called “trayze test” on this device or key. You can delete it afterwards in your system settings (Windows: Settings → Accounts → Passkeys · iPhone: Settings → Passwords).
          </span>
        </div>
      </div>

      <section className="glass panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h3>Result</h3>
          <span className="muted small">
            Browser says PRF: {capability === 'loading' ? '…' : capability === undefined ? 'no answer' : capability ? 'yes' : 'no'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="pill pill-black" style={{ alignSelf: 'flex-start' }} onClick={() => void create()} disabled={!!busy}>
            <span className="knob">1</span>
            {busy === 'create' ? 'Waiting for the passkey…' : 'Create test passkey'}
          </button>
          <button className="pill pill-glass" style={{ alignSelf: 'flex-start' }} onClick={() => void unlock()} disabled={!!busy || (!created && !lastId)}>
            <span className="knob" style={{ background: 'rgba(20,22,24,0.06)' }}>
              2
            </span>
            {busy === 'unlock' ? 'Unlock (twice)…' : 'Unlock twice'}
          </button>
          <span className="muted small" style={{ lineHeight: 1.5 }}>
            Step 2 asks you to unlock the passkey two times in a row – that's how we check the secret stays the same.
          </span>
        </div>

        {error && <div className="error">{error}</div>}

        {rows.length > 0 && (
          <div className="rows">
            {rows.map((r) => (
              <div className="row" key={r.label}>
                <span>{r.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {r.tone && <span className="dot" style={{ background: tone(r.tone) }} />}
                  <span className={r.label === 'Secret fingerprint' ? 'mono' : undefined}>{r.value}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {verdict && (
          <div className="note" style={{ alignItems: 'center', color: 'var(--ink)' }}>
            <span className="dot" style={{ background: verdict.ok ? 'var(--sage)' : 'var(--warn)', flexShrink: 0 }} />
            <span>{verdict.text}</span>
          </div>
        )}

        {(rows.length > 0 || error) && (
          <button className="pill pill-ghost pill-small" style={{ alignSelf: 'flex-start' }} onClick={() => void copy()}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />} {copied ? 'Copied' : 'Copy result'}
          </button>
        )}
      </section>
    </div>
  )
}
