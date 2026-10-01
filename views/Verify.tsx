import { useState } from 'react'
import { DocumentStack } from '../ui/DocumentStack'
import { IconUpload, IconCheck, IconLock } from '../ui/icons'
import { useAnchor } from '../ui/useAnchor'
import { useData } from '../ui/helpers'
import { hashFile } from '../core/hash'
import { analyze } from '../core/metadata'
import { checkProof, type ProofStatus } from '../core/manifest'
import { agreementId, evaluate, bpsToPercent, encodeTerms, STATE_LABEL, type AgreementStatus, type AgreementTerms, sameAddress, payoutsOf } from '../core/agreement'
import { SplitBar } from '../ui/SplitBar'
import { IconUsers } from '../ui/icons'
import { compare, type Comparison, type FieldChange, type Reference } from '../core/compare'
import { formatDateTime, formatSize, shortHash } from '../core/format'
import { similarity, RELATED_THRESHOLD } from '../core/similarity'
import type { Entry, FileAnalysis, ProofBundle } from '../core/types'
import type { RegistryMatch } from '../chain/anchor'

type State = 'empty' | 'hashing' | 'searching' | 'result'

interface RefInfo {
  source: 'proof' | 'yours'
  title: string
  time?: number
  /** Is the reference version itself anchored in the registry? */
  anchored: boolean
  /** Signer of the reference version according to the registry */
  owner?: string
  comparison: Comparison
  size: number
  /** Visual similarity of the pictures, 0…1 (images only) */
  visual?: number
}

function refFromEntry(e: Entry): Reference {
  return {
    fileHash: e.fileHash,
    name: e.fileName,
    size: e.size,
    category: e.kind.category,
    metadata: Object.fromEntries(e.allMeta.map((m) => [m.key, m.value])),
    labels: Object.fromEntries(e.allMeta.map((m) => [m.key, m.label])),
    complete: true
  }
}

function refFromBundle(b: ProofBundle): Reference {
  return {
    fileHash: b.manifest.file.sha256,
    name: b.manifest.file.name,
    size: b.manifest.file.size,
    category: b.manifest.file.category,
    metadata: b.manifest.metadata,
    complete: false
  }
}

export function Verify() {
  const { anchor } = useAnchor()
  const { entries, projects } = useData()
  const [state, setState] = useState<State>('empty')
  const [progress, setProgress] = useState(0)
  const [file, setFile] = useState<File>()
  const [analysis, setAnalysis] = useState<FileAnalysis>()
  const [hash, setHash] = useState('')
  const [matches, setMatches] = useState<RegistryMatch[]>([])
  const [bundle, setBundle] = useState<ProofBundle>()
  const [proofStatus, setProofStatus] = useState<ProofStatus>()
  const [ref, setRef] = useState<RefInfo>()
  const [error, setError] = useState('')
  const [agreementFile, setAgreementFile] = useState<AgreementTerms>()
  const [cosigned, setCosigned] = useState<CoSignResult[]>([])

  const handle = async (list: FileList) => {
    setError('')
    let nextBundle = bundle
    let nextAgreement = agreementFile
    let target: File | undefined
    for (const f of Array.from(list)) {
      if (f.name.endsWith('.json') && f.size < 2_000_000) {
        try {
          const j = JSON.parse(await f.text())
          if (j?.schema === 'trayze/proof@1') {
            nextBundle = j as ProofBundle
            continue
          }
          if (j?.schema === 'trayze/agreement@1') {
            nextAgreement = j as AgreementTerms
            continue
          }
        } catch {
          /* not a proof file – verify it like any other file */
        }
      }
      target = f
    }
    setBundle(nextBundle)
    setAgreementFile(nextAgreement)
    if (!target) return
    setFile(target)
    setState('hashing')
    setProgress(0)
    setRef(undefined)
    try {
      const [a, h] = await Promise.all([analyze(target), hashFile(target, setProgress)])
      setAnalysis(a)
      setHash(h)
      setState('searching')
      const found = (await anchor.find(h)).sort((x, y) => (x.time ?? 0) - (y.time ?? 0))
      setMatches(found)
      let proof: Awaited<ReturnType<typeof checkProof>> | undefined
      if (nextBundle) {
        const refHash = nextBundle.manifest.file.sha256
        proof = await checkProof(nextBundle, refHash === h ? found : await anchor.find(refHash))
      }
      setProofStatus(proof?.status)
      setCosigned(await findCoSigned(h, nextAgreement))
      setRef(await findReference(a, h, nextBundle, proof))
      setState('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('empty')
    }
  }

  /** Co-signed proposals for this file, evaluated when the terms are known (agreement file or own entry). */
  const findCoSigned = async (h: string, fileTerms: AgreementTerms | undefined): Promise<CoSignResult[]> => {
    const proposals = await anchor.findProposals(h)
    const known: AgreementTerms[] = [...entries.filter((e) => e.agreement).map((e) => e.agreement!.terms), ...(fileTerms ? [fileTerms] : [])]
    const out: CoSignResult[] = []
    const seen = new Set<string>()
    for (const p of proposals) {
      // One row per agreement – duplicate proposals with the same ID (possibly from someone else) are folded in
      if (seen.has(p.agreementId)) continue
      seen.add(p.agreementId)
      let terms: AgreementTerms | undefined
      for (const t of known) if ((await agreementId(t)) === p.agreementId) terms = t
      const status = terms ? evaluate(terms, p.agreementId, await anchor.agreementEvents(p.agreementId)) : undefined
      out.push({ id: p.agreementId, initiator: terms?.initiator ?? p.initiator, time: p.time, terms, status })
    }
    return out
  }

  /** Picks what to compare against: the proof file first, then the user's own entries. */
  const findReference = async (
    a: FileAnalysis,
    h: string,
    b: ProofBundle | undefined,
    proof: { status: ProofStatus; time?: number; owner?: string } | undefined
  ): Promise<RefInfo | undefined> => {
    // A proof file is only used when the registry confirms it – time and signer come from the chain, never from the JSON
    if (b && proof?.status === 'valid') {
      return {
        source: 'proof',
        title: b.manifest.title,
        time: proof.time,
        anchored: true,
        owner: proof.owner,
        comparison: compare(a, h, refFromBundle(b)),
        size: b.manifest.file.size,
        visual: a.visualHash && b.manifest.file.visualHash ? similarity(a.visualHash, b.manifest.file.visualHash) : undefined
      }
    }
    // 1. identical file  2. same picture (visual fingerprint)  3. same file name
    const sameHash = entries.find((e) => e.fileHash === h)
    let best: { e: Entry; s: number } | undefined
    if (!sameHash && a.visualHash) {
      for (const e of entries) {
        if (!e.visualHash) continue
        const s = similarity(a.visualHash, e.visualHash)
        if (s >= RELATED_THRESHOLD && (!best || s > best.s)) best = { e, s }
      }
    }
    const sameName = [...entries].reverse().find((e) => e.fileName === a.name || e.manifest.file.name === a.name)
    const own = sameHash ?? best?.e ?? sameName
    if (!own) return undefined
    return {
      source: 'yours',
      title: own.title,
      time: own.anchor?.time,
      anchored: own.anchor?.status === 'confirmed',
      comparison: compare(a, h, refFromEntry(own)),
      size: own.size,
      visual: a.visualHash && own.visualHash ? similarity(a.visualHash, own.visualHash) : undefined
    }
  }

  const reset = () => {
    setState('empty')
    setFile(undefined)
    setAnalysis(undefined)
    setHash('')
    setMatches([])
    setBundle(undefined)
    setProofStatus(undefined)
    setAgreementFile(undefined)
    setCosigned([])
    setRef(undefined)
  }

  const earliest = matches[0]
  const own = entries.find((e) => e.fileHash === hash)
  const ownProject = own ? projects.find((p) => p.id === own.projectId) : undefined
  const found = state === 'result' && matches.length > 0
  const kind = analysis?.kind

  return (
    <div className="stage fade-in">
      <div className="stage-left">
        <div>
          <p className="eyebrow">Public · no wallet needed</p>
          <h1 className="title">
            Verify
            <span className="grey">a file</span>
          </h1>
        </div>
        <DocumentStack
          sheets={file && state !== 'empty' ? [{ key: file.name + file.size, name: file.name, category: kind?.category, kindLabel: kind?.label ?? 'Reading…', size: file.size }] : []}
          progress={state === 'hashing' ? progress : undefined}
          hash={hash || undefined}
          sealed={found || cosigned.some((c) => c.status?.state === 'agreed')}
          unmatched={state === 'result' && matches.length === 0}
          onFiles={state === 'empty' ? handle : undefined}
          dropTitle="Drop a file to verify"
          dropHint="optionally with its proof (.json)"
        />
        <div className="note">
          <IconLock size={18} />
          <span>The file is only read locally. Add its proof file (.json) to compare it with the anchored version – name, size and metadata.</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && <div className="error">{error}</div>}
        {state === 'result' && proofStatus && proofStatus !== 'valid' && <ProofWarning status={proofStatus} network={anchor.label} />}
        {(state === 'empty' || state === 'hashing' || state === 'searching') && !error && (
          <section className="glass panel fade-in">
            <h2>{state === 'searching' ? 'Searching the registry…' : state === 'hashing' ? 'Computing fingerprint…' : 'What a check tells you'}</h2>
            <div className="rows">
              <div className="row">
                <span>Proven</span>
                <span>This exact file existed no later than the block time, signed by this address.</span>
              </div>
              <div className="row">
                <span>Not proven</span>
                <span>Who created the work, whether it is authentic, or whether tools such as AI were involved.</span>
              </div>
              <div className="row">
                <span>Checked against</span>
                <span>{anchor.label}</span>
              </div>
            </div>
            {bundle && <span className="small">Proof file loaded: “{bundle.manifest.title}”. Now drop the file you want to check.</span>}
          </section>
        )}

        {found && (
          <section className="glass panel result-dark fade-in">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ fontSize: 34, fontWeight: 400, letterSpacing: '-0.03em' }}>Anchored</h2>
              <span className="muted small">{matches.length === 1 ? '1 entry' : `${matches.length} entries`}</span>
            </div>
            <div className="rows">
              <div className="row">
                <span>Earliest proof</span>
                <span>{earliest.time ? formatDateTime(earliest.time) : '–'}</span>
              </div>
              <div className="row">
                <span>Signed by</span>
                <span className="mono">{shortHash(earliest.owner, 6, 6)}</span>
              </div>
              <div className="row">
                <span>Project ID</span>
                <span className="mono">{shortHash(earliest.projectId, 8, 6)}</span>
              </div>
              <div className="row">
                <span>Transaction</span>
                <span className="mono">{shortHash(earliest.txId, 8, 6)}</span>
              </div>
              <div className="row">
                <span>Fingerprint</span>
                <span className="mono">{shortHash(hash, 10, 8)}</span>
              </div>
            </div>
            {kind?.misnamedAs && (
              <div className="note" style={{ background: 'rgba(255,255,255,.07)', color: '#cfd4d2' }}>
                <span>
                  Named “.{kind.misnamedAs}”, but the content is a {kind.label}.
                </span>
              </div>
            )}
            {own && (
              <div className="note" style={{ background: 'rgba(255,255,255,.07)', color: '#cfd4d2' }}>
                <IconCheck size={18} />
                <span>
                  In your projects: “{own.title}”{ownProject ? ` in ${ownProject.name}` : ''}.
                </span>
              </div>
            )}
            <button className="pill pill-glass" style={{ color: 'var(--ink)', alignSelf: 'flex-start' }} onClick={reset}>
              Verify another file
            </button>
          </section>
        )}

        {state === 'result' && cosigned.map((c) => <CoSignPanel key={c.id} c={c} />)}

        {state === 'result' && matches.length === 0 && cosigned.length === 0 && (
          <section className="glass panel fade-in">
            <h2 style={{ fontSize: 30, fontWeight: 400, letterSpacing: '-0.03em' }}>No entry</h2>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
              The registry ({anchor.label}) has no entry for this exact file. A single changed byte – converting, re-saving or editing embedded metadata – produces a different fingerprint.
            </p>
            <div className="rows">
              <div className="row">
                <span>Fingerprint</span>
                <span className="mono">{shortHash(hash, 10, 8)}</span>
              </div>
              <div className="row">
                <span>Kind</span>
                <span>{kind?.label}</span>
              </div>
            </div>
            {kind?.misnamedAs && (
              <div className="note">
                <span>
                  Named “.{kind.misnamedAs}”, but the content is a {kind.label}.
                </span>
              </div>
            )}
            {!ref && !bundle && <span className="muted small">Add the proof file (.json) of the original to see exactly what changed.</span>}
            <button className="pill pill-black" style={{ alignSelf: 'flex-start' }} onClick={reset}>
              <span className="knob">
                <IconUpload size={16} />
              </span>
              Another file
            </button>
          </section>
        )}

        {state === 'result' && ref && analysis && <Changes info={ref} current={analysis} />}
      </div>
    </div>
  )
}

interface CoSignResult {
  id: string
  initiator: string
  time?: number
  terms?: AgreementTerms
  status?: AgreementStatus
}

function CoSignPanel({ c }: { c: CoSignResult }) {
  const s = c.status
  const dark = s?.state === 'agreed'
  return (
    <section className={`glass panel fade-in${dark ? ' result-dark' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontSize: 30, fontWeight: 400, letterSpacing: '-0.03em' }}>{s ? (s.state === 'agreed' ? 'Co-signed' : STATE_LABEL[s.state]) : 'Co-sign proposal'}</h2>
        <IconUsers size={22} />
      </div>
      {s && c.terms ? (
        <>
          {c.terms.splits && <SplitBar parties={payoutsOf(c.terms)} caption={c.terms.payees ? 'Paid out to' : undefined} />}
          <div className="rows">
            {s.parties.map((p) => (
              <div className="row" key={p.address}>
                <span>
                  {p.name}
                  {p.role ? ` · ${p.role}` : ''}
                  {p.shareBps !== undefined ? ` · ${bpsToPercent(p.shareBps)} %` : ''}
                </span>
                <span>{p.status === 'confirmed' && sameAddress(p.address, c.terms!.initiator) ? 'proposed' : p.status}</span>
              </div>
            ))}
            {s.agreedAt && (
              <div className="row">
                <span>Agreed on chain</span>
                <span>{formatDateTime(s.agreedAt)}</span>
              </div>
            )}
          </div>
          <a className="pill pill-glass pill-small" style={{ alignSelf: 'flex-start', color: 'var(--ink)' }} href={`#/agreement/${encodeTerms(c.terms)}`}>
            Open agreement
          </a>
        </>
      ) : (
        <>
          <div className="rows">
            <div className="row">
              <span>Proposed by</span>
              <span className="mono">{shortHash(c.initiator, 6, 6)}</span>
            </div>
            <div className="row">
              <span>Proposed on</span>
              <span>{c.time ? formatDateTime(c.time) : '–'}</span>
            </div>
          </div>
          <span className="muted small" style={{ lineHeight: 1.5 }}>
            This file was proposed for co-signing. Add the agreement file (.json) to see the parties, shares and whether everyone agreed.
          </span>
        </>
      )}
    </section>
  )
}

const STATUS: Record<FieldChange['status'], { text: string; color: string }> = {
  same: { text: 'unchanged', color: 'var(--sage)' },
  changed: { text: 'changed', color: 'var(--warn)' },
  removed: { text: 'removed', color: 'var(--taupe)' },
  added: { text: 'new', color: 'var(--lavender)' }
}

function ChangeRow({ f }: { f: FieldChange }) {
  const s = STATUS[f.status]
  return (
    <div className="change-row">
      <div className="change-label">
        <span>{f.label}</span>
        <span className="change-status">
          <span className="dot" style={{ background: s.color }} />
          {s.text}
        </span>
      </div>
      <div className="change-values">
        {f.status === 'same' && <span>{f.now}</span>}
        {f.status === 'changed' && (
          <>
            <span className="was">{f.before}</span>
            <span>{f.now}</span>
          </>
        )}
        {f.status === 'removed' && <span className="was">{f.before}</span>}
        {f.status === 'added' && <span>{f.now}</span>}
      </div>
    </div>
  )
}

function Changes({ info, current }: { info: RefInfo; current: FileAnalysis }) {
  const c = info.comparison
  const embedded = c.fields.filter((f) => !f.outsideFile)
  const outside = c.fields.filter((f) => f.outsideFile)
  const changedEmbedded = embedded.filter((f) => f.status !== 'same')

  let headline: string
  let detail: string
  const related = info.visual !== undefined && info.visual >= RELATED_THRESHOLD
  const pct = info.visual !== undefined ? Math.round(info.visual * 100) : undefined
  if (!c.contentIdentical && related) {
    headline = 'Related version'
    detail =
      `Not the same file, but the picture matches the anchored version (${pct}\u00a0% visual similarity). ` +
      (changedEmbedded.length > 0
        ? `${changedEmbedded.length === 1 ? 'One metadata field' : `${changedEmbedded.length} metadata fields`} inside the file changed.`
        : 'The metadata shown is unchanged – the image data was re-encoded or edited.')
  } else if (c.contentIdentical) {
    headline = 'Content unchanged'
    detail = 'The fingerprint is identical, so the content and all metadata stored inside the file are exactly as anchored.'
  } else if (changedEmbedded.length > 0) {
    headline = 'Modified'
    detail = `This file differs from the anchored version. ${changedEmbedded.length === 1 ? 'One metadata field' : `${changedEmbedded.length} metadata fields`} inside the file changed.`
  } else {
    headline = 'Content modified'
    detail = info.comparison.fields.length
      ? `This file differs from the anchored version, but the ${info.source === 'proof' ? 'shared ' : ''}metadata is unchanged – the content itself was edited, re-encoded or re-saved.`
      : 'This file differs from the anchored version. The proof contains no metadata to compare.'
  }

  return (
    <section className="glass panel fade-in">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3>Compared with {info.source === 'proof' ? 'the proof file' : 'your entry'}</h3>
        <h2 style={{ fontSize: 30, fontWeight: 400, letterSpacing: '-0.03em' }}>{headline}</h2>
        <span className="muted" style={{ lineHeight: 1.55 }}>
          {detail}
        </span>
      </div>

      <div className="rows">
        <div className="row">
          <span>Reference</span>
          <span>
            “{info.title}”{info.time ? ` · ${formatDateTime(info.time)}` : ''}
          </span>
        </div>
        <div className="row">
          <span>Reference on chain</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" style={{ background: info.anchored ? 'var(--sage)' : 'var(--warn)' }} />
            {info.anchored ? 'anchored' : 'not found'}
          </span>
        </div>
        {info.owner && (
          <div className="row">
            <span>Signed by</span>
            <span className="mono">{shortHash(info.owner, 6, 6)}</span>
          </div>
        )}
        {info.source === 'proof' && (
          <div className="row">
            <span>Proof file</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="dot" style={{ background: 'var(--sage)' }} />
              authentic · confirmed by the registry
            </span>
          </div>
        )}
        {pct !== undefined && !c.contentIdentical && (
          <div className="row">
            <span>Visual similarity</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="dot" style={{ background: related ? 'var(--sage)' : 'var(--taupe)' }} />
              {pct}&nbsp;%{related ? ' · same picture' : ''}
            </span>
          </div>
        )}
        {c.sizeChanged && (
          <div className="row">
            <span>Size</span>
            <span>
              {formatSize(info.size)} → {formatSize(current.size)}
            </span>
          </div>
        )}
        {c.kindChanged && (
          <div className="row">
            <span>Kind</span>
            <span>changed to {current.kind.label}</span>
          </div>
        )}
      </div>

      {embedded.length > 0 && (
        <div className="field">
          <span>Inside the file</span>
          <div className="meta-list">
            {embedded.map((f) => (
              <ChangeRow key={f.key} f={f} />
            ))}
          </div>
        </div>
      )}

      {(c.name || outside.length > 0) && (
        <div className="field">
          <span>Outside the file · not part of the fingerprint</span>
          <div className="meta-list">
            {c.name && <ChangeRow f={c.name} />}
            {outside.map((f) => (
              <ChangeRow key={f.key} f={f} />
            ))}
          </div>
          <span className="muted small" style={{ lineHeight: 1.5 }}>
            Renaming or copying a file changes these values but not the file itself – they don't affect the proof.
          </span>
        </div>
      )}

      {info.source === 'proof' && (
        <span className="muted small" style={{ lineHeight: 1.5 }}>
          Only the metadata the owner included in the proof can be compared.
        </span>
      )}
    </section>
  )
}

function ProofWarning({ status, network }: { status: Exclude<ProofStatus, 'valid'>; network: string }) {
  const text =
    status === 'altered'
      ? { title: 'Proof file was edited', body: 'Its content no longer matches its own fingerprint. The details in it cannot be trusted and were ignored.' }
      : {
          title: 'Proof file not confirmed',
          body: `Its fingerprint is not in the registry (${network}) for this file. It was either edited and re-hashed, or it belongs to another network. The details in it cannot be trusted and were ignored.`
        }
  return (
    <section className="glass panel fade-in" style={{ borderColor: 'rgba(176,100,60,.35)' }} role="alert">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="dot" style={{ background: 'var(--warn)', width: 10, height: 10 }} />
        <h2 style={{ fontSize: 24, fontWeight: 450, letterSpacing: '-0.02em' }}>{text.title}</h2>
      </div>
      <span className="muted" style={{ lineHeight: 1.55 }}>
        {text.body}
      </span>
    </section>
  )
}
