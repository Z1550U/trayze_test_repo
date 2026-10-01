import { useEffect, useState } from 'react'
import { sameAddress } from '../core/agreement'
import { DUST, formatAlph } from '../core/split'
import type { FeeInfo } from '../chain/payments'
import { useAnchor } from './useAnchor'
import { usePayments } from './usePayments'

/** Only visible to the fee recipient: the collected trayze fees and a withdraw button. */
export function FeePanel() {
  const { wallet } = useAnchor()
  const payments = usePayments()
  const [fee, setFee] = useState<FeeInfo>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    void payments
      ?.feeInfo()
      .then((f) => live && setFee(f))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [payments, version])

  if (!payments || !wallet || !fee || !sameAddress(wallet.address, fee.feeRecipient)) return null

  const withdraw = async () => {
    setBusy(true)
    setMessage('')
    try {
      await payments.confirm(await payments.withdrawFees())
      setMessage('Fees withdrawn.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setVersion((v) => v + 1)
    }
  }

  return (
    <section className="glass panel" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h3>trayze fees</h3>
        <span className="muted small">{message || `${formatAlph(fee.feesAccrued)} ALPH collected`}</span>
      </span>
      <button className="pill pill-ghost pill-small" onClick={() => void withdraw()} disabled={busy || fee.feesAccrued < DUST}>
        {busy ? 'Withdrawing…' : 'Withdraw'}
      </button>
    </section>
  )
}
