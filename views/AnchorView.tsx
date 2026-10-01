import { useEffect, useMemo, useState } from 'react'
import { analyze } from '../core/metadata'
import { hashFile } from '../core/hash'
import { formatSize, shortHash, formatDateTime } from '../core/format'
import { STAGES, type FileAnalysis, type Entry, type Stage } from '../core/types'
import { proofBundle } from '../core/manifest'
import { CATEGORY_LABEL } from '../core/detect'
import { DocumentStack, type StackSheet } from '../ui/DocumentStack'
import { IconArrow, IconDownload, IconLock, IconPlus, IconClose, IconCopy, IconUsers } from '../ui/icons'
import { SplitBar } from '../ui/SplitBar'
import { payeeProblem } from '../core/split'
import { config, paymentsConfigured } from '../chain/config'
import { groupOfAddress, isValidAddress } from '@alephium/web3'
import { validateTerms, percentToBps, bpsToPercent, encodeTerms, type Party, sameAddress, normAddress, payoutsOf, MAX_PAYEES } from '../core/agreement'
import { simulatedAddress } from '../chain/simulation'
import { useAnchor } from '../ui/useAnchor'
import { useData, download, safeFileName } from '../ui/helpers'
import { anchorEntry, createProject, proposeAgreement, inviteLink, type Phase } from '../ui/actions'
import { Steps } from '../ui/Steps'
import { worksOf } from '../core/works'

type State = 'empty' | 'reading' | 'review' | 'anchoring' | 'done'
const NEW = '__new__'

interface Props {
  preselect?: string
  /** File (work id) and version (entry id) to build on – from "New version" in a file */
  preselectWork?: string
  preselectParent?: string
  openProject: (id: string, entry?: string) => void
}

/** Deadline timestamp – computed when the user submits, not during render. */
const deadlineIn = (days: number) => Date.now() + days * 86_400_000

export function AnchorView({ preselect, preselectWork, preselectParent, openProject }: Props) {
  const { anchor, mode, walletConnected } = useAnchor()
  const { projects, entries } = useData()

  const [queue, setQueue] = useState<File[]>([])
  const [index, setIndex] = useState(0)
  const [state, setState] = useState<State>('empty')
  const [progress, setProgress] = useState(0)
  const [analysis, setAnalysis] = useState<FileAnalysis>()
  const [hash, setHash] = useState('')

  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(preselect ?? projects[0]?.id ?? NEW)
  const [newProject, setNewProject] = useState('')
  const [workId, setWorkId] = useState(preselectWork ?? NEW)
  const [newWork, setNewWork] = useState('')
  const [parentId, setParentId] = useState(preselectParent ?? '')
  const [stage, setStage] = useState<Stage>('wip')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeFileName, setIncludeFileName] = useState(true)

  // Co-signing
  const [cosign, setCosign] = useState(false)
  const [splits, setSplits] = useState(true)
  const [deadlineDays, setDeadlineDays] = useState(14)
  const [rows, setRows] = useState<PartyRow[]>([{ name: '', role: '', address: '', share: '100' }])
  // Separate payout recipients (freelancers …): they are paid, the parties above sign.
  const [payOthers, setPayOthers] = useState(false)
  const [payeeRows, setPayeeRows] = useState<PartyRow[]>([])

  const [phase, setPhase] = useState<Phase>()
  const [error, setError] = useState('')
  const [result, setResult] = useState<Entry>()

  const file = queue[index]

  // Read the file: detect its kind, metadata and fingerprint
  // Everything from the previous file is cleared where the file changes (the handlers below);
  // the effect itself only does the asynchronous reading.
  const resetForFile = () => {
    setState('reading')
    setProgress(0)
    setHash('')
    setAnalysis(undefined)
    setError('')
    setResult(undefined)
    setPhase(undefined)
  }

  useEffect(() => {
    if (!file) return
    let cancelled = false
    void (async () => {
      const [a, h] = await Promise.all([analyze(file), hashFile(file, (p) => !cancelled && setProgress(p))])
      if (cancelled) return
      setAnalysis(a)
      setHash(h)
      setTitle(a.suggestedTitle)
      setSelected(new Set(a.meta.filter((m) => !m.sensitive).map((m) => m.key)))
      setNote('')
      setState('review')
    })()
    return () => {
      cancelled = true
    }
  }, [file])

  const addFiles = (list: FileList) => {
    if (list.length === 0) return
    resetForFile()
    setQueue(Array.from(list))
    setIndex(0)
  }

  const projectName0 = projects.find((p) => p.id === projectId)?.name
  const works = useMemo(() => (projectId === NEW ? [] : worksOf(entries.filter((e) => e.projectId === projectId), projectName0)), [entries, projectId, projectName0])
  const work = works.find((w) => w.id === workId)
  const parent = work ? (work.versions.find((v) => v.id === parentId) ?? work.latest) : undefined
  const placement = work && parent ? { parent: parent.manifestHash, work: work.name } : { parent: '', work: newWork.trim() || title.trim() }

  const projectValid = projectId !== NEW || newProject.trim().length > 1
  const ready = anchor.ready()
  const me = anchor.owner() ?? ''
  const separate = splits && payOthers
  const parties: Party[] = rows.map((r, i) => ({ name: r.name, role: r.role, address: i === 0 ? me : r.address, shareBps: splits && !separate ? percentToBps(r.share) ?? -1 : undefined }))
  const payees: Party[] | undefined = separate ? payeeRows.map((r) => ({ name: r.name, role: r.role, address: r.address, shareBps: percentToBps(r.share) ?? -1 })) : undefined
  const cosignErrors = cosign ? validateTerms({ parties, splits, initiator: me, payees }) : []
  // Split wallets live in one group: warn early if a recipient's address could never receive payouts.
  const payoutWarnings =
    cosign && splits && mode === 'alephium' && paymentsConfigured()
      ? payoutsOf({ parties, payees })
          .filter((p) => p.address.trim() && isValidAddress(normAddress(p.address)) && payeeProblem(p.address, groupOfAddress(config.payments)))
          .map((p) => `${p.name || (separate ? 'A recipient' : 'A party')} can't receive payouts with this address: ${payeeProblem(p.address, groupOfAddress(config.payments))}`)
      : []
  const canAnchor = state === 'review' && title.trim().length > 0 && projectValid && ready && cosignErrors.length === 0

  const updateRow = (i: number, patch: Partial<PartyRow>) => setRows((old) => old.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRow = () =>
    setRows((old) => {
      const next = [...old, { name: '', role: '', address: mode === 'simulation' ? simulatedAddress() : '', share: '' }]
      // Suggest an even split for new rows
      const even = Math.floor(10_000 / next.length)
      return next.map((r, i) => ({ ...r, share: bpsToPercent(i === 0 ? 10_000 - even * (next.length - 1) : even) }))
    })
  const removeRow = (i: number) => setRows((old) => old.filter((_, j) => j !== i))

  const evenShares = (list: PartyRow[]) => {
    const even = Math.floor(10_000 / list.length)
    return list.map((r, i) => ({ ...r, share: bpsToPercent(i === 0 ? 10_000 - even * (list.length - 1) : even) }))
  }
  const newPayee = (): PartyRow => ({ name: '', role: '', address: mode === 'simulation' ? simulatedAddress() : '', share: '' })
  const updatePayee = (i: number, patch: Partial<PartyRow>) => setPayeeRows((old) => old.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addPayee = () => setPayeeRows((old) => evenShares([...old, newPayee()]))
  const removePayee = (i: number) => setPayeeRows((old) => (old.length > 2 ? evenShares(old.filter((_, j) => j !== i)) : old))
  const togglePayOthers = () => {
    if (!payOthers && payeeRows.length === 0) setPayeeRows(evenShares([newPayee(), newPayee()]))
    setPayOthers((v) => !v)
  }

  const submit = async () => {
    if (!analysis || !hash) return
    setState('anchoring')
    setError('')
    try {
      let pid = projectId
      if (pid === NEW) {
        const p = await createProject(anchor, newProject)
        pid = p.id
        setProjectId(p.id)
        setNewProject('')
      }
      const base = { analysis, fileHash: hash, title, stage, projectId: pid, note, selected, includeFileName, ...(pid === projectId ? placement : { parent: '', work: newWork.trim() || title.trim() }) }
      const e = cosign
        ? await proposeAgreement(anchor, { ...base, parties, splits, payees, deadline: deadlineIn(deadlineDays) }, setPhase)
        : await anchorEntry(anchor, base, setPhase)
      setResult(e)
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('review')
      setPhase(undefined)
    }
  }

  const next = () => {
    if (index + 1 < queue.length) {
      resetForFile()
      setIndex(index + 1)
    } else {
      setQueue([])
      setIndex(0)
      setAnalysis(undefined)
      setState('empty')
    }
  }

  const projectName = useMemo(() => projects.find((p) => p.id === (result?.projectId ?? projectId))?.name, [projects, result, projectId])

  const sheets: StackSheet[] = queue.slice(index).map((f, i) => ({
    key: `${index + i}-${f.name}`,
    name: i === 0 && analysis ? f.name : f.name,
    category: i === 0 ? analysis?.kind.category : undefined,
    kindLabel: i === 0 ? analysis?.kind.label : undefined,
    size: f.size
  }))

  return (
    <div className="stage fade-in">
      <div className="stage-left">
        <div>
          <p className="eyebrow">New proof</p>
          <h1 className="title">
            {state === 'done' ? 'Anchored' : 'Add to'}
            <span className="grey">{state === 'done' ? 'Unaltered since.' : 'your trail'}</span>
          </h1>
        </div>
        <DocumentStack
          sheets={state === 'empty' ? [] : sheets}
          progress={state === 'reading' ? progress : undefined}
          hash={hash || undefined}
          sealed={state === 'done'}
          onFiles={state === 'empty' ? addFiles : undefined}
          dropTitle="Drop files here"
          dropHint="any kind · or click to choose"
        />
        {state === 'empty' ? (
          <div className="note">
            <IconLock size={18} />
            <span>Your files never leave this device. Only their fingerprint is computed.</span>
          </div>
        ) : (
          <div className="figures">
            <div className="figure">
              <span className="label">Metadata</span>
              <span className="value">
                {analysis ? analysis.meta.length : '–'}
                <small>found</small>
              </span>
            </div>
            {queue.length > 1 && (
              <div className="figure">
                <span className="label">File</span>
                <span className="value">
                  {index + 1}
                  <small>of {queue.length}</small>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        {state === 'empty' && <HowItWorks />}

        {(state === 'reading' || state === 'review' || state === 'anchoring') && (
          <section className="glass panel fade-in" aria-busy={state !== 'review'}>
            <label className="field">
              <span>Title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={state !== 'review'} placeholder="What is this version called?" />
            </label>

            <label className="field">
              <span>Project</span>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={state !== 'review'}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={NEW}>+ New project…</option>
              </select>
            </label>
            {projectId === NEW && (
              <label className="field fade-in">
                <span>Name of the new project</span>
                <input className="input" value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="e.g. Northern Light · Score" disabled={state !== 'review'} />
              </label>
            )}

            {projectId !== NEW && works.length > 0 && (
              <label className="field">
                <span>File</span>
                <select
                  className="input"
                  value={work ? work.id : NEW}
                  onChange={(e) => {
                    setWorkId(e.target.value)
                    setParentId('')
                  }}
                  disabled={state !== 'review'}
                >
                  {works.map((w) => (
                    <option key={w.id} value={w.id}>
                      New version of: {w.name} ({w.versions.length})
                    </option>
                  ))}
                  <option value={NEW}>+ New file in this project…</option>
                </select>
              </label>
            )}
            {work && work.versions.length > 1 && (
              <label className="field fade-in">
                <span>Builds on</span>
                <select className="input" value={parent?.id} onChange={(e) => setParentId(e.target.value)} disabled={state !== 'review'}>
                  {[...work.versions].reverse().map((v, i) => (
                    <option key={v.id} value={v.id}>
                      {v.title} · {STAGES.find((s) => s.id === v.stage)?.label}
                      {i === 0 ? ' (latest)' : ' – starts a branch'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!work && (
              <label className="field fade-in">
                <span>Name of the file · private</span>
                <input className="input" value={newWork} onChange={(e) => setNewWork(e.target.value)} placeholder={title || 'e.g. Poster A1'} disabled={state !== 'review'} />
              </label>
            )}

            <div className="field">
              <span>Stage</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STAGES.map((s) => (
                  <button key={s.id} type="button" className="chip" aria-pressed={stage === s.id} onClick={() => setStage(s.id)} disabled={state !== 'review'}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <div className="meta-row" style={{ borderBottom: 0, padding: 0 }}>
                <div className="text">
                  <span style={{ color: 'var(--ink)', fontSize: 15 }}>
                    <IconUsers size={18} /> Co-sign with others
                  </span>
                  <span className="muted" style={{ fontSize: 13, whiteSpace: 'normal' }}>
                    Every party confirms with their own wallet. The entry only counts once all have agreed.
                  </span>
                </div>
                <button type="button" role="switch" aria-checked={cosign} aria-label="Co-sign with others" className="switch" onClick={() => setCosign((v) => !v)} disabled={state !== 'review'} />
              </div>
            </div>

            {cosign && (
              <div className="field fade-in" style={{ gap: 14 }}>
                <span>Parties</span>
                {rows.map((r, i) => (
                  <div className="party-block" key={i}>
                    <div className="party-row">
                      <input className="input" value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} placeholder={i === 0 ? 'Your name' : 'Name'} aria-label="Name" />
                      <input className="input role" value={r.role} onChange={(e) => updateRow(i, { role: e.target.value })} placeholder="Role, e.g. Composition" aria-label="Role" />
                      {splits && !separate ? (
                        <span className="share-input">
                          <input className="input" inputMode="decimal" value={r.share} onChange={(e) => updateRow(i, { share: e.target.value })} aria-label="Share in percent" />
                        </span>
                      ) : (
                        <span />
                      )}
                      {i === 0 ? (
                        <span className="small muted" style={{ textAlign: 'center' }}>
                          you
                        </span>
                      ) : (
                        <button type="button" className="icon-btn" onClick={() => removeRow(i)} aria-label="Remove party">
                          <IconClose size={16} />
                        </button>
                      )}
                    </div>
                    <div className="party-address">
                      {i === 0 ? (
                        <span className="mono muted" style={{ fontSize: 12 }}>
                          {me ? shortHash(me, 10, 8) : 'connect your wallet'}
                        </span>
                      ) : (
                        <input className="input mono" style={{ fontSize: 12.5 }} value={r.address} onChange={(e) => updateRow(i, { address: e.target.value })} placeholder="Alephium address" aria-label="Alephium address" />
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="pill pill-ghost pill-small" onClick={addRow}>
                    <IconPlus size={16} /> Add party
                  </button>
                  {mode === 'simulation' && <span className="muted small">Simulation: new parties get a demo address.</span>}
                </div>

                <div className="meta-row" style={{ borderBottom: 0 }}>
                  <div className="text">
                    <span style={{ color: 'var(--ink)', fontSize: 15 }}>Split sheet</span>
                    <span className="muted" style={{ fontSize: 13, whiteSpace: 'normal' }}>
                      Record the shares of any future payouts. Everyone confirms exactly these numbers.
                    </span>
                  </div>
                  <button type="button" role="switch" aria-checked={splits} aria-label="Record shares" className="switch" onClick={() => setSplits((v) => !v)} />
                </div>

                {splits && (
                  <div className="meta-row" style={{ borderBottom: 0, paddingTop: 0 }}>
                    <div className="text">
                      <span style={{ color: 'var(--ink)', fontSize: 15 }}>Pay out to others</span>
                      <span className="muted" style={{ fontSize: 13, whiteSpace: 'normal' }}>
                        E.g. your freelancers. They don't sign – the parties above confirm who gets what. Recipients are listed openly in the split sheet.
                      </span>
                    </div>
                    <button type="button" role="switch" aria-checked={payOthers} aria-label="Pay out to others" className="switch" onClick={togglePayOthers} />
                  </div>
                )}

                {separate && (
                  <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <span className="small" style={{ color: 'var(--ink)' }}>
                      Recipients
                    </span>
                    {payeeRows.map((r, i) => (
                      <div className="party-block" key={i}>
                        <div className="party-row">
                          <input className="input" value={r.name} onChange={(e) => updatePayee(i, { name: e.target.value })} placeholder="Name" aria-label="Recipient name" />
                          <input className="input role" value={r.role} onChange={(e) => updatePayee(i, { role: e.target.value })} placeholder="Role, e.g. Illustration" aria-label="Recipient role" />
                          <span className="share-input">
                            <input className="input" inputMode="decimal" value={r.share} onChange={(e) => updatePayee(i, { share: e.target.value })} aria-label="Recipient share in percent" />
                          </span>
                          <button type="button" className="icon-btn" onClick={() => removePayee(i)} aria-label="Remove recipient" disabled={payeeRows.length <= 2}>
                            <IconClose size={16} />
                          </button>
                        </div>
                        <div className="party-address">
                          <input className="input mono" style={{ fontSize: 12.5 }} value={r.address} onChange={(e) => updatePayee(i, { address: e.target.value })} placeholder="Alephium address" aria-label="Recipient address" />
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button" className="pill pill-ghost pill-small" onClick={addPayee} disabled={payeeRows.length >= MAX_PAYEES}>
                        <IconPlus size={16} /> Add recipient
                      </button>
                      <button type="button" className="pill pill-ghost pill-small" onClick={() => setPayeeRows((old) => (me && !old.some((x) => sameAddress(x.address, me)) ? evenShares([...old, { name: rows[0]?.name ?? '', role: '', address: me, share: '' }]) : old))} disabled={!me || payeeRows.length >= MAX_PAYEES || payeeRows.some((x) => sameAddress(x.address, me))}>
                        Add yourself
                      </button>
                    </div>
                  </div>
                )}

                {splits && <SplitBar parties={payoutsOf({ parties, payees }).map((p) => ({ ...p, shareBps: Math.max(0, p.shareBps ?? 0) }))} caption={separate ? 'Paid out to' : undefined} />}

                <div className="field">
                  <span>Deadline for confirmations</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[3, 7, 14, 30].map((d) => (
                      <button key={d} type="button" className="chip" aria-pressed={deadlineDays === d} onClick={() => setDeadlineDays(d)}>
                        {d} days
                      </button>
                    ))}
                  </div>
                </div>

                {payoutWarnings.length > 0 && (
                  <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
                    {payoutWarnings.map((w) => (
                      <span key={w}>{w}</span>
                    ))}
                  </div>
                )}
                {cosignErrors.length > 0 && (
                  <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
                    {cosignErrors.map((e) => (
                      <span key={e}>{e}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className="field">
              <span>Note · private, only part of the fingerprint</span>
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed in this version?" disabled={state !== 'review'} />
            </label>

            {analysis && (
              <div className="field">
                <span>Metadata in the proof</span>
                <div className="meta-list">
                  <MetaToggle label="File name" value={analysis.name} on={includeFileName} toggle={() => setIncludeFileName((v) => !v)} />
                  {analysis.meta.map((m) => (
                    <MetaToggle
                      key={m.key}
                      label={m.label}
                      value={m.value}
                      sensitive={m.sensitive}
                      on={selected.has(m.key)}
                      toggle={() =>
                        setSelected((old) => {
                          const next = new Set(old)
                          if (next.has(m.key)) next.delete(m.key)
                          else next.add(m.key)
                          return next
                        })
                      }
                    />
                  ))}
                </div>
                <span className="muted small" style={{ lineHeight: 1.5 }}>
                  “Per file” means: this is what the file says – it may be wrong. Only the time of anchoring is proven.
                </span>
              </div>
            )}

            {analysis?.kind.misnamedAs && (
              <div className="note">
                <span>
                  Heads-up: the file is named “.{analysis.kind.misnamedAs}”, but its content is a {analysis.kind.label}.
                </span>
              </div>
            )}

            <div className="note">
              <IconLock size={18} />
              <span>Only two fingerprints and your address go on-chain. Title, note and metadata stay on this device until you share a proof.</span>
            </div>

            {error && <div className="error">{error}</div>}

            {state === 'anchoring' ? (
              <Steps phase={phase} />
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="pill pill-black" onClick={submit} disabled={!canAnchor}>
                  <span className="knob">
                    <IconArrow size={16} />
                  </span>
                  {cosign ? 'Propose' : 'Anchor'}
                </button>
                <button className="pill pill-ghost" onClick={next}>
                  {queue.length > 1 && index + 1 < queue.length ? 'Skip' : 'Cancel'}
                </button>
                {!ready && mode === 'alephium' && !walletConnected && <span className="muted small">Connect your wallet first (top right).</span>}
              </div>
            )}
          </section>
        )}

        {state === 'done' && result?.agreement && <ProposedPanel entry={result} onNext={next} hasNext={index + 1 < queue.length} />}

        {state === 'done' && result && !result.agreement && (
          <section className="glass panel result-dark fade-in">
            <h3>Proven</h3>
            <div className="rows">
              <div className="row">
                <span>Time on chain</span>
                <span>{result.anchor?.time ? formatDateTime(result.anchor.time) : 'confirming…'}</span>
              </div>
              <div className="row">
                <span>Network</span>
                <span>{anchor.label}</span>
              </div>
              <div className="row">
                <span>Transaction</span>
                <span className="mono">{shortHash(result.anchor?.txId ?? '', 8, 6)}</span>
              </div>
              <div className="row">
                <span>File fingerprint</span>
                <span className="mono">{shortHash(result.fileHash, 8, 6)}</span>
              </div>
              <div className="row">
                <span>Linked to</span>
                <span className="mono">{result.prevHash ? shortHash(result.prevHash, 8, 6) : 'first entry'}</span>
              </div>
            </div>
            <h3>Stated</h3>
            <div className="rows">
              <div className="row">
                <span>Title</span>
                <span>{result.title}</span>
              </div>
              <div className="row">
                <span>Project</span>
                <span>{projectName}</span>
              </div>
              <div className="row">
                <span>Kind</span>
                <span>
                  {CATEGORY_LABEL[result.kind.category]} · {formatSize(result.size)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="pill pill-glass"
                style={{ color: 'var(--ink)' }}
                onClick={() => download(`proof-${safeFileName(result.title)}.json`, JSON.stringify(proofBundle(result.manifest, result.manifestHash, result.anchor), null, 2))}
              >
                <IconDownload size={18} />
                Proof
              </button>
              <button className="pill pill-ghost" style={{ borderColor: 'rgba(255,255,255,.2)' }} onClick={() => openProject(result.projectId, result.id)}>
                Open project
              </button>
              <button className="pill pill-ghost" style={{ borderColor: 'rgba(255,255,255,.2)' }} onClick={next}>
                {index + 1 < queue.length ? 'Next file' : 'Another file'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

interface PartyRow {
  name: string
  role: string
  address: string
  share: string
}

function ProposedPanel({ entry, onNext, hasNext }: { entry: Entry; onNext: () => void; hasNext: boolean }) {
  const terms = entry.agreement!.terms
  const link = inviteLink(terms, encodeTerms)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('Copy this link', link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const others = terms.parties.filter((p) => !sameAddress(p.address, terms.initiator))
  return (
    <section className="glass panel result-dark fade-in">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3>Proposed</h3>
        <h2 style={{ fontSize: 30, fontWeight: 400, letterSpacing: '-0.03em' }}>Waiting for {others.length === 1 ? '1 signature' : `${others.length} signatures`}</h2>
        <span className="muted" style={{ lineHeight: 1.55 }}>
          Send this link to {others.map((p) => p.name).join(', ')}. Each of them checks the file, then confirms with their own wallet. The entry counts once everyone has agreed – before {formatDateTime(terms.deadline)}.
          {terms.payees?.length ? ` Send it to the recipients too (${terms.payees.filter((p) => !sameAddress(p.address, terms.initiator)).map((p) => p.name).join(', ')}): they don't sign, but opening it puts their share into Earnings.` : ''}
        </span>
      </div>
      <div className="note" style={{ background: 'rgba(255,255,255,.07)', color: '#cfd4d2', alignItems: 'center' }}>
        <span className="mono" style={{ flexGrow: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', wordBreak: 'normal' }}>
          {link}
        </span>
        <button className="pill pill-glass pill-small" style={{ color: 'var(--ink)' }} onClick={copy}>
          <IconCopy size={16} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a className="pill pill-glass" style={{ color: 'var(--ink)' }} href={`#/agreement/${encodeTerms(terms)}`}>
          Open agreement
        </a>
        <button className="pill pill-ghost" style={{ borderColor: 'rgba(255,255,255,.2)' }} onClick={onNext}>
          {hasNext ? 'Next file' : 'Another file'}
        </button>
      </div>
    </section>
  )
}

function MetaToggle({ label, value, on, toggle, sensitive }: { label: string; value: string; on: boolean; toggle: () => void; sensitive?: boolean }) {
  return (
    <div className="meta-row">
      <div className="text">
        <span>
          {label}
          {sensitive && <span className="sensitive">sensitive</span>}
        </span>
        <span title={value}>{value}</span>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={`Include ${label} in the proof`} className="switch" onClick={toggle} />
    </div>
  )
}

function HowItWorks() {
  const items = [
    ['Drop', 'Put any file on the stack – photo, audio, contract, code, anything.'],
    ['Review', 'Its kind and metadata are read locally. You choose what goes into the proof.'],
    ['Anchor', 'Only the fingerprint goes on-chain – with a timestamp and your signature.']
  ]
  return (
    <section className="glass panel fade-in">
      <h2>How a trail is made</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {items.map(([t, d], i) => (
          <div key={t} style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 14, alignItems: 'start' }}>
            <span style={{ fontSize: 28, fontWeight: 300, lineHeight: 1, color: 'var(--ink-2)' }}>{i + 1}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 450 }}>{t}</span>
              <span className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
                {d}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
