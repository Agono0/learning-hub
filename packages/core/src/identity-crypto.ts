/**
 * Device identity keys — real Web Crypto signatures for the online surfaces.
 *
 * Replaces the old `Math.random()` hex "keys" with ECDSA P-256 (WebCrypto's
 * most portable curve: browsers, Node 22+ and Cloudflare Workers all ship it).
 * The private key stays in the local database (identity tables are stripped
 * from every sync/backup); only the public key ever registers with a worker.
 * The worker verifies a signed challenge, so an alias can be trusted to match
 * a key without any shared secret.
 */

export interface IdentityKeyPair {
  /** base64 SPKI public key — safe to register anywhere. */
  publicKey: string
  /** base64 PKCS#8 private key — local-only. */
  privateKey: string
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto
  if (!c || !c.subtle) {
    throw new Error('WebCrypto unavailable in this runtime')
  }
  return c.subtle
}

function toBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]!)
  // btoa exists in browsers, workers and Node ≥ 16.
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

/** Generates a P-256 ECDSA signing pair and exports both halves as base64. */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const pair = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const [publicKey, privateKey] = await Promise.all([
    subtle().exportKey('spki', pair.publicKey),
    subtle().exportKey('pkcs8', pair.privateKey),
  ])
  return { publicKey: toBase64(publicKey), privateKey: toBase64(privateKey) }
}

/** Signs an arbitrary UTF-8 payload string; returns a base64 signature. */
export async function signIdentityPayload(privateKeyB64: string, payload: string): Promise<string> {
  const key = await subtle().importKey(
    'pkcs8',
    fromBase64(privateKeyB64) as unknown as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sig = await subtle().sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(payload) as unknown as ArrayBuffer,
  )
  return toBase64(sig)
}

/** Verifies a base64 signature over a UTF-8 payload with a base64 SPKI key. */
export async function verifyIdentityPayload(
  publicKeyB64: string,
  payload: string,
  signatureB64: string,
): Promise<boolean> {
  try {
    const key = await subtle().importKey(
      'spki',
      fromBase64(publicKeyB64) as unknown as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    return await subtle().verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64(signatureB64) as unknown as ArrayBuffer,
      new TextEncoder().encode(payload) as unknown as ArrayBuffer,
    )
  } catch {
    return false
  }
}

/** The canonical challenge a client signs when registering with a worker. */
export function identityChallenge(userId: string, timestamp: number): string {
  return `lh-identity:v1:${userId}:${timestamp}`
}

/**
 * The exact string that gets signed for a registration: the challenge PLUS the
 * alias, so a valid signature is only reusable for that one alias (an
 * impostor can't replay it under a different name).
 */
export function identitySigningPayload(challenge: string, alias: string): string {
  return `${challenge}|${alias}`
}
