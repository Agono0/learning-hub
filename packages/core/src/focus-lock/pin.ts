/**
 * Max Focus PIN vault (pure, runtime-neutral) — M2-02.
 *
 * The PIN is the last-resort exit key for a Max Focus session (M2-01's
 * `confirmSessionExit` consumes the VERDICT, never the PIN itself). It must
 * survive app restarts and device reboots, so it is stored — but never in
 * recoverable form:
 *
 * - **KDF:** PBKDF2-HMAC-SHA256, 600,000 iterations by default (OWASP 2023
 *   guidance for SHA-256; deliberately higher than sync-crypto's envelope
 *   default because a 4–12 digit PIN has far less entropy than a passphrase —
 *   the hash is the only thing standing between a thief and the session gate).
 * - **Storage:** a `PinRecord` (see {@link pinVaultSchema}) embedded in the
 *   userSettings JSON — fresh 16-byte CSPRNG salt per record, hex-encoded
 *   fields, zod-validated on every read so a corrupted record falls back to
 *   "no vault" instead of poisoning the exit flow.
 * - **Recovery:** a security question whose ANSWER (normalized) is hashed with
 *   its OWN salt — answering it re-enables setting a new PIN; it never reveals
 *   the old one.
 *
 * Runtime-neutral: standard Web Crypto only (`crypto.subtle` +
 * `crypto.getRandomValues`), available in Node 22+, browsers, the Windows
 * WebView2 and Android webview workers — zero dependencies, no node builtins
 * (core rule).
 */
import { z } from 'zod'

/**
 * PBKDF2-HMAC-SHA256 iterations for PIN/answer hashing (OWASP 2023+: 600k for
 * SHA-256 when the secret is low-entropy). Overridable per call for tests.
 */
export const PIN_PBKDF2_ITERATIONS = 600_000

/** PIN policy: 4–12 digits — long enough to resist guessing, short to type under pressure. */
export const pinSchema = z.string().regex(/^\d{4,12}$/, 'PIN must be 4–12 digits')

/** The normalized security answer we actually hash (case/whitespace-insensitive). */
export const securityAnswerSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().min(1, 'Security answer cannot be empty').max(200))

/**
 * A stored PIN vault record — embed this object in userSettings JSON
 * (`pin` column-free design: the record IS the vault; there is no plaintext
 * anywhere, and `pinSet === false` means "not configured yet").
 */
export const pinVaultSchema = z.object({
  /** Vault format version — bump only with a re-hash migration. */
  version: z.literal(1),
  /** PBKDF2 iteration count used for THIS record (stored per-record for rotation). */
  iterations: z.number().int().positive(),
  /** 16-byte CSPRNG salt, hex (32 chars). */
  salt: z.string().regex(/^[0-9a-f]{32}$/, 'salt must be 32 hex chars'),
  /** 32-byte PBKDF2 output, hex (64 chars). */
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be 64 hex chars'),
  /** Security question shown at recovery (optional until both parts provided). */
  question: z.string().min(1).max(200).optional(),
  /** Hash of the normalized answer, hex — its own salt, never the PIN's. */
  answerHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  answerSalt: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
})

/** The parsed {@link pinVaultSchema} shape. */
export type PinVault = z.infer<typeof pinVaultSchema>

/** Input for {@link createPinVault}. */
export interface CreatePinInput {
  /** 4–12 digit PIN. */
  pin: string
  /** Optional security question (shown verbatim at recovery). */
  question?: string
  /** Answer to the security question — required when `question` is set. */
  answer?: string
}

/** Throw a clear error when Web Crypto is unavailable (mirrors sync-crypto). */
function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Web Crypto subtle API is unavailable in this runtime')
  }
  return subtle
}

/** CSPRNG bytes → hex (no base64 anywhere in the vault: hex is unambiguous). */
function randomHex(bytes: number): string {
  const buf = new ArrayBuffer(bytes)
  globalThis.crypto.getRandomValues(new Uint8Array(buf))
  return bytesToHex(new Uint8Array(buf))
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(hex.length / 2)
  const out = new Uint8Array(buf)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** PBKDF2-HMAC-SHA256 over `secret` with `salt` → 32 raw bytes. */
async function pbkdf2Sha256(
  secret: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const subtle = requireSubtle()
  const enc = new TextEncoder()
  const keyMaterial = await subtle.importKey('raw', enc.encode(secret), { name: 'PBKDF2' }, false, [
    'deriveBits',
  ])
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
}

/**
 * Constant-time comparison of two byte arrays. Byte lengths are compared
 * first (hash lengths are fixed by the schema, so this leaks nothing useful);
 * content differences never short-circuit.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Create the vault record for a PIN (first use, or a replacement set after a
 * successful recovery). Every call generates a fresh salt, so two records for
 * the same PIN are never identical. With a `question`, an `answer` is
 * required and hashed under its own salt.
 */
export async function createPinVault(
  input: CreatePinInput,
  opts: { iterations?: number } = {},
): Promise<PinVault> {
  const pin = pinSchema.parse(input.pin)
  const hasQuestion = input.question !== undefined
  if (hasQuestion !== (input.answer !== undefined)) {
    throw new Error('Security question and answer must be provided together')
  }
  const iterations = opts.iterations ?? PIN_PBKDF2_ITERATIONS

  const saltHex = randomHex(16)
  const hash = await pbkdf2Sha256(pin, hexToBytes(saltHex), iterations)

  let answerHash: string | undefined
  let answerSalt: string | undefined
  if (hasQuestion) {
    const question = z.string().min(1).max(200).parse(input.question)
    const answer = securityAnswerSchema.parse(input.answer)
    answerSalt = randomHex(16)
    const answerBits = await pbkdf2Sha256(answer, hexToBytes(answerSalt), iterations)
    answerHash = bytesToHex(answerBits)
    return {
      version: 1,
      iterations,
      salt: saltHex,
      hash: bytesToHex(hash),
      question,
      answerHash,
      answerSalt,
    }
  }
  return { version: 1, iterations, salt: saltHex, hash: bytesToHex(hash) }
}

/**
 * Verify a PIN attempt against the vault record. Invalid input (wrong length,
 * wrong charset) returns `false` — guessing is cheap to reject and every
 * attempt is rate-limited at the handler layer (M2-04), not here.
 */
export async function verifyPin(vault: PinVault, pin: string): Promise<boolean> {
  const record = pinVaultSchema.parse(vault)
  if (!pinSchema.safeParse(pin).success) return false
  const candidate = await pbkdf2Sha256(pin, hexToBytes(record.salt), record.iterations)
  return constantTimeEqual(candidate, hexToBytes(record.hash))
}

/**
 * Verify a security-answer recovery attempt. The answer is normalized
 * (trim + lowercase) exactly like at creation, so "My Dog  " and "my dog"
 * match. `false` when the vault has no question configured.
 */
export async function verifySecurityAnswer(vault: PinVault, answer: string): Promise<boolean> {
  const record = pinVaultSchema.parse(vault)
  if (record.answerHash === undefined || record.answerSalt === undefined) return false
  const normalized = securityAnswerSchema.safeParse(answer)
  if (!normalized.success) return false
  const candidate = await pbkdf2Sha256(
    normalized.data,
    hexToBytes(record.answerSalt),
    record.iterations,
  )
  return constantTimeEqual(candidate, hexToBytes(record.answerHash))
}
