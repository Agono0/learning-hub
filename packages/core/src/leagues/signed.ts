/**
 * Signed league mutations (lh-league-mutation/v1).
 *
 * INACTIVE GROUNDWORK. Nothing in the shipped app calls this yet; leagues
 * stay local/friendly practice until the owner approves activation. This
 * module defines how a *remote* league authority would accept a change:
 *
 *   1. The client signs a canonical payload with its device key (ECDSA P-256
 *      over SHA-256, the same scheme as /api/v1/auth/register-key).
 *   2. The authority checks the envelope shape, the clock window, the nonce,
 *      the per-signer sequence number and the signature, in that order.
 *   3. Only then is the mutation handed to the authority reducer, which
 *      stamps its own timing (see authority.ts).
 *
 * The signer identity is derived from the public key, never from a field the
 * client chooses. A signature proves possession of the key, nothing else:
 * it does not prove the answers were produced without help.
 */
import { z } from 'zod'
import { canonicalSignaturePayload, signedEnvelopeSchema, type SignedEnvelope } from '../online'
import { LeagueMutationSchema, type LeagueMutation } from './signed-schemas'

export { LeagueMutationSchema, type LeagueMutation }

export const LEAGUE_MUTATION_DOMAIN = 'lh-league-mutation/v1'

/** Accepted distance between the signer's clock and the authority's clock. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000

/** Nonces are remembered at least this long (must exceed the skew window x2). */
export const NONCE_RETENTION_MS = 2 * MAX_CLOCK_SKEW_MS + 60_000

/** What the client actually signs: the domain, a sequence and the mutation. */
export const LeagueSignedPayloadSchema = z.object({
  domain: z.literal(LEAGUE_MUTATION_DOMAIN),
  leagueId: z.string().min(1).max(100),
  /** Strictly increasing per signer per league; starts at 1. */
  seq: z.number().int().positive(),
  mutation: LeagueMutationSchema,
})
export type LeagueSignedPayload = z.infer<typeof LeagueSignedPayloadSchema>

export type VerifyFailureCode =
  | 'bad_envelope'
  | 'bad_payload'
  | 'wrong_domain'
  | 'league_mismatch'
  | 'stale_timestamp'
  | 'future_timestamp'
  | 'replayed_nonce'
  | 'bad_seq'
  | 'bad_signature'

export type VerifiedMutation =
  | {
      ok: true
      signer: string
      pubKey: string
      seq: number
      nonce: string
      timestamp: number
      leagueId: string
      mutation: LeagueMutation
    }
  | { ok: false; code: VerifyFailureCode; detail?: string }

/** Pluggable signature check so the core stays runtime-agnostic and testable. */
export type SignatureVerifier = (args: {
  pubKey: string
  message: string
  signature: string
}) => Promise<boolean>

export interface ReplayLedger {
  /** True when this nonce was already accepted inside the retention window. */
  hasNonce(nonce: string): boolean
  /** Last accepted sequence number for a signer (0 when none). */
  lastSeq(signer: string): number
}

/**
 * Stable signer identity: usr_ + the first 128 bits of SHA-256 over the raw
 * public key. NOT a prefix of the key text: every P-256 SPKI key shares an
 * identical ASN.1 header, so a text prefix would give all users one identity.
 */
export async function signerIdFromPubKey(pubKey: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pubKey)),
  )
  let hex = ''
  for (const b of digest.slice(0, 16)) hex += b.toString(16).padStart(2, '0')
  return `usr_${hex}`
}

/** The exact string a client must sign for one mutation. */
export function leagueSigningMessage(
  payloadJson: string,
  timestamp: number,
  nonce: string,
): string {
  // The raw payload string is signed and verified byte-for-byte: it is never
  // re-serialized, so key order can never differ between signer and verifier.
  return canonicalSignaturePayload(payloadJson, timestamp, nonce)
}

/**
 * Verify one envelope. The order matters: cheap structural and replay checks
 * run before the signature so garbage and replays never cost a crypto op, and
 * the signature is checked BEFORE any state the envelope names is consulted
 * beyond the replay ledger. Does not mutate the ledger: the caller records
 * the acceptance only after the reducer commits.
 */
export async function verifyLeagueEnvelope(args: {
  envelope: unknown
  expectedLeagueId: string
  now: number
  ledger: ReplayLedger
  verify: SignatureVerifier
}): Promise<VerifiedMutation> {
  const env = signedEnvelopeSchema.safeParse(args.envelope)
  if (!env.success) return { ok: false, code: 'bad_envelope' }
  const envelope: SignedEnvelope = env.data

  let payloadJson: unknown
  try {
    payloadJson = JSON.parse(envelope.payload)
  } catch {
    return { ok: false, code: 'bad_payload', detail: 'payload is not JSON' }
  }
  const domainProbe = z.object({ domain: z.string() }).safeParse(payloadJson)
  if (domainProbe.success && domainProbe.data.domain !== LEAGUE_MUTATION_DOMAIN) {
    return { ok: false, code: 'wrong_domain' }
  }
  const parsed = LeagueSignedPayloadSchema.safeParse(payloadJson)
  if (!parsed.success) {
    return { ok: false, code: 'bad_payload', detail: parsed.error.issues[0]?.message }
  }
  const payload = parsed.data
  if (payload.leagueId !== args.expectedLeagueId) return { ok: false, code: 'league_mismatch' }

  const skew = envelope.timestamp - args.now
  if (skew > MAX_CLOCK_SKEW_MS) return { ok: false, code: 'future_timestamp' }
  if (-skew > MAX_CLOCK_SKEW_MS) return { ok: false, code: 'stale_timestamp' }

  if (args.ledger.hasNonce(envelope.nonce)) return { ok: false, code: 'replayed_nonce' }

  const signer = await signerIdFromPubKey(envelope.pubKey)
  if (payload.seq <= args.ledger.lastSeq(signer)) {
    return { ok: false, code: 'bad_seq', detail: 'sequence must increase' }
  }

  const message = leagueSigningMessage(envelope.payload, envelope.timestamp, envelope.nonce)
  let valid = false
  try {
    valid = await args.verify({
      pubKey: envelope.pubKey,
      message,
      signature: envelope.signature,
    })
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, code: 'bad_signature' }

  return {
    ok: true,
    signer,
    pubKey: envelope.pubKey,
    seq: payload.seq,
    nonce: envelope.nonce,
    timestamp: envelope.timestamp,
    leagueId: payload.leagueId,
    mutation: payload.mutation,
  }
}

// ─── WebCrypto helpers (browser, worker and Node >= 20) ────────────────────

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/** Verifier for ECDSA P-256 / SHA-256 with a base64 SPKI public key. */
export const webCryptoVerifier: SignatureVerifier = async ({ pubKey, message, signature }) => {
  const key = await crypto.subtle.importKey(
    'spki',
    b64ToBytes(pubKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    b64ToBytes(signature),
    new TextEncoder().encode(message),
  )
}

export interface LeagueSigner {
  /** Base64 SPKI public key. */
  pubKey: string
  privateKey: CryptoKey
}

/** Generate a throwaway P-256 signer (tests, and first-run local identity). */
export async function generateLeagueSigner(): Promise<LeagueSigner> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  return { pubKey: bytesToB64(spki), privateKey: pair.privateKey }
}

/** Build and sign one envelope. Nonce must be unique per signature. */
export async function signLeagueMutation(args: {
  signer: LeagueSigner
  leagueId: string
  seq: number
  mutation: LeagueMutation
  timestamp: number
  nonce: string
}): Promise<SignedEnvelope> {
  const payload: LeagueSignedPayload = LeagueSignedPayloadSchema.parse({
    domain: LEAGUE_MUTATION_DOMAIN,
    leagueId: args.leagueId,
    seq: args.seq,
    mutation: args.mutation,
  })
  const payloadJson = JSON.stringify(payload)
  const message = leagueSigningMessage(payloadJson, args.timestamp, args.nonce)
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      args.signer.privateKey,
      new TextEncoder().encode(message),
    ),
  )
  return {
    payload: payloadJson,
    timestamp: args.timestamp,
    nonce: args.nonce,
    pubKey: args.signer.pubKey,
    signature: bytesToB64(sig),
  }
}
