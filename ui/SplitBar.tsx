import type { Party } from '../core/agreement'
import { bpsToPercent } from '../core/agreement'
import { PARTY_COLORS } from './colors'

/** Horizontal bar showing each recipient's share (the parties, or the separate payout recipients). */
export function SplitBar({ parties, caption }: { parties: Party[]; caption?: string }) {
  const total = parties.reduce((a, p) => a + (p.shareBps ?? 0), 0)
  return (
    <div className="split">
      {caption && <span className="muted small">{caption}</span>}
      <div className="split-bar" role="img" aria-label={parties.map((p) => `${p.name || 'Unnamed'} ${bpsToPercent(p.shareBps)} %`).join(', ')}>
        {parties.map((p, i) =>
          (p.shareBps ?? 0) > 0 ? <span key={i} style={{ flexGrow: p.shareBps, background: PARTY_COLORS[i % PARTY_COLORS.length] }} /> : null
        )}
        {total < 10_000 && <span style={{ flexGrow: 10_000 - total, background: 'transparent' }} />}
      </div>
      <div className="split-legend">
        {parties.map((p, i) => (
          <span key={i}>
            <span className="dot" style={{ background: PARTY_COLORS[i % PARTY_COLORS.length] }} />
            {p.name || 'Unnamed'} <span className="muted">{bpsToPercent(p.shareBps) || 0} %</span>
          </span>
        ))}
      </div>
    </div>
  )
}
