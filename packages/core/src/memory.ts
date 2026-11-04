/**
 * Memory system helpers (Agent A) — the Major system, PAO chunking and
 * memory-palace walk ordering. Pure module — safe for client bundles.
 *
 * Major system digit→consonant map (standard mnemonic canon):
 *   0 s/z · 1 t/d · 2 n · 3 m · 4 r · 5 L · 6 sh/ch/j · 7 k/g · 8 f/v · 9 p/b
 */

/** Canonical consonant per digit (first of its phoneme family). */
export const MAJOR_SYSTEM: Readonly<Record<string, string>> = Object.freeze({
  '0': 's',
  '1': 't',
  '2': 'n',
  '3': 'm',
  '4': 'r',
  '5': 'l',
  '6': 'sh',
  '7': 'k',
  '8': 'f',
  '9': 'p',
})

/** Full phoneme families per digit (all consonants that encode that digit). */
export const MAJOR_FAMILIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '0': ['s', 'z', 'soft-c'],
  '1': ['t', 'd', 'th'],
  '2': ['n'],
  '3': ['m'],
  '4': ['r'],
  '5': ['l'],
  '6': ['sh', 'ch', 'j', 'soft-g'],
  '7': ['k', 'g', 'hard-c'],
  '8': ['f', 'v', 'ph'],
  '9': ['p', 'b'],
})

/**
 * Phonetic skeleton for a number: each digit → its canonical consonant.
 * `majorToWord(42)` → "rn" — attach vowels yourself ("rain", "ruin", …) or
 * store curated words in the `mnemonic_tables` table. Deterministic.
 */
export function majorToWord(n: number | string): string {
  const digits = String(n).replace(/\D/g, '')
  let out = ''
  for (const d of digits) {
    const c = MAJOR_SYSTEM[d]
    if (c) out += c
  }
  return out
}

/**
 * Reverse check: which digits does a user's word encode? Vowels and unmapped
 * letters (w, h, y) are ignored. `wordToMajorDigits("rain")` → "42".
 */
export function wordToMajorDigits(word: string): string {
  const lower = word.toLowerCase()
  let out = ''
  let i = 0
  while (i < lower.length) {
    const two = lower.slice(i, i + 2)
    if (two === 'sh' || two === 'ch' || two === 'th' || two === 'ph') {
      out += two === 'th' ? '1' : two === 'ph' ? '8' : '6'
      i += 2
      continue
    }
    const ch = lower[i]!
    if ('sz'.includes(ch)) out += '0'
    else if ('td'.includes(ch)) out += '1'
    else if (ch === 'n') out += '2'
    else if (ch === 'm') out += '3'
    else if (ch === 'r') out += '4'
    else if (ch === 'l') out += '5'
    else if (ch === 'j' || (ch === 'g' && i + 1 < lower.length && lower[i + 1] === 'e')) out += '6'
    else if ('kg'.includes(ch)) out += '7'
    else if ('fv'.includes(ch)) out += '8'
    else if ('pb'.includes(ch)) out += '9'
    // vowels, w, h, y, x … encode nothing
    i += 1
  }
  return out
}

// ─── PAO (Person–Action–Object) ─────────────────────────────────────────────

export interface PaoChunks {
  person: number
  action: number
  object: number
}

/** Split a 6-digit number into PAO 2-digit chunks: 412537 → 41 / 25 / 37. */
export function splitPao(n: number | string): PaoChunks {
  const digits = String(n).replace(/\D/g, '')
  if (digits.length !== 6) {
    throw new Error(`splitPao: expected 6 digits, got "${digits}"`)
  }
  return {
    person: Number(digits.slice(0, 2)),
    action: Number(digits.slice(2, 4)),
    object: Number(digits.slice(4, 6)),
  }
}

/** PAO entry ready for the `mnemonic_tables` table (kind 'pao'). */
export function buildPaoEntry(
  code: number | string,
  person: string,
  action: string,
  object: string,
): { kind: 'pao'; code: string; person: string; action: string; object: string } {
  const digits = String(code).replace(/\D/g, '')
  if (digits.length !== 2) {
    throw new Error(`buildPaoEntry: expected a 2-digit code, got "${digits}"`)
  }
  return { kind: 'pao', code: digits.padStart(2, '0'), person, action, object }
}

// ─── Memory palace ──────────────────────────────────────────────────────────

/**
 * Walk order for palace items: ascending `lociIndex` (stable). The route
 * handler stores loci explicitly; the walk mode just replays the order.
 */
export function palaceWalkOrder<T extends { lociIndex: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.lociIndex - b.lociIndex)
}
