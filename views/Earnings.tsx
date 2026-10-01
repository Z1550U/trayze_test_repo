import { useEffect, useMemo, useState } from 'react'
import { agreementId as computeAgreementId, bpsToPercent, encodeTerms, isInvolved, payoutsOf, sameAddress, type AgreementTerms } from '../core/agreement'
import { DUST, formatAlph, owedOf, payeeForGroup, splitIdOf, splitTermsOf } from '../core/split'
import { splitTermsOfOffer } from '../core/offer'
import { formatDateTime, shortHash } from '../core/format'
import type { Paid, PaymentsClient, SplitState } from '../chain/payments'
import { useAnchor } from '../ui/useAnchor'
import { usePayments, useOffers, type SavedOffer } from '../ui/usePayments'
import { useData } from '../ui/helpers'
import { load as loadWatched } from '../ui/noticeStore'
import { OfferRow } from '../ui/OfferList'
import { FeePanel } from '../ui/FeePanel'
import { IconArrow } from '../ui/icons'

interface MySplit {
  agreementId: string
  terms: AgreementTerms
  state: SplitState
  index: number
  owed: bigint
}

/**
 * Everything money in one place: what can be withdrawn from all split wallets, the payment links
 * and what came in. The agreement and file pages only show a short summary and link here.
 */
export function Earnings() {
  const { mode, wallet } = useAnchor()
  const payments = usePayments()

  if (mode !== 'alephium' || !payments) {
    return (
      <Shell>
        <section className="glass empty">
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 450 }}>Earnings live on Alephium.</h2>
          <span className="muted">Split wallets and payment links need the Alephium network (network badge, top right).</span>
        </section>
      </Shell>
    )
  }
  if (!wallet) {
    return (
      <Shell>
        <section className="glass empty">
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 450 }}>Connect your wallet</h2>
          <span className="muted">Your split wallets, payment links and incoming payments appear here.</span>
        </section>
      </Shell>
    )
  }
  return <Overview payments={payments} me={wallet.address} />
}

function Shell({ children, total }: { children: React.ReactNode; total?: React.ReactNode }) {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow">Earnings</p>
          {total ?? (
            <h1 className="title">
              Earnings
              <span className="grey">splits & payments</span>
            </h1>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function Overview({ payments, me }: { payments: PaymentsClient; me: string }) {
  const { entries } = useData()
  const offers = useOffers(() => true)
  const [splits, setSplits] = useState<MySplit[]>()
  const [incoming, setIncoming] = useState<(Paid & { label: string })[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)

  // Split sheets I'm part of: my own proposals plus the ones I opened through an invite link.
  const candidates = useMemo(() => {
    const list: AgreementTerms[] = [...entries.filter((e) => e.agreement?.terms.splits).map((e) => e.agreement!.terms), ...Object.values(loadWatched().watch).filter((t) => t.splits)]
    return list.filter((t) => isInvolved(t, me))
  }, [entries, me])

  const myAddress = useMemo(() => {
    try {
      return payeeForGroup(me, payments.group)
    } catch {
      return undefined
    }
  }, [me, payments])

  useEffect(() => {
    let live = true
    void (async () => {
      const seen = new Set<string>()
      const found: MySplit[] = []
      for (const terms of candidates) {
        const agreementId = await computeAgreementId(terms)
        if (seen.has(agreementId)) continue
        seen.add(agreementId)
        try {
          const id = splitIdOf(payments.id, agreementId, splitTermsOf(terms, payments.group), payments.group)
          const state = await payments.splitState(id)
          if (!state) continue
          const index = state.payees.findIndex((p) => sameAddress(p, me))
          if (index < 0) continue
          found.push({ agreementId, terms, state, index, owed: owedOf(state.totalIn, state.shares[index], state.withdrawn[index]) })
        } catch {
          /* addresses that can't receive payouts – shown on the agreement page */
        }
      }
      const inc: (Paid & { label: string })[] = []
      for (const s of found) for (const p of await payments.paymentsTo(s.state.address)) inc.push({ ...p, label: s.terms.title })
      if (myAddress) for (const p of await payments.paymentsTo(myAddress)) inc.push({ ...p, label: 'direct' })
      if (!live) return
      setSplits(found.sort((a, b) => (b.owed > a.owed ? 1 : b.owed < a.owed ? -1 : 0)))
      setIncoming(inc.sort((a, b) => b.time - a.time).slice(0, 10))
    })()
    return () => {
      live = false
    }
  }, [candidates, payments, me, myAddress, version])

  const ready = (splits ?? []).filter((s) => s.owed >= DUST)
  const total = ready.reduce((n, s) => n + s.owed, 0n)

  const withdrawAll = async () => {
    setBusy(true)
    setMessage('')
    let done = 0
    try {
      for (const s of ready) {
        await payments.confirm(await payments.withdraw(s.state.id, s.index))
        done++
      }
      setMessage(done ? `Withdrawn from ${done} ${done === 1 ? 'split' : 'splits'}.` : '')
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e)
      setMessage(`${done ? `Withdrawn from ${done}, then stopped: ` : ''}${/reject|denied|cancel/i.test(t) ? 'declined in the wallet.' : t}`)
    } finally {
      setBusy(false)
      setVersion((v) => v + 1)
    }
  }

  const toOf = (o: SavedOffer): string | undefined => {
    try {
      const terms = splitTermsOfOffer(o.signed.offer)
      if (terms && o.signed.offer.to.kind === 'split') {
        const id = splitIdOf(payments.id, o.signed.offer.to.agreementId, splitTermsOf(terms, payments.group), payments.group)
        return splits?.find((s) => s.state.id === id)?.state.address
      }
      return payeeForGroup(o.signed.offer.seller, payments.group)
    } catch {
      return undefined
    }
  }

  return (
    <Shell
      total={
        <h1 className="title">
          {splits ? `${formatAlph(total)} ALPH` : '…'}
          <span className="grey">ready to withdraw</span>
        </h1>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: -12 }}>
        <button className="pill pill-black" onClick={() => void withdrawAll()} disabled={busy || ready.length === 0}>
          {busy ? 'Confirm in your wallet…' : ready.length > 1 ? `Withdraw all · ${formatAlph(total)} ALPH` : 'Withdraw'}
        </button>
        <span className="muted small">{message || (ready.length > 1 ? `From ${ready.length} splits – one confirmation per split.` : '')}</span>
      </div>

      <div className="earnings-grid">
        <section className="glass panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3>Your splits</h3>
            <span className="muted small">share · available</span>
          </div>
          {splits === undefined ? (
            <span className="muted small">Reading your split wallets…</span>
          ) : splits.length === 0 ? (
            <span className="muted small" style={{ lineHeight: 1.55 }}>
              No active split wallet yet. Once a split sheet is agreed, activate payouts on its page.
            </span>
          ) : (
            <div className="rows">
              {splits.map((s) => (
                <a key={s.agreementId} className="row row-link" href={`#/agreement/${encodeTerms(s.terms)}`}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span>{s.terms.title}</span>
                    <span className="muted small">
                      {bpsToPercent(Number(s.state.shares[s.index]))} % · {payoutsOf(s.terms).length} recipients · {formatAlph(s.state.totalIn)} ALPH received
                    </span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {formatAlph(s.owed)} ALPH
                    <IconArrow size={16} />
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="glass panel">
            <h3>Payment links</h3>
            {offers.length === 0 ? (
              <span className="muted small" style={{ lineHeight: 1.55 }}>
                Create links on a split sheet (Payouts) or on any anchored file (Payments).
              </span>
            ) : (
              <div className="rows">
                {offers.map((o) => {
                  const to = toOf(o)
                  return to ? (
                    <OfferRow key={o.ref} o={o} payments={payments} to={to} />
                  ) : (
                    <div className="row" key={o.ref}>
                      <span>{o.signed.offer.title}</span>
                      <span className="muted small">split not active</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="glass panel">
            <h3>Incoming</h3>
            {incoming.length === 0 ? (
              <span className="muted small">Nothing yet.</span>
            ) : (
              <div className="rows">
                {incoming.map((p) => (
                  <div className="row" key={p.txId + p.to}>
                    <span className="muted" style={{ fontSize: 14 }}>
                      {formatDateTime(p.time)}
                    </span>
                    <span>
                      {formatAlph(p.amount - p.fee)} ALPH <span className="muted small">· {p.label} · from {shortHash(p.payer, 5, 4)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <FeePanel />
        </div>
      </div>
    </Shell>
  )
}
