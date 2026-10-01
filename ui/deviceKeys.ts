/**
 * "Remember on this device" – keeps the unlocked data key in this browser's IndexedDB so the
 * recovery code isn't needed every session (useful where passkeys don't work, e.g. inside a
 * wallet app's browser).
 *
 * The data key is stored wrapped with a non-extractable AES key that also lives in IndexedDB:
 * copying the stored bytes off the device is not enough to read it. Anyone who can use this
 * browser on this device, however, can open the private details – the UI says so.
 *
 * Each record remembers which recovery code was current. Issuing a new recovery code (on any
 * device) therefore signs out every other remembered device.
 */
import type { Keyring } from '../core/keyring'

const DB = 'trayze-device'
const STORE = 'keys'
const DEVICE_KEY = '__device'

interface Record {
  iv: Uint8Array<ArrayBuffer>
  wrapped: ArrayBuffer
  codeStamp: number
  saved: number
}

/** Identifies the recovery code that was current – 0 for a keyring without code. */
const codeStamp = (ring: Keyring) => ring.slots.find((s) => s.kind === 'code')?.created ?? 0

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

async function deviceKey(): Promise<CryptoKey> {
  const have = await tx<CryptoKey | undefined>('readonly', (s) => s.get(DEVICE_KEY))
  if (have) return have
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await tx('readwrite', (s) => s.put(key, DEVICE_KEY))
  return key
}

export async function keepOnDevice(id: string, raw: Uint8Array, ring: Keyring): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) }, await deviceKey(), new Uint8Array(raw))
  const rec: Record = { iv, wrapped, codeStamp: codeStamp(ring), saved: Date.now() }
  await tx('readwrite', (s) => s.put(rec, id))
}

/** The remembered data key – or undefined (and the record is dropped) if the recovery code changed since. */
export async function keptOnDevice(id: string, ring: Keyring): Promise<Uint8Array | undefined> {
  try {
    const rec = await tx<Record | undefined>('readonly', (s) => s.get(id))
    if (!rec) return undefined
    if (rec.codeStamp !== codeStamp(ring)) {
      await forgetOnDevice(id)
      return undefined
    }
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv, additionalData: new TextEncoder().encode(id) }, await deviceKey(), rec.wrapped)
    return new Uint8Array(raw)
  } catch {
    return undefined
  }
}

export async function isKeptOnDevice(id: string): Promise<boolean> {
  try {
    return !!(await tx<Record | undefined>('readonly', (s) => s.get(id)))
  } catch {
    return false
  }
}

export async function forgetOnDevice(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch {
    /* storage unavailable – nothing to forget */
  }
}
