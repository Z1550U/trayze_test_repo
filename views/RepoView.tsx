import { useEffect, useMemo, useState } from 'react'
import {
  checkpointHash,
  encodePayload,
  evaluateRepo,
  newCheckpoint,
  parseRepo,
  parseTrayze,
  releaseId,
  repoId,
  trayzeFileText,
  type Maintainer,
  type Release,
  type RepoRef,
  type RepoReport,
  type TrayzeConfig
} from '../core/git'
import { normAddress, sameAddress } from '../core/agreement'
import { formatDate, shortHash } from '../core/format'
import type { AnchorReceipt } from '../core/types'
import { GitHubRepo, type Tag } from '../chain/github'
import { useAnchor } from '../ui/useAnchor'
import { IconCheck, IconClose, IconCopy, IconPlus } from '../ui/icons'

/** Public check page of one GitHub repo – and, for its maintainers, where releases get anchored. */
export function RepoView({ slug }: { slug: string }) {
  const repo = useMemo(() => parseRepo(slug), [slug])
  if (!repo) {
    return (
      <section className="glass empty fade-in">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 450 }}>That's not a GitHub repository.</h2>
        <a className="pill pill-glass" href="#/" style={{ color: 'var(--ink)' }}>
          Back
        </a>
      </section>
    )
  }
  return <Repo repo={repo} />
}

interface Loaded {
  id: string
  name: string
  branch: string
  report: RepoReport
  tags: Tag[]
  /** Raw `.trayze` on the default branch, null if there is none */
  headText: string | null
}

const C = { ok: 'var(--sage)', bad: 'var(--warn)', open: 'var(--line)' }
const ruleText = (c: TrayzeConfig) => (c.confirm === 1 ? 'One maintainer anchors a release.' : c.confirm === 'all' ? 'Every maintainer confirms a release.' : `${c.confirm} maintainers confirm a release.`)

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    window.prompt('Copy this', text)
  }
}

function Repo({ repo }: { repo: RepoRef }) {
  const { anchor, mode } = useAnchor()
  const me = anchor.owner()
  const gh = useMemo(() => new GitHubRepo(repo), [repo])
  const [data, setData] = useState<Loaded>()
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState<string>()
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const id = await repoId(repo)
        const meta = await gh.meta()
        const [events, tags] = await Promise.all([anchor.gitEvents(id), gh.tags()])
        const report = await evaluateRepo(repo, id, events, gh)
        const headText = await gh.trayzeText(meta.defaultBranch)
        if (live) setData({ id, name: meta.name, branch: meta.defaultBranch, report, tags, headText })
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      live = false
    }
  }, [repo, gh, anchor, version])

  const act = async (label: string, run: () => Promise<AnchorReceipt>) => {
    setBusy(label)
    setActionError('')
    try {
      const r = await anchor.confirm(await run())
      if (r.status === 'failed') throw new Error('The transaction failed.')
      setVersion((v) => v + 1)
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e)
      setActionError(/reject|denied|cancel/i.test(t) ? 'Declined in the wallet.' : t)
    } finally {
      setBusy(undefined)
    }
  }

  const [owner, name] = (data?.name ?? `${repo.owner}/${repo.repo}`).split('/')

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div className="repo-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          <div>
            <p className="eyebrow">Repository · github.com</p>
            <h1 className="title" style={{ overflowWrap: 'anywhere' }}>
              {owner}/<span style={{ display: 'block' }}>{name}</span>
            </h1>
          </div>
          {error ? <div className="error">{error}</div> : data ? <Verdict data={data} /> : <span className="muted">Reading GitHub and the registry…</span>}
          {data && data.report.state !== 'none' && <Badge slug={`github.com/${repo.owner}/${repo.repo}`} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, lineHeight: 1.55, color: 'var(--muted)' }}>
            <span>
              <b style={{ fontWeight: 500, color: 'var(--ink)' }}>Proves:</b> each anchored release existed exactly like this by the date shown, and is still part of the default branch.
            </span>
            <span>
              <b style={{ fontWeight: 500, color: 'var(--ink)' }}>Doesn't prove:</b> who wrote the code, or commit dates before an anchor.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {data && (
            <>
              <Releases data={data} me={me} busy={busy} confirm={(r) => void act(r.agreementId, () => anchor.confirmAgreement(r.agreementId))} />
              <Maintainers data={data} />
              {me && <AnchorPanel data={data} me={me} gh={gh} repo={repo} busy={busy} act={act} setError={setActionError} />}
              {data.headText === null || !parseTrayze(data.headText).config ? <Setup data={data} me={me} /> : null}
              {!me && <span className="muted small">{mode === 'alephium' ? 'Maintainer? Connect your wallet to anchor or confirm a release.' : ''}</span>}
              {actionError && <div className="error">{actionError}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Verdict({ data }: { data: Loaded }) {
  const { report, branch } = data
  const anchored = report.releases.filter((r) => r.status === 'anchored')
  const [title, color, sub] =
    report.state === 'intact'
      ? ['History intact', C.ok, `${anchored.length} ${anchored.length === 1 ? 'release' : 'releases'} anchored, all still part of ${branch}. Last anchor ${formatDate(report.lastGood!.anchoredAt ?? 0)}.`]
      : report.state === 'rewritten'
        ? [
            'History rewritten',
            C.bad,
            `${report.lastGood ? `Intact up to ${report.lastGood.checkpoint.tag} (${formatDate(report.lastGood.anchoredAt ?? 0)}). ` : ''}The commit anchored as ${report.firstBroken!.checkpoint.tag} is no longer part of ${branch} – the history was changed after that anchor, or the release lives on another branch.`
          ]
        : report.state === 'unknown'
          ? ['Not fully checked', C.open, 'GitHub did not answer every question. Reload in a moment.']
          : report.releases.some((r) => r.status === 'pending')
            ? ['Waiting for confirmation', C.open, `${report.releases.find((r) => r.status === 'pending')!.checkpoint.tag} is anchored and needs more maintainers to confirm it.`]
            : ['Not anchored yet', C.open, data.headText === null ? 'No release has been anchored by its maintainers, and the repo has no .trayze file yet.' : 'No release has been anchored by its maintainers yet.']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="verdict">
        <span className="dot" style={{ background: color, width: 14, height: 14 }} />
        {title}
      </span>
      <span className="muted" style={{ fontSize: 16, lineHeight: 1.5 }}>
        {sub}
      </span>
    </div>
  )
}

function Badge({ slug }: { slug: string }) {
  const [copied, setCopied] = useState<string>()
  const base = window.location.href.split('#')[0]
  const img = new URL('badge.svg', base).href
  const page = `${base}#/repo/${slug}`
  const copy = (what: string, text: string) => {
    void copyText(text)
    setCopied(what)
    setTimeout(() => setCopied(undefined), 2000)
  }
  return (
    <section className="glass panel" style={{ gap: 14, padding: 22 }}>
      <h3>README badge</h3>
      <img src={img} alt="Release history anchored with trayze" height={20} style={{ alignSelf: 'flex-start' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="pill pill-ghost pill-small" onClick={() => copy('md', `[![Release history anchored with trayze](${img})](${page})`)}>
          {copied === 'md' ? <IconCheck size={14} /> : <IconCopy size={14} />} Markdown
        </button>
        <button className="pill pill-ghost pill-small" onClick={() => copy('link', page)}>
          {copied === 'link' ? <IconCheck size={14} /> : <IconCopy size={14} />} Page link
        </button>
      </div>
      <span className="muted small">The badge links here – the check itself always runs live on this page.</span>
    </section>
  )
}

function Releases({ data, me, busy, confirm }: { data: Loaded; me?: string; busy?: string; confirm: (r: Release) => void }) {
  const { report, tags, branch } = data
  const list = [...report.releases].reverse()
  const tagNow = new Map(tags.map((t) => [t.name, t.commit]))
  const latest = report.state === 'intact' ? report.lastGood : undefined
  return (
    <section className="glass panel" style={{ gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px 12px', marginBottom: 6, flexWrap: 'wrap' }}>
        <h3>Anchored releases</h3>
        <span className="mono muted" style={{ fontSize: 12 }}>
          checked against {branch}
        </span>
      </div>
      {latest?.aheadBy !== undefined && (
        <div className="row">
          <span className="muted small">{latest.aheadBy === 0 ? `${branch} is exactly at ${latest.checkpoint.tag}` : `${latest.aheadBy} ${latest.aheadBy === 1 ? 'commit' : 'commits'} since ${latest.checkpoint.tag} · not anchored yet`}</span>
          <span />
        </div>
      )}
      {list.length === 0 && <span className="muted small">No anchored release yet.</span>}
      <div className="rows">
        {list.map((r) => {
          const now = tagNow.get(r.checkpoint.tag)
          const moved = now && now !== r.checkpoint.commit
          const deleted = !now && tags.length < 100
          const iMissing = !!me && r.missing.some((m) => sameAddress(m.address, me))
          const [dot, state] =
            r.status === 'anchored'
              ? [C.ok, `in ${branch} · unchanged`]
              : r.status === 'notInMain'
                ? [C.bad, `not part of ${branch}`]
                : r.status === 'pending'
                  ? [C.open, `${r.signers.length}/${r.need} confirmed`]
                  : [C.open, 'not checked']
          return (
            <div className="row" key={r.hash} style={{ alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <span className="dot" style={{ background: dot }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{r.checkpoint.tag}</span>
                  <span className="muted small">
                    anchored {formatDate(r.anchoredAt ?? 0)} · {r.need > 1 ? `confirmed by ${r.signers.map((s) => s.name).join(', ')}` : `by ${r.signers[0]?.name}`}
                    {r.status === 'pending' && ` · waiting for ${r.missing.map((m) => m.name).join(', ')}`}
                  </span>
                  {(moved || deleted) && <span className="small chain-break">{moved ? `tag now points to ${now!.slice(0, 7)}` : 'tag no longer exists'}</span>}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
                {r.status === 'pending' && iMissing && (
                  <button className="pill pill-black pill-small" onClick={() => confirm(r)} disabled={!!busy}>
                    {busy === r.agreementId ? 'Confirm in your wallet…' : 'Confirm'}
                  </button>
                )}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <span className="small" style={{ color: r.status === 'notInMain' ? 'var(--warn)' : 'var(--ink)' }}>
                    {state}
                  </span>
                  <span className="mono muted" style={{ fontSize: 12 }}>
                    {r.checkpoint.commit.slice(0, 7)}
                  </span>
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Maintainers({ data }: { data: Loaded }) {
  const { report } = data
  const cfg = report.rules ?? report.head
  if (!cfg && !report.ignored) return null
  return (
    <section className="glass panel" style={{ gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px 12px', flexWrap: 'wrap' }}>
        <h3>Who may anchor</h3>
        {cfg && (
          <span className="mono muted" style={{ fontSize: 12 }}>
            {report.rules && report.lastGood ? `from .trayze in ${report.lastGood.checkpoint.tag}` : `from .trayze on ${data.branch}`}
          </span>
        )}
      </div>
      {cfg && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cfg.maintainers.map((m) => (
              <span className="badge-chip" key={m.address}>
                {m.name} <span className="mono muted">{shortHash(m.address, 5, 4)}</span>
              </span>
            ))}
          </div>
          <span className="muted small">{ruleText(cfg)}</span>
        </>
      )}
      {report.ignored > 0 && (
        <span className="muted small">
          {report.ignored} {report.ignored === 1 ? 'anchor' : 'anchors'} from other addresses {report.ignored === 1 ? 'was' : 'were'} ignored.
        </span>
      )}
    </section>
  )
}

function AnchorPanel({
  data,
  me,
  gh,
  repo,
  busy,
  act,
  setError
}: {
  data: Loaded
  me: string
  gh: GitHubRepo
  repo: RepoRef
  busy?: string
  act: (label: string, run: () => Promise<AnchorReceipt>) => Promise<void>
  setError: (e: string) => void
}) {
  const { anchor } = useAnchor()
  const { report, tags, branch } = data
  const cfg = report.rules ?? report.head
  const done = useMemo(() => new Set(report.releases.map((r) => `${r.checkpoint.tag}@${r.checkpoint.commit}`)), [report])
  const open = tags.filter((t) => !done.has(`${t.name}@${t.commit}`)).slice(0, 8)
  const [pick, setPick] = useState<string>()
  const [checking, setChecking] = useState(false)
  if (!cfg?.maintainers.some((m) => sameAddress(m.address, me))) return null
  const chosen = open.find((t) => t.name === pick) ?? open[0]

  const run = async () => {
    if (!chosen) return
    setError('')
    setChecking(true)
    try {
      // The rules of the last confirmed release decide – before the first one, the tag's own .trayze.
      const rules = report.rules ?? (await gh.trayzeAt(chosen.commit))
      if (!rules?.maintainers.some((m) => sameAddress(m.address, me))) {
        setError(`${chosen.name} has no .trayze listing your address – it was probably tagged before the file existed. Anchor a newer release.`)
        return
      }
      const main = await gh.inMain(chosen.commit)
      if (!main.inMain) {
        setError(`${chosen.name} is not part of ${branch}. Only releases on the default branch can be anchored.`)
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setChecking(false)
    }
    const cp = newCheckpoint(repo, chosen.name, chosen.commit)
    const hash = await checkpointHash(cp)
    await act('anchor', async () => anchor.proposeAgreement(await releaseId(hash), data.id, hash, hash, '', encodePayload(cp)))
  }

  return (
    <section className="glass panel" style={{ gap: 14 }}>
      <h3>Anchor a release</h3>
      {open.length === 0 ? (
        <span className="muted small">Every tag is anchored. Push a new tag to {branch}, then reload.</span>
      ) : (
        <>
          <div className="tag-options" role="radiogroup" aria-label="Release">
            {open.map((t) => (
              <button key={t.name} role="radio" aria-checked={t === chosen} className="tag-option" onClick={() => setPick(t.name)}>
                <span className="radio" />
                <span style={{ flexGrow: 1, textAlign: 'left', fontSize: 16, fontWeight: 500 }}>{t.name}</span>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {t.commit.slice(0, 7)}
                </span>
              </button>
            ))}
          </div>
          <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--ink)' }}>What goes on chain</span>
            <span>
              Tag <span className="mono">{chosen.name}</span> and commit <span className="mono">{chosen.commit.slice(0, 12)}…</span> – which covers every commit before it. Your code is never uploaded.
              {cfg.confirm !== 1 && cfg.maintainers.length > 1 ? ' The other maintainers confirm it afterwards on this page.' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button className="pill pill-black" onClick={() => void run()} disabled={!!busy || checking}>
              {checking ? 'Checking…' : busy === 'anchor' ? 'Confirm in your wallet…' : `Anchor ${chosen.name}`}
            </button>
            <span className="muted small">Network fee is paid from your wallet.</span>
          </div>
        </>
      )}
    </section>
  )
}

function Setup({ data, me }: { data: Loaded; me?: string }) {
  const [rows, setRows] = useState<Maintainer[]>([{ address: me ?? '', name: '' }])
  const [confirm, setConfirm] = useState<'1' | 'all'>('1')
  const [copied, setCopied] = useState(false)
  const filled = rows.filter((r) => r.address.trim()).map((r) => ({ address: normAddress(r.address), name: r.name.trim() || shortHash(normAddress(r.address), 5, 4) }))
  const text = filled.length ? trayzeFileText(filled, confirm === 'all' ? 'all' : 1) : ''
  const problems = text ? parseTrayze(text).problems : ['Add at least one maintainer address.']
  const broken = data.headText !== null ? parseTrayze(data.headText).problems : []
  const update = (i: number, patch: Partial<Maintainer>) => setRows((old) => old.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <section className="glass panel" style={{ gap: 14 }}>
      <h3>Set up this repo</h3>
      {broken.length > 0 ? (
        <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
          <span style={{ color: 'var(--ink)' }}>The .trayze file on {data.branch} can't be used:</span>
          {broken.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      ) : (
        <span className="muted small" style={{ lineHeight: 1.55 }}>
          A <span className="mono">.trayze</span> file in the root of {data.branch} names who may anchor releases. Only people with write access can add it – that's what makes the anchors trustworthy.
        </span>
      )}
      {rows.map((r, i) => (
        <div className="party-block" key={i}>
          <div className="party-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <input className="input" value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={i === 0 && me ? 'Your name' : 'Name'} aria-label="Maintainer name" />
            <button type="button" className="icon-btn" onClick={() => setRows((old) => old.filter((_, j) => j !== i))} aria-label="Remove maintainer" disabled={rows.length <= 1}>
              <IconClose size={16} />
            </button>
          </div>
          <div className="party-address">
            <input className="input mono" style={{ fontSize: 12.5 }} value={r.address} onChange={(e) => update(i, { address: e.target.value })} placeholder="Alephium address" aria-label="Maintainer address" spellCheck={false} />
          </div>
        </div>
      ))}
      <button type="button" className="pill pill-ghost pill-small" style={{ alignSelf: 'flex-start' }} onClick={() => setRows((old) => [...old, { address: '', name: '' }])}>
        <IconPlus size={16} /> Add maintainer
      </button>
      <div className="field">
        <span>Who must confirm a release?</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="chip" aria-pressed={confirm === '1'} onClick={() => setConfirm('1')}>
            One maintainer
          </button>
          <button type="button" className="chip" aria-pressed={confirm === 'all'} onClick={() => setConfirm('all')}>
            All maintainers
          </button>
        </div>
        <span className="muted small">You can change it later – the change itself needs approval under the current rule.</span>
      </div>
      {text && <pre className="code-block">{text}</pre>}
      {problems.length > 0 && text ? (
        <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
          {problems.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="pill pill-black"
          disabled={problems.length > 0}
          onClick={() => {
            void copyText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />} {copied ? 'Copied' : 'Copy .trayze'}
        </button>
        <span className="muted small">Commit it to {data.branch} as .trayze, then reload this page.</span>
      </div>
    </section>
  )
}
