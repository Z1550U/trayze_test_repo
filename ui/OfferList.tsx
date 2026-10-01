import { useEffect, useState } from 'react'
import { formatAlph } from '../core/split'
import { formatDate } from '../core/format'
import type { Paid, PaymentsClient } from '../chain/payments'
import { payLink, useOffers, type SavedOffer } from './usePayments'
import { IconCheck, IconCopy } from './icons'

/** The seller's own payment links for one split or one file, with their on-chain status. */
export function OfferList({ payments, to, filter, bare }: { payments: PaymentsClient; to: string; filter: (o: SavedOffer) => boolean; bare?: boolean }) {
  const offers = useOffers(filter)
  if (!offers.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!bare && <h3>Payment links</h3>}
      <div className="rows">
        {offers.map((o) => (
          <OfferRow key={o.ref} o={o} payments={payments} to={to} />
        ))}
      </div>
    </div>
  )
}

export function OfferRow({ o, payments, to }: { o: SavedOffer; payments: PaymentsClient; to: string }) {
  const offer = o.signed.offer
  const [paid, setPaid] = useState<Paid[]>()
  const [revoked, setRevoked] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [version, setVersion] = useState(0)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    void Promise.all([payments.paymentsTo(to, o.ref), payments.isRevoked(o.ref, offer.seller)])
      .then(([p, r]) => {
        if (!live) return
        // A payment counts only if it matches the offer: anyone can emit Paid with this ref.
        setPaid(p.filter((x) => offer.amount === undefined || x.amount === BigInt(offer.amount)))
        setRevoked(r)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [payments, to, o.ref, offer.amount, offer.seller, version])

  const revoke = async () => {
    setBusy(true)
    setError('')
    try {
      await payments.confirm(await payments.revoke(o.ref))
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    const link = payLink(o.payload)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('Copy this link', link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const expired = offer.expires !== undefined && now > offer.expires
  const total = paid?.reduce((n, p) => n + p.amount, 0n) ?? 0n
  const status = revoked ? 'revoked' : offer.once && paid?.length ? 'paid' : expired ? 'expired' : paid?.length ? `${paid.length}× paid · ${formatAlph(total)} ALPH` : 'open'

  return (
    <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ color: 'var(--ink)' }}>{offer.title}</span>
        <span className="muted small">
          {offer.amount ? `${formatAlph(BigInt(offer.amount))} ALPH` : 'buyer chooses'} · {formatDate(offer.created)}
          {offer.expires ? ` · until ${formatDate(offer.expires)}` : ''}
          {offer.once ? ' · once' : ''}
        </span>
        {error && <span className="small chain-break">{error}</span>}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span className="small">
          <span className="dot" style={{ background: status === 'open' ? 'var(--line)' : revoked || expired ? 'var(--warn)' : 'var(--sage)', marginRight: 6 }} />
          {paid === undefined ? '…' : status}
        </span>
        {!revoked && !expired && !(offer.once && paid?.length) && (
          <>
            <button className="pill pill-ghost pill-small" onClick={() => void copy()}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />} {copied ? 'Copied' : 'Link'}
            </button>
            <button className="pill pill-ghost pill-small" onClick={() => void revoke()} disabled={busy}>
              {busy ? 'Revoking…' : 'Revoke'}
            </button>
          </>
        )}
      </span>
    </div>
  )
}
