import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, download, safeFileName } from '../ui/helpers'
import { COLOR, LEGEND } from '../ui/colors'
import { HashGlyph } from '../ui/HashGlyph'
import { IconCheck, IconDownload, IconKind, IconLink, IconPlus, IconBack } from '../ui/icons'
import { formatDate, formatDateTime, formatDayMonth, formatSize, shortHash } from '../core/format'
import { STAGES, type Entry } from '../core/types'
import { proofBundle } from '../core/manifest'
import { hashFile } from '../core/hash'
import { CATEGORY_LABEL } from '../core/detect'
import { encodeTerms, STATE_LABEL, bpsToPercent, sameAddress, payoutsOf } from '../core/agreement'
import { useAnchor } from '../ui/useAnchor'
import { useAgreement } from '../ui/useAgreement'
import { SplitBar } from '../ui/SplitBar'
import { IconUsers, IconChevron } from '../ui/icons'
import { Pager, SearchField, Highlight } from '../ui/ListTools'
import { entrySearchFields, matches, pageOf, paginate } from '../core/search'
import { usePayments, useOffers } from '../ui/usePayments'
import { OfferDialog } from '../ui/OfferDialog'
import { OfferList } from '../ui/OfferList'
import { payeeForGroup } from '../core/split'
import { brokenLinks, workOfEntry, worksOf, type Work } from '../core/works'
import type { FeeInfo } from '../chain/payments'

const FILES_PER_PAGE = 18
const VERSIONS_PER_PAGE = 8

const stageLabel = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s
const stageRank = (s: string) => STAGES.findIndex((x) => x.id === s)
const when = (e: Entry) => e.anchor?.time ?? e.created

type Sort = 'latest' | 'name' | 'stage'

interface Props {
  id: string
  /** A version: shows its file. Without it the project's files are shown. */
  focus?: string
  back: () => void
  openEntry: (entryId?: string) => void
  /** New version: of a file (work id), building on a version – or, without arguments, a new file */
  anchorNew: (work?: string, parent?: string) => void
}

export function ProjectDetail(props: Props) {
  const { projects, entries: all } = useData()
  const project = projects.find((p) => p.id === props.id)
  const entries = useMemo(() => all.filter((e) => e.projectId === props.id).sort((a, b) => when(a) - when(b)), [all, props.id])
  const works = useMemo(() => worksOf(entries, project?.name), [entries, project?.name])

  if (!project) {
    return (
      <div className="glass empty">
        <p>Project not found.</p>
        <button className="pill pill-glass" onClick={props.back}>
          Back to overview
        </button>
      </div>
    )
  }
  const work = props.focus ? workOfEntry(works, props.focus) : undefined
  return work ? (
    <WorkView key={work.id} project={project.name} work={work} entries={entries} focus={props.focus} back={() => props.openEntry()} anchorNew={props.anchorNew} />
  ) : (
    <ProjectFiles name={project.name} works={works} entries={entries} back={props.back} openEntry={props.openEntry} anchorNew={props.anchorNew} />
  )
}

/** The files of a project as small tiles – search, sort, filter by type. */
function ProjectFiles({ name, works, entries, back, openEntry, anchorNew }: { name: string; works: Work[]; entries: Entry[]; back: () => void; openEntry: (id?: string) => void; anchorNew: () => void }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('latest')
  const [type, setType] = useState<string>('all')
  const [page, setPage] = useState(0)

  const visible = useMemo(() => {
    const group = LEGEND.find((g) => g.label === type)
    let list = works.filter((w) => !group || group.categories.includes(w.latest.kind.category))
    if (query.trim()) list = list.filter((w) => matches([w.name], query) || w.versions.some((v) => matches(entrySearchFields(v), query)))
    const sorted = [...list]
    if (sort === 'latest') sorted.sort((a, b) => when(b.latest) - when(a.latest))
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'stage') sorted.sort((a, b) => stageRank(b.latest.stage) - stageRank(a.latest.stage) || when(b.latest) - when(a.latest))
    return sorted
  }, [works, query, sort, type])
  const paged = paginate(visible, page, FILES_PER_PAGE)
  const types = LEGEND.filter((g) => works.some((w) => g.categories.includes(w.latest.kind.category)))
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(0)
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <button className="pill pill-ghost pill-small" onClick={back} style={{ marginBottom: 20 }}>
            <IconBack size={16} />
            Projects
          </button>
          <h1 className="title">
            {name}
            <span className="grey">Files</span>
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, flexWrap: 'wrap' }}>
          <div className="figures">
            <div className="figure">
              <span className="label">Files</span>
              <span className="value">{works.length}</span>
            </div>
            <div className="figure">
              <span className="label">Versions</span>
              <span className="value">{entries.filter((e) => e.anchor?.status !== 'failed').length}</span>
            </div>
          </div>
          <button className="pill pill-black" onClick={() => anchorNew()}>
            <span className="knob">
              <IconPlus size={16} />
            </span>
            Anchor a version
          </button>
        </div>
      </div>

      {works.length === 0 ? (
        <section className="glass empty">
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 450 }}>No files in this project yet.</h2>
          <span className="muted">Anchor the first version – each file keeps its own trail of versions.</span>
        </section>
      ) : (
        <>
          <div className="file-tools">
            <SearchField value={query} onChange={reset(setQuery)} placeholder="Search files" />
            <div className="file-filters">
              <div className="chip-group" role="group" aria-label="Sort">
                <span className="chip-label">Sort</span>
                {(['latest', 'name', 'stage'] as Sort[]).map((s) => (
                  <button key={s} className="chip chip-small" aria-pressed={sort === s} onClick={() => reset(setSort)(s)}>
                    {s === 'latest' ? 'Latest' : s === 'name' ? 'Name' : 'Stage'}
                  </button>
                ))}
              </div>
              {types.length > 1 && (
                <div className="chip-group" role="group" aria-label="Type">
                  <span className="chip-label">Type</span>
                  <button className="chip chip-small" aria-pressed={type === 'all'} onClick={() => reset(setType)('all')}>
                    All
                  </button>
                  {types.map((g) => (
                    <button key={g.label} className="chip chip-small" aria-pressed={type === g.label} onClick={() => reset(setType)(g.label)}>
                      <span className="dot" style={{ background: g.color }} />
                      {g.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {visible.length === 0 && <span className="muted">No file matches.</span>}
          <div className="file-grid">
            {paged.items.map((w) => (
              <FileTile key={w.id} w={w} query={query} open={() => openEntry(w.latest.id)} />
            ))}
            {paged.page === paged.pages - 1 && !query.trim() && (
              <button className="glass file-tile new-card" onClick={() => anchorNew()}>
                <IconPlus size={20} />
                <span className="small">New file</span>
              </button>
            )}
          </div>
          {paged.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Pager page={paged} onChange={setPage} label="files" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FileTile({ w, query, open }: { w: Work; query: string; open: () => void }) {
  const first = when(w.first)
  const span = Math.max(1, when(w.latest) - first)
  const n = w.versions.length
  const cosigned = w.versions.some((v) => v.agreement)
  return (
    <button className="glass file-tile" onClick={open}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="tile" style={{ width: 34, height: 34, borderRadius: 11 }}>
          <IconKind category={w.latest.kind.category} size={16} />
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {cosigned && <IconUsers size={13} />} {formatDayMonth(when(w.latest))}
        </span>
      </span>
      <span className="file-tile-name">
        <Highlight text={w.name} query={query} />
      </span>
      <span className="muted" style={{ fontSize: 12.5 }}>
        {stageLabel(w.latest.stage)} · {n === 1 ? '1 version' : `${n} versions`}
      </span>
      <span className="trail" aria-hidden="true" style={{ height: 12 }}>
        {w.versions.slice(-40).map((v, _i, list) => (
          <span key={v.id} className="dot" style={{ left: `${list.length === 1 ? 50 : 4 + ((when(v) - first) / span) * 92}%`, background: COLOR[v.kind.category], width: 7, height: 7 }} />
        ))}
      </span>
    </button>
  )
}

/** One file: its versions (newest first) and the details of the selected one. */
function WorkView({ project, work, entries, focus, back, anchorNew }: { project: string; work: Work; entries: Entry[]; focus?: string; back: () => void; anchorNew: (work?: string, parent?: string) => void }) {
  const versions = work.versions
  const [selectedId, setSelectedId] = useState<string | undefined>(focus)
  const selected = versions.find((e) => e.id === selectedId) ?? work.latest
  const broken = useMemo(() => brokenLinks(entries), [entries])
  const byHash = useMemo(() => new Map(entries.map((e) => [e.manifestHash, e])), [entries])
  const chainOk = !versions.some((v) => broken.has(v.id))

  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const list = query.trim() ? versions.filter((e) => matches(entrySearchFields(e), query)) : versions
    return [...list].reverse()
  }, [versions, query])
  const [page, setPage] = useState(() => {
    const i = focus ? versions.findIndex((e) => e.id === focus) : -1
    return i >= 0 ? pageOf(versions.length - 1 - i, VERSIONS_PER_PAGE) : 0
  })
  const paged = paginate(visible, page, VERSIONS_PER_PAGE)
  const showSearch = versions.length > 8

  // A version whose predecessor is not the one right before it starts (or continues) a branch.
  const branchNote = (v: Entry) => {
    const i = versions.indexOf(v)
    const p = byHash.get(v.prevHash)
    return i > 0 && p && versions[i - 1].id !== p.id ? p.title : undefined
  }

  const first = when(versions[0])
  const days = Math.max(1, Math.round((when(work.latest) - first) / 86_400_000) + 1)

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <button className="pill pill-ghost pill-small" onClick={back} style={{ marginBottom: 20 }}>
            <IconBack size={16} />
            {project}
          </button>
          <h1 className="title">
            {work.name}
            <span className="grey">{stageLabel(work.latest.stage)}</span>
          </h1>
        </div>
        <div className="figures">
          <div className="figure">
            <span className="label">Versions</span>
            <span className="value">{versions.length}</span>
          </div>
          <div className="figure">
            <span className="label">Span</span>
            <span className="value">
              {days}
              <small>{days === 1 ? 'day' : 'days'}</small>
            </span>
          </div>
          <div className="figure">
            <span className="label">Chain</span>
            <span className={`value${chainOk ? '' : ' chain-break'}`}>{chainOk ? 'intact' : 'broken'}</span>
          </div>
        </div>
      </div>

      <div className="stage">
        <section className="timeline" aria-label="Versions">
          {(showSearch || paged.pages > 1) && (
            <div className="list-tools" style={{ padding: '0 12px 12px', position: 'relative', zIndex: 1 }}>
              {showSearch && <SearchField value={query} onChange={(q) => (setQuery(q), setPage(0))} placeholder="Search versions" />}
              <Pager page={paged} onChange={setPage} label="versions" />
            </div>
          )}
          {query.trim() && visible.length === 0 && <span className="muted small" style={{ padding: '8px 12px' }}>No version matches “{query.trim()}”.</span>}
          {paged.items.map((e) => {
            const branch = branchNote(e)
            return (
              <button key={e.id} className="timeline-item" aria-pressed={selected.id === e.id} onClick={() => setSelectedId(e.id)}>
                <span className="tile">
                  <HashGlyph hash={e.fileHash} size={30} color="var(--ink)" />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 450, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Highlight text={e.title} query={query} />
                  </span>
                  <span className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span className="dot" style={{ background: COLOR[e.kind.category], width: 7, height: 7 }} />
                    {stageLabel(e.stage)} · {formatDate(when(e))}
                    {branch && <span> · after {branch}</span>}
                  </span>
                </span>
                {e.agreement ? <AgreementBadge e={e} /> : <Status e={e} />}
              </button>
            )
          })}
          <button className="pill pill-black" onClick={() => anchorNew(work.id, selected.id)} style={{ alignSelf: 'flex-start', marginTop: 12, marginLeft: 12 }}>
            <span className="knob">
              <IconPlus size={16} />
            </span>
            New version
          </button>
          {selected.id !== work.latest.id && <span className="muted small" style={{ paddingLeft: 14 }}>Builds on “{selected.title}” – a new branch.</span>}
        </section>
        <Details e={selected} prev={byHash.get(selected.prevHash)} brokenLink={broken.has(selected.id)} />
      </div>
    </div>
  )
}

function AgreementBadge({ e }: { e: Entry }) {
  const { anchor } = useAnchor()
  const { status } = useAgreement(anchor, e.agreement!.id, e.agreement!.terms)
  const state = status?.state
  const color = state === 'agreed' ? 'var(--sage)' : state === 'pending' || !state ? 'var(--taupe)' : 'var(--warn)'
  return (
    <span className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <IconUsers size={15} />
      <span className={`dot${state === 'pending' ? ' pulse' : ''}`} style={{ background: color }} />
      {state === 'pending' ? `${status!.confirmed}/${e.agreement!.terms.parties.length} signed` : state ? STATE_LABEL[state].toLowerCase() : '…'}
    </span>
  )
}

function CoSigned({ e }: { e: Entry }) {
  const { anchor } = useAnchor()
  const terms = e.agreement!.terms
  const { status } = useAgreement(anchor, e.agreement!.id, terms)
  return (
    <>
      <h3>Co-signed{terms.splits ? ' · split sheet' : ''}</h3>
      {terms.splits && <SplitBar parties={payoutsOf(terms)} caption={terms.payees ? 'Paid out to' : undefined} />}
      <div className="rows">
        {(status?.parties ?? []).map((p) => (
          <div className="row" key={p.address}>
            <span>
              {p.name}
              {p.role ? ` · ${p.role}` : ''}
              {p.shareBps !== undefined ? ` · ${bpsToPercent(p.shareBps)} %` : ''}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span className="dot" style={{ background: p.status === 'confirmed' ? 'var(--sage)' : p.status === 'declined' ? 'var(--warn)' : 'var(--line)' }} />
              {p.status === 'confirmed' && sameAddress(p.address, terms.initiator) ? 'proposed' : p.status}
            </span>
          </div>
        ))}
        <div className="row">
          <span>Status</span>
          <span>
            {status ? STATE_LABEL[status.state] : '…'}
            {status?.agreedAt ? ` · ${formatDateTime(status.agreedAt)}` : ''}
          </span>
        </div>
      </div>
      <a className="pill pill-glass pill-small" style={{ alignSelf: 'flex-start', color: 'var(--ink)' }} href={`#/agreement/${encodeTerms(terms)}`}>
        <IconUsers size={16} /> Open agreement
      </a>
    </>
  )
}

function Status({ e }: { e: Entry }) {
  const s = e.anchor?.status
  const text = s === 'confirmed' ? 'anchored' : s === 'pending' ? 'pending' : s === 'failed' ? 'failed' : 'local'
  const color = s === 'confirmed' ? 'var(--sage)' : s === 'failed' ? 'var(--warn)' : 'var(--taupe)'
  return (
    <span className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className={`dot${s === 'pending' ? ' pulse' : ''}`} style={{ background: color }} />
      {text}
    </span>
  )
}

function Details({ e, prev, brokenLink }: { e: Entry; prev?: Entry; brokenLink: boolean }) {
  const [compare, setCompare] = useState<'same' | 'different' | 'running'>()
  const input = useRef<HTMLInputElement>(null)

  const checkFile = async (f?: File) => {
    if (!f) return
    setCompare('running')
    const h = await hashFile(f)
    setCompare(h === e.fileHash ? 'same' : 'different')
  }

  const inManifest = Object.keys(e.manifest.metadata)
  return (
    <section className="glass panel fade-in" key={e.id}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <span className="tile" style={{ width: 52, height: 52, borderRadius: 16 }}>
          <IconKind category={e.kind.category} size={22} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flexGrow: 1 }}>
          <h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</h2>
          <span className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" style={{ background: COLOR[e.kind.category] }} />
            {e.kind.label} · {formatSize(e.size)} · {stageLabel(e.stage)}
          </span>
        </div>
        <HashGlyph hash={e.fileHash} size={56} color="var(--ink)" label="Visual fingerprint" />
      </div>

      <h3>Proven</h3>
      <div className="rows">
        <div className="row">
          <span>Time on chain</span>
          <span>{e.anchor?.time ? formatDateTime(e.anchor.time) : e.anchor?.status === 'pending' ? 'confirming…' : '–'}</span>
        </div>
        <div className="row">
          <span>Network</span>
          <span>{e.anchor?.network === 'simulation' ? 'Simulation' : `Alephium ${e.anchor?.network ?? ''}`}</span>
        </div>
        <div className="row">
          <span>Signed by</span>
          <span className="mono">{shortHash(e.anchor?.owner ?? '', 6, 6)}</span>
        </div>
        <div className="row">
          <span>File</span>
          <span className="mono">{shortHash(e.fileHash, 10, 8)}</span>
        </div>
        <div className="row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconLink size={15} /> Previous
          </span>
          <span className={brokenLink ? 'chain-break' : undefined}>{e.prevHash ? (prev ? prev.title : shortHash(e.prevHash)) : 'Start of the trail'}</span>
        </div>
      </div>

      <h3>Stated</h3>
      <div className="rows">
        {e.manifest.file.name && (
          <div className="row">
            <span>File name</span>
            <span>{e.manifest.file.name}</span>
          </div>
        )}
        {e.allMeta
          .filter((m) => inManifest.includes(m.key))
          .map((m) => (
            <div className="row" key={m.key}>
              <span>{m.label}</span>
              <span>{m.value}</span>
            </div>
          ))}
        <div className="row">
          <span>Kind</span>
          <span>{CATEGORY_LABEL[e.kind.category]}</span>
        </div>
      </div>

      {e.agreement && <CoSigned e={e} />}
      {!e.agreement?.terms.splits && e.anchor?.status === 'confirmed' && e.anchor.network !== 'simulation' && <EntryPayments e={e} />}

      {e.note && (
        <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
          <span className="small">Note · private</span>
          <span style={{ color: 'var(--ink)', fontSize: 15 }}>{e.note}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="pill pill-glass pill-small" onClick={() => download(`proof-${safeFileName(e.title)}.json`, JSON.stringify(proofBundle(e.manifest, e.manifestHash, e.anchor), null, 2))}>
          <IconDownload size={16} />
          Proof
        </button>
        <button className="pill pill-glass pill-small" onClick={() => input.current?.click()}>
          Compare a file
        </button>
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(ev) => checkFile(ev.target.files?.[0])} />
        {compare === 'running' && <span className="muted small">computing…</span>}
        {compare === 'same' && (
          <span className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconCheck size={16} /> identical to this version
          </span>
        )}
        {compare === 'different' && <span className="small chain-break">not identical</span>}
      </div>
    </section>
  )
}

/** Payment links for a single anchored file, paid directly to the owner's address. */
function EntryPayments({ e }: { e: Entry }) {
  const payments = usePayments()
  const { wallet } = useAnchor()
  const [dialog, setDialog] = useState(false)
  const [open, setOpen] = useState(false)
  const [fee, setFee] = useState<FeeInfo>()
  const offers = useOffers((o) => o.fileHash === e.fileHash && !o.agreementId)
  useEffect(() => {
    let live = true
    void payments?.feeInfo().then((f) => live && setFee(f))
    return () => {
      live = false
    }
  }, [payments])
  if (!payments || !wallet || !sameAddress(wallet.address, e.anchor?.owner)) return null
  let to = ''
  try {
    to = payeeForGroup(wallet.address, payments.group)
  } catch {
    /* the dialog explains the problem */
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button className="fold" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>Payments</span>
          <span className="muted small">{offers.length ? `${offers.length} payment ${offers.length === 1 ? 'link' : 'links'}` : 'Get paid for this version'}</span>
        </span>
        <IconChevron size={16} open={open} />
      </button>
      {open && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 6px' }}>
          {to && <OfferList payments={payments} to={to} filter={(o) => o.fileHash === e.fileHash && !o.agreementId} bare />}
          <button className="pill pill-ghost pill-small" style={{ alignSelf: 'flex-start' }} onClick={() => setDialog(true)}>
            Request payment
          </button>
        </div>
      )}
      {dialog && <OfferDialog target={{ kind: 'address' }} title={e.title} fileHash={e.fileHash} feeBps={fee?.feeBps} group={payments.group} onClose={() => setDialog(false)} />}
    </div>
  )
}
