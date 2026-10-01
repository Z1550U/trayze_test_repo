import { useEffect, useMemo, useState } from 'react'
import { checkOffer, decodeOffer, splitTermsOfOffer, type SignedOffer } from '../core/offer'
import { agreementId as computeAgreementId, bpsToPercent, evaluate, sameAddress, payoutsOf } from '../core/agreement'
import { MIN_PAYMENT, feeOf, formatAlph, parseAlph, payeeForGroup, splitIdOf, splitTermsOf } from '../core/split'
import { formatDateTime, shortHash } from '../core/format'
import type { FeeInfo, Paid } from '../chain/payments'
import { useAnchor } from '../ui/useAnchor'
import { usePayments } from '../ui/usePayments'
import { download } from '../ui/helpers'
import { IconCheck, IconDownload, IconLock } from '../ui/icons'
import { PARTY_COLORS } from '../ui/colors'

type Verdict =
  | { kind: 'loading' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'payable'; ref: string; to: string; splitId?: string; fee: FeeInfo; earlier: Paid[] }

/**
 * The public payment page. Everything shown comes from the link – but nothing is trusted
 * before it is checked: the seller's signature, expiry, revocation by the seller, "pay once",
 * and for splits that the split wallet belongs to exactly the agreed, concluded terms.
 */
export function PayView({ payload }: { payload: string }) {
  const [signed, setSigned] = useState<SignedOffer | null>()
  useEffect(() => {
    let live = true
    void decodeOffer(payload).then((s) => live && setSigned(s ?? null))
    return () => {
      live = false
    }
  }, [payload])
  if (signed === undefined) return null
  if (!signed) {
    return (
      <section className="glass empty fade-in">
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 450 }}>This payment link is not valid.</h2>
        <span className="muted">It may be incomplete – ask the sender for the full link.</span>
      </section>
    )
  }
  return <Pay signed={signed} />
}

function Pay({ signed }: { signed: SignedOffer }) {
  const { mode, wallet, anchor } = useAnchor()
  const payments = usePayments()
  const offer = signed.offer
  const terms = useMemo(() => splitTermsOfOffer(offer), [offer])
  const [verdict, setVerdict] = useState<Verdict>({ kind: 'loading' })
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ txId: string; time: number; amount: bigint }>()

  useEffect(() => {
    if (!payments) return
    let live = true
    const block = (reason: string) => live && setVerdict({ kind: 'blocked', reason })
    void (async () => {
      try {
        const c = await checkOffer(signed)
        if (!c.ok) return block(c.reason)
        const fee = await payments.feeInfo()
        if (!fee) return block('The payment contract is not reachable on this network.')
        if (await payments.isRevoked(c.ref, offer.seller)) return block('The seller has withdrawn this offer.')

        let to: string
        let splitId: string | undefined
        if (offer.to.kind === 'split') {
          const t = terms!
          const id = await computeAgreementId(t)
          if (id !== offer.to.agreementId) return block('The split sheet in this link does not match its ID. Do not pay.')
          // The split must be concluded: every party confirmed on-chain before the deadline.
          const status = evaluate(t, id, await anchor.agreementEvents(id))
          if (status.state !== 'agreed') return block('This split sheet has not been confirmed by every party.')
          splitId = splitIdOf(payments.id, id, splitTermsOf(t, payments.group), payments.group)
          const s = await payments.splitState(splitId)
          if (!s) return block('The split wallet for this split sheet has not been activated yet.')
          to = s.address
        } else {
          to = offer.to.address
        }
        const earlier = (await payments.paymentsTo(to, c.ref)).filter((p) => offer.amount === undefined || p.amount === BigInt(offer.amount))
        if (offer.once && earlier.length) return block(`This invoice was already paid on ${formatDateTime(earlier[0].time)}.`)
        if (live) setVerdict({ kind: 'payable', ref: c.ref, to, splitId, fee, earlier })
      } catch (e) {
        block(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      live = false
    }
  }, [payments, signed, offer, terms, anchor])

  const fixed = offer.amount !== undefined ? BigInt(offer.amount) : undefined
  const amount = fixed ?? parseAlph(chosen)
  const amountError = fixed === undefined && chosen.trim() && (amount === undefined || amount < MIN_PAYMENT) ? `At least ${formatAlph(MIN_PAYMENT)} ALPH.` : ''

  const pay = async () => {
    if (verdict.kind !== 'payable' || !payments || amount === undefined) return
    setBusy(true)
    setError('')
    try {
      const txId = verdict.splitId ? await payments.paySplit(verdict.splitId, amount, verdict.ref) : await payments.payAddress(payeeForGroup(verdict.to, payments.group), amount, verdict.ref)
      const time = await payments.confirm(txId)
      setReceipt({ txId, time, amount })
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e)
      setError(/reject|denied|cancel/i.test(t) ? 'The payment was declined in the wallet.' : /insufficient|not enough/i.test(t) ? 'Not enough ALPH in this wallet.' : t)
    } finally {
      setBusy(false)
    }
  }

  const feeBps = verdict.kind === 'payable' ? verdict.fee.feeBps : undefined

  return (
    <div className="stage fade-in">
      <div className="stage-left">
        <div>
          <p className="eyebrow">Payment · {offer.to.kind === 'split' ? 'split wallet' : 'direct'}</p>
          <h1 className="title">
            {offer.title}
            <span className="grey">{fixed !== undefined ? `${formatAlph(fixed)} ALPH` : 'Choose your amount'}</span>
          </h1>
        </div>
        {offer.description && <p className="lead" style={{ whiteSpace: 'pre-wrap' }}>{offer.description}</p>}
        {offer.license && (
          <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
            <span className="small">License</span>
            <span style={{ color: 'var(--ink)', fontSize: 15, whiteSpace: 'pre-wrap' }}>{offer.license}</span>
          </div>
        )}
        <div className="rows">
          <div className="row">
            <span>Offered by</span>
            <span className="mono">{shortHash(offer.seller, 6, 6)}</span>
          </div>
          {offer.fileHash && (
            <div className="row">
              <span>For the file</span>
              <span className="mono">{shortHash(offer.fileHash, 8, 6)}</span>
            </div>
          )}
          {offer.expires && (
            <div className="row">
              <span>Valid until</span>
              <span>{formatDateTime(offer.expires)}</span>
            </div>
          )}
          {offer.once && (
            <div className="row">
              <span>Payable</span>
              <span>once</span>
            </div>
          )}
        </div>
      </div>

      <section className="glass panel fade-in">
        {mode !== 'alephium' || !payments ? (
          <span className="muted">Payments run on Alephium. Switch the network badge (top right) to Alephium.</span>
        ) : receipt ? (
          <>
            <div className="note" style={{ alignItems: 'center', color: 'var(--ink)' }}>
              <IconCheck size={18} />
              <span>Paid {formatAlph(receipt.amount)} ALPH on {formatDateTime(receipt.time)}.</span>
            </div>
            <span className="muted small" style={{ lineHeight: 1.5 }}>
              Your payment is recorded on-chain with this offer's reference – that is your receipt{offer.license ? ' and proof of the license' : ''}.
            </span>
            <button
              className="pill pill-glass pill-small"
              style={{ alignSelf: 'flex-start' }}
              onClick={() =>
                download(
                  `receipt-${offer.title.replace(/[^\w-]+/g, '-').slice(0, 40)}.json`,
                  JSON.stringify({ schema: 'trayze/receipt@1', network: payments ? 'alephium' : '', txId: receipt.txId, time: receipt.time, payer: wallet?.address, amount: receipt.amount.toString(), ref: verdict.kind === 'payable' ? verdict.ref : '', offer: signed }, null, 2)
                )
              }
            >
              <IconDownload size={16} /> Receipt
            </button>
          </>
        ) : verdict.kind === 'loading' ? (
          <span className="muted">Checking the offer…</span>
        ) : verdict.kind === 'blocked' ? (
          <div className="error">{verdict.reason}</div>
        ) : (
          <>
            <div className="note" style={{ alignItems: 'center', color: 'var(--ink)' }}>
              <IconLock size={16} />
              <span>Signed by the seller · checked{offer.to.kind === 'split' ? ' · split sheet confirmed by every party' : ''}</span>
            </div>

            {terms && (
              <div className="rows">
                {payoutsOf(terms).map((p, i) => (
                  <div className="row" key={p.address}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className="dot" style={{ background: PARTY_COLORS[i % PARTY_COLORS.length] }} />
                      {p.name}
                    </span>
                    <span>{bpsToPercent(p.shareBps)} %</span>
                  </div>
                ))}
              </div>
            )}

            {fixed === undefined && (
              <label className="field">
                <span>Amount in ALPH</span>
                <input className="input" inputMode="decimal" value={chosen} onChange={(e) => setChosen(e.target.value)} placeholder="e.g. 10" />
              </label>
            )}
            {amountError && <div className="error">{amountError}</div>}

            {amount !== undefined && feeBps !== undefined && (
              <span className="muted small" style={{ lineHeight: 1.5 }}>
                {formatAlph(amount - feeOf(amount, feeBps))} ALPH go to {offer.to.kind === 'split' ? 'the split wallet' : 'the seller'}, {formatAlph(feeOf(amount, feeBps))} ALPH ({Number(feeBps) / 100} %) to trayze. Plus a small network fee.
              </span>
            )}
            {verdict.earlier.length > 0 && !offer.once && <span className="muted small">Paid {verdict.earlier.length}× before.</span>}

            {error && <div className="error">{error}</div>}
            {wallet ? (
              sameAddress(wallet.address, offer.seller) && offer.to.kind === 'address' ? (
                <span className="muted small">This is your own offer.</span>
              ) : (
                <button className="pill pill-black" style={{ alignSelf: 'flex-start' }} onClick={() => void pay()} disabled={busy || amount === undefined || !!amountError || amount < MIN_PAYMENT}>
                  {busy ? 'Confirm in your wallet…' : amount !== undefined ? `Pay ${formatAlph(amount)} ALPH` : 'Pay'}
                </button>
              )
            ) : (
              <span className="muted small">Connect your wallet (top right) to pay.</span>
            )}
          </>
        )}
      </section>
    </div>
  )
}

