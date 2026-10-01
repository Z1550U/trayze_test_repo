import { useMemo, useState } from 'react'
import { useData } from '../ui/helpers'
import { HashGlyph } from '../ui/HashGlyph'
import { Highlight, Pager, SearchField } from '../ui/ListTools'
import { entrySearchFields, matches, paginate } from '../core/search'
import { STAGES, type Entry, type Project } from '../core/types'
import { useAnchor } from '../ui/useAnchor'
import { createProject } from '../ui/actions'
import { COLOR } from '../ui/colors'
import { IconArrow, IconPlus } from '../ui/icons'
import { formatDate, formatDayMonth } from '../core/format'
import { worksOf } from '../core/works'
import { store } from '../core/store'

const PROJECTS_PER_PAGE = 9
const FILES_PER_PAGE = 8
const stageLabel = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s
const timeOf = (e: Entry) => e.anchor?.time ?? e.created

export function Projects({ open, anchorNew }: { open: (id: string, entry?: string) => void; anchorNew: () => void }) {
  const { projects, entries } = useData()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [filePage, setFilePage] = useState(0)
  const searching = query.trim().length > 0
  const showTools = projects.length > 4 || entries.length > 12

  // Most recently active first – with many projects, the ones you work on stay on page one.
  const sorted = useMemo(() => {
    const latest = new Map<string, number>()
    for (const e of entries) latest.set(e.projectId, Math.max(latest.get(e.projectId) ?? 0, timeOf(e)))
    return [...projects].sort((a, b) => (latest.get(b.id) ?? b.created) - (latest.get(a.id) ?? a.created))
  }, [projects, entries])

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const fileHits = useMemo(
    () => (searching ? entries.filter((e) => byId.has(e.projectId) && matches(entrySearchFields(e), query)).sort((a, b) => timeOf(b) - timeOf(a)) : []),
    [entries, byId, query, searching]
  )
  const projectHits = useMemo(() => {
    if (!searching) return sorted
    const withFiles = new Set(fileHits.map((e) => e.projectId))
    return sorted.filter((p) => matches([p.name, p.description], query) || withFiles.has(p.id))
  }, [sorted, fileHits, query, searching])

  const projectPage = paginate(projectHits, page, PROJECTS_PER_PAGE)
  const filesPage = paginate(fileHits, filePage, FILES_PER_PAGE)
  const onQuery = (q: string) => {
    setQuery(q)
    setPage(0)
    setFilePage(0)
  }
  const { anchor } = useAnchor()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const firstProof = entries.reduce<number | undefined>((min, e) => {
    const t = e.anchor?.time ?? e.created
    return min === undefined || t < min ? t : min
  }, undefined)

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const p = await createProject(anchor, name, description)
      setShowForm(false)
      setName('')
      setDescription('')
      open(p.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="title">
            Your
            <span className="grey">trails</span>
          </h1>
        </div>
        <div className="figures">
          <div className="figure">
            <span className="label">Projects</span>
            <span className="value">{projects.length}</span>
          </div>
          <div className="figure">
            <span className="label">Proofs</span>
            <span className="value">{entries.filter((e) => e.anchor?.status !== 'failed').length}</span>
          </div>
          <div className="figure">
            <span className="label">First proof</span>
            <span className="value">{firstProof ? formatDayMonth(firstProof) : '–'}</span>
          </div>
        </div>
      </div>

      {projects.length === 0 && !showForm ? (
        <section className="glass empty">
          <p className="eyebrow" style={{ margin: 0 }}>
            Nothing here yet
          </p>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 450, letterSpacing: '-0.02em', maxWidth: 520 }}>A project collects the versions of one piece of work – from the first idea to delivery.</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="pill pill-black" onClick={() => setShowForm(true)}>
              <span className="knob">
                <IconPlus size={16} />
              </span>
              Create project
            </button>
            <button className="pill pill-glass" onClick={anchorNew}>
              Anchor a file right away
            </button>
            <a className="pill pill-ghost" href="#/about" style={{ color: 'var(--ink)' }}>
              How it works
            </a>
          </div>
        </section>
      ) : (
        <>
        {showTools && (
          <div className="list-tools">
            <SearchField value={query} onChange={onQuery} placeholder="Search projects and files" />
            <Pager page={projectPage} onChange={setPage} label="projects" />
          </div>
        )}
        {searching && fileHits.length > 0 && <FileHits page={filesPage} setPage={setFilePage} byId={byId} query={query} open={open} />}
        {searching && projectHits.length === 0 && (
          <section className="glass empty" style={{ padding: '40px 24px' }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 450 }}>Nothing matches “{query.trim()}”.</h2>
            <span className="muted small">Searched project names, descriptions, file titles, names, metadata and fingerprints.</span>
          </section>
        )}
        {searching && projectHits.length > 0 && <p className="eyebrow" style={{ margin: '0 0 -24px' }}>Projects · {projectHits.length}</p>}
        <div className="grid">
          {projectPage.items.map((p) => {
            const list = store.entriesOf(p.id)
            const first = list[0]?.anchor?.time ?? list[0]?.created
            const last = list[list.length - 1]?.anchor?.time ?? list[list.length - 1]?.created
            const span = first && last && last > first ? last - first : 1
            return (
              <button key={p.id} className="glass card" onClick={() => open(p.id)}>
                <div className="card-head">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <h2>
                      <Highlight text={p.name} query={query} />
                    </h2>
                    {p.description && (
                      <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
                        {p.description}
                      </span>
                    )}
                  </div>
                  <IconArrow size={18} />
                </div>
                <div style={{ display: 'flex', gap: 28 }}>
                  <div className="figure">
                    <span className="label">Files</span>
                    <span className="value" style={{ fontSize: 30 }}>
                      {worksOf(list).length}
                    </span>
                  </div>
                  <div className="figure">
                    <span className="label">Latest</span>
                    <span className="value" style={{ fontSize: 30 }}>
                      {last ? formatDayMonth(last) : '–'}
                    </span>
                  </div>
                </div>
                <div className="trail" aria-hidden="true">
                  {list.map((e) => {
                    const t = e.anchor?.time ?? e.created
                    const x = list.length === 1 || !first ? 50 : 4 + ((t - first) / span) * 92
                    return <span key={e.id} className="dot" style={{ left: `${x}%`, background: COLOR[e.kind.category] }} />
                  })}
                </div>
              </button>
            )
          })}
          {!showForm && !searching && projectPage.page === projectPage.pages - 1 && (
            <button className="glass card new-card" onClick={() => setShowForm(true)}>
              <IconPlus size={26} />
              <span>New project</span>
            </button>
          )}
        </div>
        {showTools && projectPage.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: -12 }}>
            <Pager page={projectPage} onChange={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }} label="projects" />
          </div>
        )}
        </>
      )}

      {showForm && (
        <section className="glass panel fade-in" style={{ maxWidth: 560 }}>
          <h2>New project</h2>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northern Light · Score" autoFocus />
          </label>
          <label className="field">
            <span>Description · optional, private</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Client, commission, context" />
          </label>
          <span className="muted small" style={{ lineHeight: 1.5 }}>
            Creating a project anchors only a random project ID with a fingerprint. The name stays private.
          </span>
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pill pill-black" disabled={name.trim().length < 2 || busy || !anchor.ready()} onClick={create}>
              {busy ? 'Anchoring…' : 'Create'}
            </button>
            <button className="pill pill-ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function FileHits({ page, setPage, byId, query, open }: { page: ReturnType<typeof paginate<Entry>>; setPage: (n: number) => void; byId: Map<string, Project>; query: string; open: (id: string, entry?: string) => void }) {
  return (
    <section className="glass panel fade-in" style={{ gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Files · {page.total}</h3>
        <Pager page={page} onChange={setPage} label="files" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {page.items.map((e) => (
          <button key={e.id} className="file-hit" onClick={() => open(e.projectId, e.id)}>
            <span className="tile">
              <HashGlyph hash={e.fileHash} size={26} color="var(--ink)" />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 450, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Highlight text={e.title} query={query} />
              </span>
              <span className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span className="dot" style={{ background: COLOR[e.kind.category], width: 7, height: 7, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Highlight text={e.fileName} query={query} /> · {stageLabel(e.stage)}
                </span>
              </span>
            </span>
            <span className="muted small" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {byId.get(e.projectId)?.name}
              <br />
              {formatDate(timeOf(e))}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
