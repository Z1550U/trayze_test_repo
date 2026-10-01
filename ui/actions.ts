import type { Anchor } from '../chain/anchor'
import { store } from '../core/store'
import { randomId } from '../core/hash'
import { buildManifest, hashManifest, projectMetaHash, type ManifestInput } from '../core/manifest'
import type { AnchorReceipt, Entry, Project } from '../core/types'
import { agreementId as computeAgreementId, normAddress, type AgreementTerms, type Party } from '../core/agreement'
import { entryContext, projectContext, seal, sealEntry } from '../core/seal'
import { sealKey } from './keyBroker'

function errorText(e: unknown): string {
  const t = e instanceof Error ? e.message : String(e)
  if (/reject|denied|cancel/i.test(t)) return 'The signature was declined in the wallet.'
  if (/insufficient|not enough/i.test(t)) return 'Not enough ALPH to pay the network fee.'
  return t
}

/** The private details of an entry, encrypted for the chain backup. */
async function sealFor(anchor: Anchor, entry: Entry): Promise<string> {
  const key = await sealKey(anchor)
  return sealEntry(
    key,
    {
      v: 1,
      manifest: entry.manifest,
      fileName: entry.fileName,
      kind: entry.kind,
      meta: entry.allMeta.filter((m) => m.key in entry.manifest.metadata),
      created: entry.created,
      work: entry.work,
      agreement: entry.agreement?.terms
    },
    entryContext(entry.projectId, entry.fileHash)
  )
}

export async function createProject(anchor: Anchor, name: string, description?: string): Promise<Project> {
  const created = Date.now()
  const project: Project = {
    id: randomId(32),
    name: name.trim(),
    description: description?.trim() || undefined,
    created,
    metaHash: await projectMetaHash(name, created)
  }
  store.saveProject(project)
  try {
    const sealed = await seal(await sealKey(anchor), { v: 1, name: project.name, description: project.description, created }, projectContext(project.id))
    const receipt = await anchor.createProject(project.id, project.metaHash, sealed)
    store.saveProject({ ...project, anchor: receipt })
    void anchor.confirm(receipt).then((r) => {
      const current = store.data().projects.find((p) => p.id === project.id)
      if (current) store.saveProject({ ...current, anchor: r })
    })
    return { ...project, anchor: receipt }
  } catch (e) {
    // The project stays local; anchoring can be retried later
    throw new Error(errorText(e))
  }
}

export type Phase = 'sign' | 'submit' | 'confirm' | 'done'

/**
 * Where a new version goes: `parent` is the manifest hash of the version it builds on ('' = a new
 * file in the project), `work` the file's name. See core/works.ts.
 */
export interface Placement {
  parent: string
  work: string
}

export async function anchorEntry(anchor: Anchor, input: Omit<ManifestInput, 'prevHash'> & Placement, onPhase: (p: Phase) => void): Promise<Entry> {
  const prevHash = input.parent
  const manifest = buildManifest({ ...input, prevHash })
  const manifestHash = await hashManifest(manifest)

  const entry: Entry = {
    id: randomId(16),
    projectId: input.projectId,
    title: manifest.title,
    stage: manifest.stage,
    note: manifest.note,
    fileName: input.analysis.name,
    kind: input.analysis.kind,
    size: input.analysis.size,
    fileHash: input.fileHash,
    visualHash: input.analysis.visualHash,
    manifest,
    manifestHash,
    prevHash,
    allMeta: input.analysis.meta,
    created: Date.now(),
    work: input.work.trim() || undefined
  }

  onPhase('sign')
  let receipt: AnchorReceipt
  try {
    const sealed = await sealFor(anchor, entry)
    receipt = await anchor.addEntry(entry.projectId, entry.fileHash, manifestHash, prevHash, sealed)
  } catch (e) {
    throw new Error(errorText(e))
  }
  onPhase('submit')
  store.saveEntry({ ...entry, anchor: receipt })
  onPhase('confirm')
  const confirmed = await anchor.confirm(receipt)
  const done = { ...entry, anchor: confirmed }
  store.saveEntry(done)
  onPhase('done')
  return done
}

// ---------- Co-signed entries ----------


interface ProposalInput extends Omit<ManifestInput, 'prevHash'>, Placement {
  parties: Party[]
  splits: boolean
  /** Separate payout recipients (freelancers …); the parties then carry no shares. */
  payees?: Party[]
  deadline: number
}

/** Anchors a proposal. The entry becomes final once every party has confirmed. */
export async function proposeAgreement(anchor: Anchor, input: ProposalInput, onPhase: (p: Phase) => void): Promise<Entry> {
  const initiator = anchor.owner()
  if (!initiator) throw new Error('No wallet connected')
  const prevHash = input.parent
  const manifest = buildManifest({ ...input, prevHash })
  const manifestHash = await hashManifest(manifest)
  const separate = input.splits && !!input.payees?.length
  const terms: AgreementTerms = {
    schema: 'trayze/agreement@1',
    initiator: normAddress(initiator),
    projectId: input.projectId,
    prevHash,
    file: { sha256: input.fileHash, size: input.analysis.size, category: input.analysis.kind.category, name: input.includeFileName ? input.analysis.name : undefined },
    manifestHash,
    title: manifest.title,
    parties: input.parties.map((p) => ({
      address: normAddress(p.address),
      name: p.name.trim(),
      role: p.role?.trim() || undefined,
      shareBps: input.splits && !separate ? p.shareBps : undefined
    })),
    splits: input.splits,
    // Only present when used – older and ordinary agreements keep exactly their previous ID.
    payees: separate
      ? input.payees!.map((p) => ({ address: normAddress(p.address), name: p.name.trim(), role: p.role?.trim() || undefined, shareBps: p.shareBps }))
      : undefined,
    deadline: input.deadline,
    created: Date.now()
  }
  const id = await computeAgreementId(terms)

  const entry: Entry = {
    id: randomId(16),
    projectId: input.projectId,
    title: manifest.title,
    stage: manifest.stage,
    note: manifest.note,
    fileName: input.analysis.name,
    kind: input.analysis.kind,
    size: input.analysis.size,
    fileHash: input.fileHash,
    visualHash: input.analysis.visualHash,
    manifest,
    manifestHash,
    prevHash,
    allMeta: input.analysis.meta,
    created: Date.now(),
    work: input.work.trim() || undefined,
    agreement: { id, terms }
  }

  onPhase('sign')
  let receipt: AnchorReceipt
  try {
    const sealed = await sealFor(anchor, entry)
    receipt = await anchor.proposeAgreement(id, input.projectId, input.fileHash, manifestHash, prevHash, sealed)
  } catch (e) {
    throw new Error(errorText(e))
  }
  onPhase('submit')
  store.saveEntry({ ...entry, anchor: receipt })
  onPhase('confirm')
  const confirmed = await anchor.confirm(receipt)
  const done = { ...entry, anchor: confirmed }
  store.saveEntry(done)
  onPhase('done')
  return done
}

export async function respondToAgreement(anchor: Anchor, id: string, accept: boolean, onPhase: (p: Phase) => void = () => {}): Promise<AnchorReceipt> {
  let receipt: AnchorReceipt
  onPhase('sign')
  try {
    receipt = accept ? await anchor.confirmAgreement(id) : await anchor.declineAgreement(id)
  } catch (e) {
    throw new Error(errorText(e))
  }
  onPhase('submit')
  onPhase('confirm')
  const confirmed = await anchor.confirm(receipt)
  if (confirmed.status === 'failed') throw new Error('The transaction was not accepted by the network.')
  onPhase('done')
  return confirmed
}

export function inviteLink(terms: AgreementTerms, encode: (t: AgreementTerms) => string): string {
  return `${window.location.origin}${window.location.pathname}#/agreement/${encode(terms)}`
}
