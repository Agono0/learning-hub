/**
 * Cryptographic append-only hash chaining for the Study Coin Ledger.
 *
 * Ensures coin minting and purchases cannot be tampered with or edited in the database.
 * Every transaction incorporates the previous transaction's hash signature into its own.
 */

/**
 * Pure portable SHA-256 implementation in TypeScript (runtime-neutral, no node:crypto).
 */
export function sha256Hex(ascii: string): string {
  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  const lengthProperty = 'length'
  let i: number, j: number
  let result = ''

  const words: number[] = []
  const asciiBitLength = ascii[lengthProperty] * 8

  let hash: number[] = []
  const k: number[] = []
  let primeCounter = 0

  const isComposite: Record<number, boolean> = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }

  hash = hash.slice(0, 8)
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32))
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength

  for (i = 0; i < ascii[lengthProperty]; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8)
  }

  for (let blockIndex = 0; blockIndex < words[lengthProperty]; blockIndex += 16) {
    const w: number[] = words.slice(blockIndex, blockIndex + 16)

    for (i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3)
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10)
      w[i] = (((w[i - 16] + s0) | 0) + ((w[i - 7] + s1) | 0)) | 0
    }

    let a = hash[0],
      b = hash[1],
      c = hash[2],
      d = hash[3],
      e = hash[4],
      f = hash[5],
      g = hash[6],
      h = hash[7]

    for (i = 0; i < 64; i++) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const temp1 = (((h + s1) | 0) + ((ch + k[i]) | 0) + w[i]) | 0
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) | 0

      h = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }

    hash[0] = (hash[0] + a) | 0
    hash[1] = (hash[1] + b) | 0
    hash[2] = (hash[2] + c) | 0
    hash[3] = (hash[3] + d) | 0
    hash[4] = (hash[4] + e) | 0
    hash[5] = (hash[5] + f) | 0
    hash[6] = (hash[6] + g) | 0
    hash[7] = (hash[7] + h) | 0
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += (b < 16 ? '0' : '') + b.toString(16)
    }
  }

  return result
}

export const GENESIS_LEDGER_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000'

export interface LedgerEntryPayload {
  userId: string
  amount: number
  balanceAfter: number
  reason: string
  referenceId?: string | null
  createdAt: string
}

/**
 * Computes the cryptographic signature for a coin ledger entry, linking it to the previous hash.
 */
export function computeLedgerSignature(
  previousSignature: string,
  entry: LedgerEntryPayload,
): string {
  const payload = [
    previousSignature || GENESIS_LEDGER_HASH,
    entry.userId,
    entry.amount.toString(),
    entry.balanceAfter.toString(),
    entry.reason,
    entry.referenceId ?? '',
    entry.createdAt,
  ].join('|')

  return sha256Hex(payload)
}

/**
 * Verifies an entire sequential chain of coin ledger entries.
 * Returns true if the chain is unbroken and valid; false if any entry was altered.
 */
export function verifyLedgerChain(entries: Array<LedgerEntryPayload & { signature: string }>): {
  valid: boolean
  brokenAtId?: number
  reason?: string
} {
  let prevHash = GENESIS_LEDGER_HASH

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const expected = computeLedgerSignature(prevHash, entry)
    if (entry.signature !== expected) {
      return {
        valid: false,
        brokenAtId: i,
        reason: `Hash mismatch at entry index ${i}: expected ${expected}, got ${entry.signature}`,
      }
    }
    prevHash = entry.signature
  }

  return { valid: true }
}
