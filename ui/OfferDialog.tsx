import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { encodeOffer, newOffer, offerRef, signingText, type Offer } from '../core/offer'
import type { AgreementTerms } from '../core/agreement'
import { MIN_PAYMENT, formatAlph, parseAlph, payeeProblem } from '../core/split'
import { useAnchor } from './useAnchor'
import { payLink, saveOffer } from './usePayments'
import { IconCheck, IconClose, IconCopy, IconDownload } from './icons'
import { download } from './helpers'

export type OfferTarget = { kind: 'split'; terms: AgreementTerms; agreementId: string } | { kind: 'address' }

const VALIDITY = [
  { label: 'No expiry', days: 0 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 }
]

/**
 * Creates a payment link: the offer is signed by the connected wallet (a free signature, no
 * transaction) and travels inside the link. Nothing is stored on a server.
 */
export function OfferDialog({ target, title: initialTitle, fileHash, feeBps, group, onClose }: { target: OfferTarget; title: string; fileHash?: string; feeBps?: bigint; group: number; onClose: () => void }) {
  const { wallet } = useAnchor()
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState('')
  const [license, setLicense] = useState('')
  const [price, setPrice] = useState('')
  const [days, setDays] = useState(30)
  const [once, setOnce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState<string>()

  const addressProblem = target.kind === 'address' && wallet ? payeeProblem(wallet.address, group) : undefined
  const amount = price.trim() ? parseAlph(price) : undefined
  const priceError = price.trim() && (amount === undefined || amount < MIN_PAYMENT) ? `Enter at least ${formatAlph(MIN_PAYMENT)} ALPH, or leave empty to let the buyer choose.` : ''

  const create = async () => {
    if (!wallet) return
    setBusy(true)
    setError('')
    try {
      const offer: Offer = newOffer({
        seller: wallet.address,
        to: target.kind === 'split' ? { kind: 'split', agreementId: target.agreementId, terms: target.terms } : { kind: 'address', address: wallet.address },
        amount: amount?.toString(),
        title: title.trim(),
        description: description.trim() || undefined,
        license: license.trim() || undefined,
        fileHash,
        expires: days ? Date.now() + days * 86_400_000 : undefined,
        once
      })
      const ref = await offerRef(offer)
      const { signature } = await wallet.signer.signMessage({ signerAddress: wallet.address, message: signingText(ref), messageHasher: 'alephium' })
      const signed = { offer, publicKey: wallet.publicKey, keyType: wallet.keyType, signature }
      const payload = await encodeOffer(signed)
      saveOffer({ ref, payload, signed, agreementId: target.kind === 'split' ? target.agreementId : undefined, fileHash })
      setLink(payLink(payload))
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e)
      setError(/reject|denied|cancel/i.test(t) ? 'The signature was declined in the wallet.' : t)
    } finally {
      setBusy(false)
    }
  }

  // Portal: panels use backdrop-filter, which would trap a fixed-position dialog inside them.
  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Payment link">
      <section className="glass modal fade-in">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <IconClose size={16} />
        </button>
        <h2 style={{ paddingRight: 40 }}>{link ? 'Your payment link' : 'Create a payment link'}</h2>
        {link ? (
          <LinkResult link={link} title={title} />
        ) : addressProblem ? (
          <div className="error">{addressProblem}</div>
        ) : !wallet ? (
          <p className="muted" style={{ margin: 0 }}>
            Connect your wallet first (top right).
          </p>
        ) : (
          <>
            <p className="muted small" style={{ margin: 0, lineHeight: 1.6 }}>
              {target.kind === 'split'
                ? 'Payments go into this split; every party withdraws its share.'
                : 'Payments go to your connected address.'}{' '}
              {feeBps !== undefined && `trayze keeps ${Number(feeBps) / 100} % of each payment.`} Your wallet signs the link (free, no transaction) so nobody can change price or recipient.
            </p>
            <label className="field">
              <span>Title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </label>
            <label className="field">
              <span>Description · optional</span>
              <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />
            </label>
            <label className="field">
              <span>License · optional</span>
              <textarea className="input" rows={2} value={license} onChange={(e) => setLicense(e.target.value)} maxLength={600} placeholder="e.g. Online use in one commercial, 12 months, worldwide" />
            </label>
            <label className="field">
              <span>Price in ALPH · empty = buyer chooses</span>
              <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 25" />
            </label>
            {priceError && <div className="error">{priceError}</div>}
            <div className="field">
              <span>Valid for</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VALIDITY.map((v) => (
                  <button key={v.days} type="button" className="chip" aria-pressed={days === v.days} onClick={() => setDays(v.days)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} />
              <span>Can be paid only once (an invoice)</span>
            </label>
            <span className="muted small" style={{ lineHeight: 1.5 }}>
              The details travel inside the link and are not published anywhere. Anyone you give the link to can open it – you can revoke it later.
            </span>
            {error && <div className="error">{error}</div>}
            <button className="pill pill-black" style={{ alignSelf: 'flex-start' }} onClick={() => void create()} disabled={busy || !title.trim() || !!priceError}>
              {busy ? 'Confirm the signature in your wallet…' : 'Sign and create link'}
            </button>
          </>
        )}
      </section>
    </div>,
    document.body
  )
}

export function LinkResult({ link, title }: { link: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let live = true
    void QRCode.toString(link, { type: 'svg', errorCorrectionLevel: 'L', margin: 1 }).then((s) => live && setSvg(s))
    return () => {
      live = false
    }
  }, [link])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('Copy this link', link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {svg && <div className="qr" aria-label="QR code of the payment link" dangerouslySetInnerHTML={{ __html: svg }} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="pill pill-black pill-small" onClick={() => void copy()}>
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />} {copied ? 'Copied' : 'Copy link'}
        </button>
        {svg && (
          <button className="pill pill-glass pill-small" onClick={() => download(`qr-${title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'payment'}.svg`, svg, 'image/svg+xml')}>
            <IconDownload size={16} /> QR code
          </button>
        )}
      </div>
      <span className="muted small" style={{ lineHeight: 1.5 }}>
        On a phone, buyers open the link inside the Alephium Wallet app's browser to pay. You find this link again on this page under “Payment links”.
      </span>
    </>
  )
}
