import type { Anchor } from '../chain/anchor'
import { store } from '../core/store'
import { randomId } from '../core/hash'
import { hashManifest, projectMetaHash } from '../core/manifest'
import { agreementId, sameAddress } from '../core/agreement'
import { reconcile, type Reconciliation } from '../core/reconcile'
import { entryContext, projectContext, unseal, type SealedEntry, type SealedProject } from '../core/seal'
import type { AnchorReceipt, Entry, Project } from '../core/types'
import { sealKey } from './keyBroker'

/** Old receipts have no scope – fall back to the network name. */
export const scopeOf = (r?: AnchorReceipt) => r?.scope ?? r?.network ?? 'simulation'

function localData(anchor: Anchor) {
  const d = store.data()
  const projects = d.projects.filter((p) => scopeOf(p.anchor) === anchor.scope)
  const ids = new Set(projects.map((p) => p.id))
  return { projects, entries: d.entries.filter((e) => ids.has(e.projectId)) }
}

/** Compares this browser with the registry. Needs no signature – only fingerprints are compared. */
export async function checkSync(anchor: Anchor): Promise<Reconciliation> {
  const me = anchor.owner()
  if (!me) throw new Error('No wallet connected')
  return reconcile(localData(anchor), await anchor.history(me), me, sameAddress)
}

export interface RestoreResult {
  projects: number
  entries: number
  /** Entries without a readable backup (made before sealing existed, or with another wallet) */
  unreadable: number
}

/**
 * Brings back what is on-chain but missing here. Unlocks the data key once (passkey or recovery code).
 * Every restored item is verified against its on-chain fingerprint before it is saved.
 */
export async function restoreFromChain(anchor: Anchor, rec: Reconciliation): Promise<RestoreResult> {
  const me = anchor.owner()!
  const key = await sealKey(anchor)
  const receipt = (txId: string, time?: number): AnchorReceipt => ({ network: anchor.network, scope: anchor.scope, txId, owner: me, time, status: 'confirmed' })
  const result: RestoreResult = { projects: 0, entries: 0, unreadable: 0 }
  const known = new Set(localData(anchor).projects.map((p) => p.id))

  const placeholder = (projectId: string, time?: number): Project => ({
    id: projectId,
    name: `Restored project ${projectId.slice(0, 6)}`,
    created: time ?? Date.now(),
    metaHash: '',
    anchor: receipt('', time)
  })

  for (const p of rec.missingProjects) {
    let project: Project | undefined
    if (p.sealed) {
      try {
        const d = await unseal<SealedProject>(key, p.sealed, projectContext(p.projectId))
        if ((await projectMetaHash(d.name, d.created)) === p.metaHash) {
          project = { id: p.projectId, name: d.name, description: d.description, created: d.created, metaHash: p.metaHash, anchor: receipt(p.txId, p.time) }
        }
      } catch {
        /* not readable with this wallet */
      }
    }
    store.saveProject(project ?? { ...placeholder(p.projectId, p.time), metaHash: p.metaHash, anchor: receipt(p.txId, p.time) })
    known.add(p.projectId)
    result.projects++
  }

  const entries = [...rec.missingEntries].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
  for (const e of entries) {
    if (!e.sealed) {
      result.unreadable++
      continue
    }
    try {
      const d = await unseal<SealedEntry>(key, e.sealed, entryContext(e.projectId, e.fileHash))
      if ((await hashManifest(d.manifest)) !== e.manifestHash) throw new Error('Manifest does not match its fingerprint')
      if (e.agreementId && (!d.agreement || (await agreementId(d.agreement)) !== e.agreementId)) throw new Error('Agreement does not match')
      if (!known.has(e.projectId)) {
        store.saveProject(placeholder(e.projectId, e.time))
        known.add(e.projectId)
      }
      const entry: Entry = {
        id: randomId(16),
        projectId: e.projectId,
        title: d.manifest.title,
        stage: d.manifest.stage,
        note: d.manifest.note,
        fileName: d.fileName,
        kind: d.kind,
        size: d.manifest.file.size,
        fileHash: e.fileHash,
        visualHash: d.manifest.file.visualHash,
        manifest: d.manifest,
        manifestHash: e.manifestHash,
        prevHash: e.prevHash,
        allMeta: d.meta,
        created: d.created,
        anchor: receipt(e.txId, e.time),
        work: d.work,
        agreement: e.agreementId && d.agreement ? { id: e.agreementId, terms: d.agreement } : undefined
      }
      store.saveEntry(entry)
      result.entries++
    } catch {
      result.unreadable++
    }
  }
  return result
}
