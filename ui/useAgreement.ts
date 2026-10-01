import { useCallback, useEffect, useState } from 'react'
import type { Anchor } from '../chain/anchor'
import { evaluate, type AgreementStatus, type AgreementTerms } from '../core/agreement'

/** Loads the registry events of an agreement and derives its status; refreshes every 15 s. */
export function useAgreement(anchor: Anchor, id: string | undefined, terms: AgreementTerms | undefined) {
  const [status, setStatus] = useState<AgreementStatus>()

  const refresh = useCallback(async () => {
    if (!id || !terms) return
    const events = await anchor.agreementEvents(id)
    setStatus(evaluate(terms, id, events))
  }, [anchor, id, terms])

  useEffect(() => {
    const run = () => refresh().catch(() => undefined) // node unreachable – keep the last known status
    void run()
    const t = setInterval(run, 15_000)
    return () => clearInterval(t)
  }, [refresh])

  return { status, refresh }
}
