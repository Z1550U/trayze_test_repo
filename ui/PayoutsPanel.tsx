import { useCallback, useEffect, useMemo, useState } from 'react'
import { bpsToPercent, isInvolved, payoutsOf, sameAddress, type AgreementTerms } from '../core/agreement'
import { DUST, formatAlph, owedOf, payeeForGroup, splitIdOf, splitTermsOf, type SplitTerms } from '../core/split'
import { shortHash } from '../core/format'
import type { FeeInfo, Paid, SplitState } from '../chain/payments'
import { useAnchor } from './useAnchor'
import { usePayments, useOffers } from './usePayments'
import { OfferDialog } from './OfferDialog'
import { PARTY_COLORS } from './colors'

/**
 * The split wallet of a concluded split sheet: activate it, see what came in, withdraw your
 * share, move your payout address, create payment links.
 */
interface Props {
  terms: AgreementTerms
  agreementId: string
  agreed: boolean
  /** Opened from the agreement's "⋯" menu */
  moving: boolean
  setMoving: (v: boolean) => void
}

/** The "Payouts" tab of a split sheet (rendered inside the agreement panel). */
export function PayoutsPanel(props: Props) {
  const { mode, wallet } = useAnchor()
  const payments = usePayments()

  if (mode === 'simulation' || !payments) {
    return (
      <span className="muted small" style={{ lineHeight: 1.55 }}>
        On Alephium, a concluded split sheet can get its own split wallet: payments come in, every party withdraws its share.{mode === 'simulation' ? ' Not available in the simulation.' : ''}
      </span>
    )
  }
  return <Payouts {...props} me={wallet?.address} />
}

function Payouts({ terms, agreementId, agreed, me, moving, setMoving }: Props & { me?: string }) {
  const payments = usePayments()!
  const [split, setSplit] = useState<SplitState | null>()
  const [paid, setPaid] = useState<Paid[]>([])
  const [fee, setFee] = useState<FeeInfo>()
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [version, setVersion] = useState(0)
  const offers = useOffers((o) => o.agreementId === agreementId)

  const derived = useMemo((): { t: SplitTerms; id: string } | { problem: string } => {
    try {
      const t = splitTermsOf(terms, payments.group)
      return { t, id: splitIdOf(payments.id, agreementId, t, payments.group) }
    } catch (e) {
      return { problem: e instanceof Error ? e.message : String(e) }
    }
  }, [terms, agreementId, payments])

  const splitId = 'id' in derived ? derived.id : undefined

  useEffect(() => {
    if (!splitId) return
    let live = true
    void (async () => {
      try {
        const s = await payments.splitState(splitId)
        const [p, f] = await Promise.all([s ? payments.paymentsTo(s.address) : Promise.resolve([]), payments.feeInfo()])
        if (!live) return
        setSplit(s ?? null)
        setPaid(p)
        setFee(f)
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      live = false
    }
  }, [payments, splitId, version])

  const act = useCallback(
    async (label: string, run: () => Promise<string>) => {
      setBusy(label)
      setError('')
      try {
        await payments.confirm(await run())
      } catch (e) {
        const t = e instanceof Error ? e.message : String(e)
        // Someone else activated the same split in the meantime – that is the same split, fine.
        if (!(label === 'activate' && /exist/i.test(t))) setError(/reject|denied|cancel/i.test(t) ? 'Declined in the wallet.' : t)
      } finally {
        setBusy(undefined)
        setVersion((v) => v + 1)
      }
    },
    [payments]
  )

  if ('problem' in derived) {
    return <div className="error">{derived.problem}</div>
  }

  const isParty = isInvolved(terms, me)
  const myIndex = split ? split.payees.findIndex((p) => sameAddress(p, me)) : -1
  const myOwed = split && myIndex >= 0 ? owedOf(split.totalIn, split.shares[myIndex], split.withdrawn[myIndex]) : 0n

  const links = offers.length
  const received = paid.reduce((n, p) => n + p.amount - p.fee, 0n)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {split === undefined ? (
        <span className="muted small">Reading the split wallet…</span>
      ) : split === null ? (
        agreed ? (
          <>
            <span className="muted small" style={{ lineHeight: 1.55 }}>
              Activate a split wallet for exactly these shares. Payments then go in through payment links, and every recipient withdraws its share whenever it wants. The shares can never be changed. One-time deposit: 0.1 ALPH (stays in the contract).
            </span>
            {isParty ? (
              <button className="pill pill-black" style={{ alignSelf: 'flex-start' }} onClick={() => void act('activate', () => payments.createSplit(agreementId, derived.t))} disabled={!!busy}>
                {busy === 'activate' ? 'Activating – confirm in your wallet…' : 'Activate payouts'}
              </button>
            ) : (
              <span className="muted small">{me ? 'Only a party or recipient of this split sheet can activate payouts.' : 'Connect your wallet to activate payouts.'}</span>
            )}
          </>
        ) : (
          <span className="muted small">Payouts can be activated once every party has confirmed.</span>
        )
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div className="figure">
              <span className="label">{myIndex >= 0 ? 'Your share, ready' : 'Received in total'}</span>
              <span className="value" style={{ fontSize: 36 }}>
                {formatAlph(myIndex >= 0 ? myOwed : split.totalIn)}
                <small>ALPH</small>
              </span>
            </div>
            {myIndex >= 0 && (
              <button className="pill pill-black" onClick={() => void act('withdraw', () => payments.withdraw(split.id, myIndex))} disabled={!!busy || myOwed < DUST}>
                {busy === 'withdraw' ? 'Confirm in your wallet…' : 'Withdraw'}
              </button>
            )}
          </div>
          {myOwed > 0n && myOwed < DUST && <span className="muted small">Withdrawals start at 0.001 ALPH.</span>}

          <div className="rows" style={{ marginTop: -6 }}>
            {split.payees.map((payee, i) => {
              const owed = owedOf(split.totalIn, split.shares[i], split.withdrawn[i])
              const party = payoutsOf(terms)[i]
              return (
                <div className="party-status" key={i}>
                  <span className="dot" style={{ background: PARTY_COLORS[i % PARTY_COLORS.length], width: 10, height: 10 }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 15 }}>
                      {party?.name ?? `Recipient ${i + 1}`} · {bpsToPercent(Number(split.shares[i]))} %{i === myIndex && <span className="muted small"> · you</span>}
                    </span>
                    {!sameAddress(payee, party?.address) && <span className="muted small">paid out to {shortHash(payee.replace(/:\d+$/, ''), 5, 4)}</span>}
                  </span>
                  <span className="small" style={{ textAlign: 'right' }}>
                    {formatAlph(owed)} <span className="muted">available · {formatAlph(split.withdrawn[i])} withdrawn</span>
                  </span>
                </div>
              )
            })}
          </div>

          {moving && myIndex >= 0 && (
            <div className="field fade-in">
              <span>New payout address (yours – only you can change it again)</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input mono" style={{ flex: '1 1 260px', fontSize: 13 }} value={newAddress} onChange={(e) => setNewAddress(e.target.value)} spellCheck={false} autoFocus />
                <button
                  className="pill pill-glass"
                  disabled={!!busy || !newAddress.trim()}
                  onClick={() =>
                    void act('move', async () => {
                      const target = payeeForGroup(newAddress, payments.group)
                      return payments.setPayee(split.id, myIndex, target)
                    }).then(() => setMoving(false))
                  }
                >
                  {busy === 'move' ? 'Saving…' : 'Save'}
                </button>
                <button className="pill pill-ghost" onClick={() => setMoving(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="row" style={{ borderTop: '1px solid var(--hairline)', borderBottom: 0, paddingTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span>Payment links</span>
              <span className="muted small">
                {links ? `${links} ${links === 1 ? 'link' : 'links'}` : 'none created here'} · {formatAlph(received)} ALPH received
              </span>
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              {isParty && (
                <button className="pill pill-ghost pill-small" onClick={() => setDialog(true)}>
                  New link
                </button>
              )}
              <a className="pill pill-ghost pill-small" href="#/earnings" style={{ color: 'var(--ink)' }}>
                Earnings
              </a>
            </span>
          </div>

          <span className="muted small" style={{ lineHeight: 1.5 }}>
            Split wallet <span className="mono">{shortHash(split.address, 6, 6)}</span>. Shares are fixed forever. If a recipient loses access to its wallet, its share stays in the split – nobody, not even trayze, can move it.
          </span>
        </>
      )}

      {error && <div className="error">{error}</div>}
      {dialog && <OfferDialog target={{ kind: 'split', terms, agreementId }} title={terms.title} fileHash={terms.file.sha256} feeBps={fee?.feeBps} group={payments.group} onClose={() => setDialog(false)} />}
    </div>
  )
}
