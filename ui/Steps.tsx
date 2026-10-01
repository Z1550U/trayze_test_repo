import type { Phase } from './actions'
import { IconCheck } from './icons'

const STEPS: { id: Phase; label: string }[] = [
  { id: 'sign', label: 'Sign with wallet' },
  { id: 'submit', label: 'Submit to network' },
  { id: 'confirm', label: 'Wait for confirmation' }
]

/** Progress of one on-chain action: sign → submit → confirm. Used by initiator and co-signers alike. */
export function Steps({ phase }: { phase?: Phase }) {
  const order: (Phase | undefined)[] = ['sign', 'submit', 'confirm', 'done']
  const current = order.indexOf(phase)
  return (
    <div className="steps" aria-live="polite">
      {STEPS.map((s, i) => {
        const st = i < current ? 'done' : i === current ? 'running' : ''
        return (
          <div key={s.id} className={`step ${st}`}>
            <span className={`ring${st === 'running' ? ' spin' : ''}`}>{st === 'done' && <IconCheck size={13} />}</span>
            {s.label}
          </div>
        )
      })}
    </div>
  )
}
