import { useSyncExternalStore } from 'react'
import type { Anchor } from '../chain/anchor'
import { dataKey, decodeKeyring, type Keyring } from '../core/keyring'
import { forgetOnDevice, isKeptOnDevice, keepOnDevice, keptOnDevice } from './deviceKeys'

/**
 * Hands out the data key that encrypts the private details.
 *
 * The key lives in memory only, per wallet and network. If it isn't there yet, the broker asks the
 * KeyGate dialog: "setup" when this wallet has no keyring on-chain, otherwise "unlock" (passkey or
 * recovery code). Actions simply await sealKey(anchor) and never deal with the dialog themselves.
 * If the user chose "Remember on this device", the key comes from deviceKeys.ts instead.
 */
export interface Unlocked {
  raw: Uint8Array
  key: CryptoKey
  ring: Keyring
}

export type KeyMode = 'setup' | 'unlock' | 'renew-code'

export interface KeyRequest {
  mode: KeyMode
  anchor: Anchor
  ring?: Keyring
  /** For renew-code: the already unlocked key */
  current?: Unlocked
  /** keep: remember the key on this device (see deviceKeys.ts) */
  resolve: (u: Unlocked, opts?: { keep?: boolean }) => void
  reject: (e: Error) => void
}

const unlocked = new Map<string, Unlocked>()
const pending = new Map<string, Promise<Unlocked>>()
let request: KeyRequest | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const idOf = (anchor: Anchor) => `${anchor.scope}:${anchor.owner() ?? ''}`

function ask(mode: KeyMode, anchor: Anchor, ring?: Keyring, current?: Unlocked): Promise<Unlocked> {
  return new Promise<Unlocked>((resolve, reject) => {
    request = {
      mode,
      anchor,
      ring,
      current,
      resolve: (u, opts) => {
        const id = idOf(anchor)
        unlocked.set(id, u)
        // A new recovery code: keep this device remembered (with the new code's stamp)
        if (opts?.keep) void keepOnDevice(id, u.raw, u.ring).catch(() => undefined)
        else if (mode === 'renew-code') void isKeptOnDevice(id).then((kept) => (kept ? keepOnDevice(id, u.raw, u.ring) : undefined)).catch(() => undefined)
        request = undefined
        emit()
        resolve(u)
      },
      reject: (e) => {
        request = undefined
        emit()
        reject(e)
      }
    }
    emit()
  })
}

export async function readKeyring(anchor: Anchor): Promise<Keyring | undefined> {
  const owner = anchor.owner()
  if (!owner) throw new Error('No wallet connected')
  const hex = await anchor.keyring(owner)
  return hex ? decodeKeyring(hex) : undefined
}

/** The unlocked key for this wallet – opens the setup or unlock dialog when needed. */
export function unlock(anchor: Anchor): Promise<Unlocked> {
  const id = idOf(anchor)
  const have = unlocked.get(id)
  if (have) return Promise.resolve(have)
  let p = pending.get(id)
  if (!p) {
    p = readKeyring(anchor)
      .then(async (ring) => {
        const kept = ring && (await keptOnDevice(id, ring))
        if (ring && kept) {
          const u = await toUnlocked(kept, ring)
          unlocked.set(id, u)
          emit()
          return u
        }
        return ask(ring ? 'unlock' : 'setup', anchor, ring)
      })
      .finally(() => pending.delete(id))
    pending.set(id, p)
  }
  return p
}

export const sealKey = async (anchor: Anchor): Promise<CryptoKey> => (await unlock(anchor)).key

export const unlockedFor = (anchor: Anchor) => unlocked.get(idOf(anchor))

/** Stores an updated keyring (new passkey, new code) after it went on-chain. */
export function remember(anchor: Anchor, u: Unlocked) {
  unlocked.set(idOf(anchor), u)
  emit()
}

export const isRemembered = (anchor: Anchor) => isKeptOnDevice(idOf(anchor))
/** Forgets the key on this device and locks the current session. */
export async function forgetDevice(anchor: Anchor) {
  await forgetOnDevice(idOf(anchor))
  unlocked.delete(idOf(anchor))
  emit()
}

export async function renewCode(anchor: Anchor): Promise<Unlocked> {
  const current = await unlock(anchor)
  return ask('renew-code', anchor, current.ring, current)
}

export const toUnlocked = async (raw: Uint8Array, ring: Keyring): Promise<Unlocked> => ({ raw, ring, key: await dataKey(raw) })

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useKeyRequest = () => useSyncExternalStore(subscribe, () => request)
/** Re-renders when a keyring was unlocked or changed. */
export const useKeyringVersion = () => useSyncExternalStore(subscribe, () => unlocked.size + ':' + [...unlocked.values()].map((u) => u.ring.slots.length).join(','))
