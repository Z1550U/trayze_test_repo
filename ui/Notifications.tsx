import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnchor } from './useAnchor'
import { useData } from './helpers'
import { IconClose, IconUsers } from './icons'
import { encodeTerms, evaluate, type AgreementTerms } from '../core/agreement'
import { AGREEMENTS_EVENT, load, save } from './noticeStore'
import { diffNotices, snapshotOf, type Notice } from '../core/notices'

/**
 * Short in-app notices when another party signs or declines a co-signed entry.
 * Watches the agreements you proposed (your entries) and the ones you opened via an invite link.
 * What was already shown is remembered per network, so changes that happened while the app
 * was closed are reported on the next visit – once.
 */
const POLL_MS = 15_000
const SHOW_MS = 9_000
const MAX_VISIBLE = 3

interface Shown extends Notice {
  link: string
}

export function NotificationCenter() {
  const { anchor } = useAnchor()
  const { entries } = useData()
  const [shown, setShown] = useState<Shown[]>([])
  const running = useRef(false)
  const done = useRef(new Set<string>()) // agreements already final on this network – no more polling

  const check = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      const saved = load()
      const all = new Map<string, AgreementTerms>(Object.entries(saved.watch))
      for (const e of entries) if (e.agreement) all.set(e.agreement.id, e.agreement.terms)

      const me = anchor.owner()
      const fresh: Shown[] = []
      for (const [id, terms] of all) {
        const seenKey = `${anchor.scope}:${id}`
        if (done.current.has(seenKey)) continue
        let status
        try {
          status = evaluate(terms, id, await anchor.agreementEvents(id))
        } catch {
          continue // node unreachable – try again next round
        }
        if (status.state === 'unproposed') continue
        const notices = diffNotices(terms, id, saved.seen[seenKey], status, me)
        const link = `#/agreement/${encodeTerms(terms)}`
        fresh.push(...notices.map((n) => ({ ...n, link })))
        saved.seen[seenKey] = snapshotOf(status)
        if (status.state !== 'pending') done.current.add(seenKey)
      }
      save(saved)

      if (fresh.length) {
        setShown((cur) => [...cur.filter((c) => !fresh.some((f) => f.key === c.key)), ...fresh.sort((a, b) => a.time - b.time)])
        if (saved.system && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          for (const n of fresh.slice(-MAX_VISIBLE)) new Notification(`trayze · ${n.title}`, { body: n.text, tag: n.key, icon: '/favicon.svg' })
        }
      }
    } finally {
      running.current = false
    }
  }, [anchor, entries])

  useEffect(() => {
    void check()
    const t = setInterval(() => void check(), POLL_MS)
    const now = () => void check()
    window.addEventListener(AGREEMENTS_EVENT, now)
    window.addEventListener('focus', now)
    return () => {
      clearInterval(t)
      window.removeEventListener(AGREEMENTS_EVENT, now)
      window.removeEventListener('focus', now)
    }
  }, [check])

  const dismiss = (key: string) => setShown((cur) => cur.filter((n) => n.key !== key))

  // Auto-hide: each notice stays for a few seconds after it becomes visible.
  const visible = shown.slice(-MAX_VISIBLE)
  const hidden = shown.length - visible.length
  const oldest = visible[0]?.key
  useEffect(() => {
    if (!oldest) return
    const t = setTimeout(() => dismiss(oldest), SHOW_MS)
    return () => clearTimeout(t)
  }, [oldest])

  if (visible.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {hidden > 0 && (
        <button className="toast-more small" onClick={() => setShown(visible)}>
          +{hidden} earlier · dismiss
        </button>
      )}
      {visible.map((n) => (
        <div key={n.key} className="toast glass fade-in">
          <a
            href={n.link}
            className="toast-body"
            onClick={() => dismiss(n.key)}
          >
            <span className="toast-icon" style={{ color: TONE[n.kind] }}>
              <IconUsers size={16} />
              <span className="dot" style={{ background: TONE[n.kind] }} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14.5, fontWeight: 450 }}>{n.text}</span>
              <span className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.title}
              </span>
            </span>
          </a>
          <button className="search-clear" onClick={() => dismiss(n.key)} aria-label="Dismiss">
            <IconClose size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}

const TONE: Record<Notice['kind'], string> = {
  confirmed: 'var(--sage)',
  agreed: 'var(--sage)',
  declined: 'var(--warn)',
  expired: 'var(--warn)'
}
