import { useEffect, useMemo, useRef, useState } from 'react'
import { agreementId, bpsToPercent, decodeTerms, encodeTerms, STATE_LABEL, type AgreementTerms, sameAddress, payoutsOf } from '../core/agreement'
import { hashFile } from '../core/hash'
import { formatDateTime, formatSize, shortHash } from '../core/format'
import { CATEGORY_LABEL } from '../core/detect'
import { useAnchor } from '../ui/useAnchor'
import { useAgreement } from '../ui/useAgreement'
import { useData, download, safeFileName } from '../ui/helpers'
import { respondToAgreement, inviteLink, type Phase } from '../ui/actions'
import { Steps } from '../ui/Steps'
import { DocumentStack } from '../ui/DocumentStack'
import { SplitBar } from '../ui/SplitBar'
import { PARTY_COLORS } from '../ui/colors'
import { IconCheck, IconUpload } from '../ui/icons'
import { SimulationAnchor } from '../chain/simulation'
import { pingAgreements, watchAgreement } from '../ui/noticeStore'
import { PayoutsPanel } from '../ui/PayoutsPanel'
import { MoreMenu } from '../ui/MoreMenu'

const STATE_COLOR: Record<string, string> = {
  agreed: 'var(--sage)',
  pending: 'var(--taupe)',
  declined: 'var(--warn)',
  expired: 'var(--warn)',
  invalid: 'var(--warn)',
  unproposed: 'var(--ink-2)'
}

export function AgreementView({ payload, openProject }: { payload: string; openProject: (id: string, entry?: string) => void }) {
  const terms = useMemo(() => decodeTerms(payload), [payload])
  const [id, setId] = useState<string>()
  useEffect(() => {
    if (terms) void agreementId(terms).then(setId)
  }, [terms])

  if (!terms) {
    return (
      <section className="glass empty fade-in">
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 450 }}>This link is not a valid agreement.</h2>
        <span className="muted">It may be incomplete – ask the sender for the full link.</span>
      </section>
    )
  }
  return id ? <Agreement terms={terms} id={id} openProject={openProject} /> : null
}

function Agreement({ terms, id, openProject }: { terms: AgreementTerms; id: string; openProject: (id: string, entry?: string) => void }) {
  const { anchor, mode, walletConnected } = useAnchor()
  const { entries, projects } = useData()
  const { status, refresh } = useAgreement(anchor, id, terms)

  const me = anchor.owner()
  const isParty = (a?: string) => !!a && terms.parties.some((p) => sameAddress(p.address, a))
  // Simulation only: act as any party to try the whole flow in one browser
  const [actingAs, setActingAs] = useState<string | undefined>(() =>
    mode === 'simulation' ? terms.parties.find((p) => !sameAddress(p.address, terms.initiator))?.address : isParty(me) ? me : undefined
  )
  const actor = mode === 'simulation' ? actingAs : me
  const actorAnchor = mode === 'simulation' && actingAs && anchor instanceof SimulationAnchor ? anchor.as(actingAs) : anchor

  const [check, setCheck] = useState<'same' | 'different' | 'running'>()
  const [busy, setBusy] = useState<'confirm' | 'decline'>()
  const [phase, setPhase] = useState<Phase>()
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [tabChoice, setTab] = useState<'sig' | 'pay'>()
  const [moving, setMoving] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // Opening an agreement means you want to hear when others respond.
  useEffect(() => {
    void watchAgreement(terms, id)
  }, [terms, id])

  const own = entries.find((e) => e.agreement?.id === id)
  const ownProject = own ? projects.find((p) => p.id === own.projectId) : undefined
  const actorStatus = status?.parties.find((p) => sameAddress(p.address, actor))
  const canRespond = !!actor && actorStatus?.status === 'pending' && status?.state === 'pending'

  const checkFile = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setCheck('running')
    setCheck((await hashFile(f)) === terms.file.sha256 ? 'same' : 'different')
  }

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'confirm' : 'decline')
    setError('')
    try {
      await respondToAgreement(actorAnchor, id, accept, setPhase)
      await refresh()
      pingAgreements()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(undefined)
      setPhase(undefined)
    }
  }

  const copyLink = async () => {
    const link = inviteLink(terms, encodeTerms)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('Copy this link', link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const state = status?.state
  const others = terms.parties.length
  // Once a split sheet is agreed, its money is what people come for.
  const tab = tabChoice ?? (terms.splits && state === 'agreed' ? 'pay' : 'sig')

  return (
    <div className="stage fade-in">
      <div className="stage-left">
        <div>
          <p className="eyebrow">Agreement · {terms.splits ? 'split sheet' : 'co-signed entry'}</p>
          <h1 className="title">
            {terms.title}
            <span className="grey">{state ? STATE_LABEL[state] : 'Loading…'}</span>
          </h1>
        </div>
        <DocumentStack
          sheets={[{ key: id, name: terms.file.name ?? terms.title, category: terms.file.category, kindLabel: CATEGORY_LABEL[terms.file.category], size: terms.file.size }]}
          hash={terms.file.sha256}
          sealed={state === 'agreed'}
          unmatched={state === 'declined' || state === 'expired' || state === 'invalid'}
        />
        <div className="note" style={{ alignItems: 'center' }}>
          <span style={{ flexGrow: 1 }}>
            {check === 'same' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
                <IconCheck size={16} /> Your copy is exactly this file.
              </span>
            ) : check === 'different' ? (
              <span className="chain-break">Your copy is not the same file – don't confirm before clarifying.</span>
            ) : check === 'running' ? (
              'Computing fingerprint…'
            ) : (
              'Check your own copy of the file before you confirm. It is only read locally.'
            )}
          </span>
          <button className="pill pill-glass pill-small" onClick={() => input.current?.click()}>
            <IconUpload size={16} /> Check my copy
          </button>
          <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void checkFile(e.target.files)} />
        </div>
      </div>

      <section className="glass panel fade-in" style={{ alignSelf: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {terms.splits ? (
            <div className="segment" role="tablist" aria-label="Agreement">
              <button role="tab" aria-selected={tab === 'sig'} onClick={() => setTab('sig')}>
                Signatures{status ? ` · ${status.confirmed}/${others}` : ''}
              </button>
              <button role="tab" aria-selected={tab === 'pay'} onClick={() => setTab('pay')}>
                Payouts
              </button>
            </div>
          ) : (
            <h3 style={{ flexGrow: 1 }}>{status ? `${status.confirmed} of ${others} confirmed` : 'Reading the registry…'}</h3>
          )}
          <MoreMenu
            items={[
              { label: 'Copy invite link', onClick: () => void copyLink() },
              { label: 'Download agreement file', onClick: () => download(`agreement-${safeFileName(terms.title)}.json`, JSON.stringify(terms, null, 2)) },
              ...(own && ownProject ? [{ label: `Open in ${ownProject.name}`, onClick: () => openProject(ownProject.id, own.id) }] : []),
              ...(terms.splits && state === 'agreed' && mode === 'alephium'
                ? [
                    {
                      label: 'Change my payout address',
                      onClick: () => {
                        setTab('pay')
                        setMoving(true)
                      }
                    }
                  ]
                : [])
            ]}
          />
        </div>
        {copied && <span className="small">Invite link copied.</span>}

        {tab === 'pay' ? (
          <PayoutsPanel terms={terms} agreementId={id} agreed={state === 'agreed'} moving={moving} setMoving={setMoving} />
        ) : (
          <>
            {state && (
              <span className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: -6 }}>
                <span className={`dot${state === 'pending' ? ' pulse' : ''}`} style={{ background: STATE_COLOR[state] }} />
                {STATE_LABEL[state]}
                {status?.agreedAt ? <span className="muted"> · on chain {formatDateTime(status.agreedAt)}</span> : null}
              </span>
            )}

            {terms.splits && <SplitBar parties={payoutsOf(terms)} caption={terms.payees ? 'Paid out to – confirmed by the parties below, recipients don’t sign' : undefined} />}

            <div className="rows" style={{ marginTop: -6 }}>
              {(status?.parties ?? terms.parties.map((p) => ({ ...p, status: 'pending' as const, time: undefined }))).map((p, i) => (
                <div className="party-status" key={p.address}>
                  <span className="dot" style={{ background: PARTY_COLORS[i % PARTY_COLORS.length], width: 10, height: 10 }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 15 }}>
                      {p.name}
                      {sameAddress(p.address, actor) && <span className="muted small"> · {mode === 'simulation' ? 'acting as' : 'you'}</span>}
                    </span>
                    <span className="muted small">
                      {[p.role, p.shareBps !== undefined ? `${bpsToPercent(p.shareBps)} %` : undefined].filter(Boolean).join(' · ')}
                      <span className="mono" style={{ fontSize: 11.5, marginLeft: 6 }}>
                        {shortHash(p.address, 5, 4)}
                      </span>
                    </span>
                  </span>
                  <span className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textAlign: 'right' }}>
                    <span className="dot" style={{ background: p.status === 'confirmed' ? 'var(--sage)' : p.status === 'declined' ? 'var(--warn)' : 'var(--line)' }} />
                    {p.status === 'confirmed' ? (sameAddress(p.address, terms.initiator) ? 'proposed' : 'confirmed') : p.status}
                    {p.time && p.status !== 'pending' ? <span className="muted"> · {formatDateTime(p.time)}</span> : null}
                  </span>
                </div>
              ))}
            </div>

            <div className="rows">
              <div className="row">
                <span>Deadline</span>
                <span>{formatDateTime(terms.deadline)}</span>
              </div>
              <div className="row">
                <span>File</span>
                <span>
                  {CATEGORY_LABEL[terms.file.category]} · {formatSize(terms.file.size)}
                </span>
              </div>
              <div className="row">
                <span>Agreement ID</span>
                <span className="mono">{shortHash(id, 8, 6)}</span>
              </div>
            </div>

            {mode === 'simulation' && (
              <div className="field">
                <span>Simulation · act as</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {terms.parties.map((p) => (
                    <button key={p.address} className="chip" aria-pressed={actingAs === p.address} onClick={() => setActingAs(p.address)}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="error">{error}</div>}

            {busy ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span className="small" style={{ color: 'var(--ink)' }}>
                  {busy === 'confirm' ? (terms.splits ? 'Confirming the split…' : 'Confirming…') : 'Declining…'}
                </span>
                <Steps phase={phase} />
              </div>
            ) : canRespond ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="pill pill-black" onClick={() => void respond(true)} disabled={!!busy}>
                  <span className="knob">
                    <IconCheck size={16} />
                  </span>
                  {terms.splits ? 'Confirm split' : 'Confirm'}
                </button>
                <button className="pill pill-ghost" onClick={() => void respond(false)} disabled={!!busy}>
                  Decline
                </button>
                {check !== 'same' && <span className="muted small">Tip: check your copy first.</span>}
              </div>
            ) : (
              <span className="muted small" style={{ lineHeight: 1.5 }}>
                {mode === 'alephium' && !walletConnected
                  ? 'Connect your wallet (top right) to respond.'
                  : actor && !isParty(actor)
                    ? `The connected address ${shortHash(actor, 5, 4)} is not a party of this agreement.`
                    : actorStatus && actorStatus.status !== 'pending'
                      ? `${actorStatus.name} has ${sameAddress(actorStatus.address, terms.initiator) ? 'proposed' : actorStatus.status} this agreement.`
                      : state === 'expired'
                        ? 'The deadline has passed – this agreement can no longer be concluded.'
                        : ''}
              </span>
            )}
          </>
        )}
      </section>
    </div>
  )
}
