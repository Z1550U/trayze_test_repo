import {
  addPasskeySlot,
  encodeKeyring,
  unb64u,
  type Keyring
} from '../core/keyring'
import { createPasskey, passkeySecret, relyingPartyId } from '../core/passkey'
import type { Anchor } from '../chain/anchor'
import type { Unlocked } from './keyBroker'

const passkeyLabel = (attachment?: string) =>
  `${attachment === 'platform' ? 'This device' : attachment === 'cross-platform' ? 'Phone or security key' : 'Passkey'} · ${new Date().toLocaleDateString('en-GB')}`

/** Puts the keyring on-chain and waits until it is confirmed. */
export async function storeKeyring(anchor: Anchor, ring: Keyring) {
  const receipt = await anchor.setKeyring(encodeKeyring(ring))
  const done = await anchor.confirm(receipt)
  if (done.status === 'failed') throw new Error('The network did not accept the transaction.')
}

/** Adds a passkey to the keyring (creating one, then reading its PRF secret). */
export async function withNewPasskey(ring: Keyring, raw: Uint8Array): Promise<{ ring: Keyring; label: string }> {
  const salt = unb64u(ring.prfSalt)
  const created = await createPasskey(`trayze · ${new Date().toLocaleDateString('en-GB')}`, salt)
  if (created.prfEnabled === false) throw new Error('This passkey cannot derive keys (PRF not supported) – use the recovery code instead.')
  const secret = created.secretAtCreation ?? (await passkeySecret(salt, created.id)).secret
  if (!secret) throw new Error('This passkey cannot derive keys (PRF not supported) – use the recovery code instead.')
  const label = passkeyLabel(created.attachment)
  return { ring: await addPasskeySlot(ring, raw, { credId: created.id, rpId: relyingPartyId(), label, prfSecret: secret }), label }
}

export async function addPasskey(anchor: Anchor, current: Unlocked): Promise<Unlocked> {
  const { ring } = await withNewPasskey(current.ring, current.raw)
  await storeKeyring(anchor, ring)
  return { ...current, ring }
}

