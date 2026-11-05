/**
 * Client-side / worker-side end-to-end encryption (E2EE) envelope for Learning
 * HUB backups and cloud sync.
 *
 * Runtime-neutral: relies exclusively on standard Web Crypto (`crypto.subtle`
 * + `crypto.getRandomValues` + `TextEncoder`/`TextDecoder`), available natively
 * in Node 22+, modern browsers, Tauri WebView2 (Windows), and Android WebView
 * Web Workers — zero external crypto dependencies.
 *
 * Cryptography:
 * - KDF: PBKDF2-HMAC-SHA256 (default 210,000 iterations per OWASP 2023+ guidance)
 *   with a fresh 16-byte CSPRNG salt on every encryption.
 * - Authenticated cipher: AES-256-GCM with a fresh 12-byte CSPRNG IV and
 *   128-bit authentication tag (detects wrong passphrases or tampering).
 */
import { z } from 'zod'

/** Default PBKDF2-SHA256 iteration count (OWASP recommendation). */
export const DEFAULT_PBKDF2_ITERATIONS = 210_000

/** Serialized AES-256-GCM encrypted backup/sync envelope. */
export interface EncryptedSyncEnvelope {
  encrypted: true
  v: 1
  kdf: 'PBKDF2-SHA256'
  iterations: number
  cipher: 'AES-256-GCM'
  salt: string
  iv: string
  ciphertext: string
  exportedAt: string
}

/** Zod validator for an encrypted sync/backup envelope. */
export const encryptedSyncEnvelopeSchema = z.object({
  encrypted: z.literal(true),
  v: z.literal(1),
  kdf: z.literal('PBKDF2-SHA256'),
  iterations: z.number().int().min(10_000).max(2_000_000),
  cipher: z.literal('AES-256-GCM'),
  salt: z.string().min(16),
  iv: z.string().min(12),
  ciphertext: z.string().min(16),
  exportedAt: z.string(),
})

/** Type guard for an encrypted sync/backup envelope. */
export function isEncryptedSyncEnvelope(data: unknown): data is EncryptedSyncEnvelope {
  return encryptedSyncEnvelopeSchema.safeParse(data).success
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }
  // Fallback for runtimes without global btoa
  const G = globalThis as unknown as {
    Buffer?: { from(b: Uint8Array): { toString(enc: 'base64'): string } }
  }
  if (G.Buffer) return G.Buffer.from(bytes).toString('base64')
  throw new Error('Base64 encoder unavailable in this runtime')
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const buf = new ArrayBuffer(bin.length)
    const out = new Uint8Array(buf)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  const G = globalThis as unknown as {
    Buffer?: { from(s: string, enc: 'base64'): Uint8Array }
  }
  if (G.Buffer) {
    const raw = G.Buffer.from(b64, 'base64')
    const buf = new ArrayBuffer(raw.byteLength)
    const out = new Uint8Array(buf)
    out.set(raw)
    return out
  }
  throw new Error('Base64 decoder unavailable in this runtime')
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  if (!passphrase || passphrase.length < 1) {
    throw new Error('Encryption passphrase cannot be empty')
  }
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Web Crypto subtle API is unavailable in this runtime')
  }
  const enc = new TextEncoder()
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

/**
 * Encrypt a UTF-8 JSON string into an `EncryptedSyncEnvelope` using
 * `PBKDF2-SHA256` + `AES-256-GCM`.
 */
export async function encryptSyncPayload(
  plaintext: string,
  passphrase: string,
  opts: { iterations?: number } = {},
): Promise<EncryptedSyncEnvelope> {
  const iterations = opts.iterations ?? DEFAULT_PBKDF2_ITERATIONS
  const saltBuf = new ArrayBuffer(16)
  const salt = new Uint8Array(saltBuf)
  const ivBuf = new ArrayBuffer(12)
  const iv = new Uint8Array(ivBuf)
  globalThis.crypto.getRandomValues(salt)
  globalThis.crypto.getRandomValues(iv)

  const key = await deriveAesKey(passphrase, salt, iterations, 'encrypt')
  const encoded = new TextEncoder().encode(plaintext)
  const encryptedBuf = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)

  return {
    encrypted: true,
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    cipher: 'AES-256-GCM',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuf)),
    exportedAt: new Date().toISOString(),
  }
}

/**
 * Decrypt an `EncryptedSyncEnvelope` back into its UTF-8 JSON string.
 * Throws a clear error if the passphrase is wrong or the ciphertext was tampered with.
 */
export async function decryptSyncPayload(envelope: unknown, passphrase: string): Promise<string> {
  const parsed = encryptedSyncEnvelopeSchema.parse(envelope)
  const salt = base64ToBytes(parsed.salt)
  const iv = base64ToBytes(parsed.iv)
  const ciphertext = base64ToBytes(parsed.ciphertext)
  const key = await deriveAesKey(passphrase, salt, parsed.iterations, 'decrypt')

  try {
    const plainBuf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    )
    return new TextDecoder().decode(plainBuf)
  } catch {
    throw new Error('Decryption failed — wrong passphrase or corrupted sync payload')
  }
}
