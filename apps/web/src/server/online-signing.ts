/**
 * Signs requests and room-join assertions for the online worker with the device key.
 *
 * The private key never leaves the server: the browser only ever receives a finished,
 * short-lived join assertion. A device without a key (or not in device_key mode) gets null and
 * stays anonymous, exactly as before.
 */
import {
  digestHex,
  joinAssertionPayload,
  requestSigningPayload,
  signIdentityPayload,
} from '@learning-hub/core/identity-crypto'
import { getOnlineIdentity } from '@learning-hub/db'

/** How long a join assertion stays valid. The worker allows at most 5 minutes. */
const JOIN_ASSERTION_TTL_MS = 2 * 60_000

function keyPair(): { pubKey: string; privKey: string } | null {
  const id = getOnlineIdentity()
  if (id.mode !== 'device_key' || !id.pubKey || !id.privKey) return null
  return { pubKey: id.pubKey, privKey: id.privKey }
}

/** Headers that authenticate one POST to the worker, or null when this device has no key. */
export async function signWorkerRequest(
  serverUrl: string,
  path: string,
  body: string,
  now = Date.now(),
): Promise<Record<string, string> | null> {
  const kp = keyPair()
  if (!kp) return null
  const payload = requestSigningPayload({
    method: 'POST',
    host: new URL(serverUrl).host,
    pathAndQuery: path,
    timestamp: now,
    bodySha256: await digestHex(new TextEncoder().encode(body)),
  })
  return {
    'x-lh-key': kp.pubKey,
    'x-lh-ts': String(now),
    'x-lh-sig': await signIdentityPayload(kp.privKey, payload),
  }
}

export interface JoinAssertion {
  key: string
  exp: number
  jti: string
  sig: string
}

/** A single-use assertion for joining one room on one worker, or null without a key. */
export async function makeJoinAssertion(
  serverUrl: string,
  roomCode: string,
  now = Date.now(),
): Promise<JoinAssertion | null> {
  const kp = keyPair()
  if (!kp) return null
  const exp = now + JOIN_ASSERTION_TTL_MS
  const jti = crypto.randomUUID().replace(/-/g, '')
  const sig = await signIdentityPayload(
    kp.privKey,
    joinAssertionPayload({ host: new URL(serverUrl).host, room: roomCode, exp, jti }),
  )
  return { key: kp.pubKey, exp, jti, sig }
}
