import { agreementId as computeId, type AgreementTerms } from '../core/agreement'
import type { Snapshot } from '../core/notices'

/** Persistent state of the notice watcher: what was already shown, which invites to watch. */
const KEY = 'trayze.notify.v1'
export const AGREEMENTS_EVENT = 'trayze:agreements'

interface Saved {
  seen: Record<string, Snapshot>
  watch: Record<string, AgreementTerms>
  system?: boolean
}

export function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as Saved
    return { seen: s.seen ?? {}, watch: s.watch ?? {}, system: s.system }
  } catch {
    return { seen: {}, watch: {} }
  }
}

export function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or blocked – notices still work for this session */
  }
}

/** Keep an eye on an agreement you were invited to (called when you open or answer it). */
export async function watchAgreement(terms: AgreementTerms, id?: string) {
  const s = load()
  const key = id ?? (await computeId(terms))
  if (!s.watch[key]) {
    s.watch[key] = terms
    save(s)
  }
}

/** Ask the watcher to look now instead of waiting for the next poll. */
export const pingAgreements = () => window.dispatchEvent(new Event(AGREEMENTS_EVENT))

export const systemNoticesEnabled = () => !!load().system && typeof Notification !== 'undefined' && Notification.permission === 'granted'

export async function setSystemNotices(on: boolean): Promise<boolean> {
  if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission()
    if (p !== 'granted') on = false
  }
  const s = load()
  s.system = on
  save(s)
  return on
}
