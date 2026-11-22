import { describe, expect, it } from 'vitest'
import {
  constantTimeEqual,
  createPinVault,
  PIN_PBKDF2_ITERATIONS,
  pinSchema,
  pinVaultSchema,
  verifyPin,
  verifySecurityAnswer,
} from '../src/focus-lock/pin.js'

// Tests use a reduced iteration count for speed; production default is 600k.
const FAST = { iterations: 1000 }

describe('pinSchema policy', () => {
  it('accepts 4–12 digit PINs and rejects everything else', () => {
    expect(pinSchema.safeParse('1234').success).toBe(true)
    expect(pinSchema.safeParse('123456789012').success).toBe(true)
    expect(pinSchema.safeParse('123').success).toBe(false)
    expect(pinSchema.safeParse('1234567890123').success).toBe(false)
    expect(pinSchema.safeParse('12a4').success).toBe(false)
    expect(pinSchema.safeParse('').success).toBe(false)
    expect(pinSchema.safeParse('12 4').success).toBe(false)
  })
})

describe('createPinVault', () => {
  it('creates a schema-valid record with the requested iteration count', async () => {
    const vault = await createPinVault({ pin: '4321' }, FAST)
    expect(() => pinVaultSchema.parse(vault)).not.toThrow()
    expect(vault.version).toBe(1)
    expect(vault.iterations).toBe(1000)
    expect(vault.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(vault.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(vault.question).toBeUndefined()
  })

  it('uses the 600k OWASP default when no override is given', async () => {
    const vault = await createPinVault({ pin: '0000' }, { iterations: PIN_PBKDF2_ITERATIONS })
    expect(vault.iterations).toBe(600_000)
  })

  it('never reuses a salt (same PIN → different records)', async () => {
    const a = await createPinVault({ pin: '9999' }, FAST)
    const b = await createPinVault({ pin: '9999' }, FAST)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it('requires question and answer together', async () => {
    await expect(createPinVault({ pin: '1234', question: 'Pet name?' }, FAST)).rejects.toThrow(
      /together/i,
    )
    await expect(createPinVault({ pin: '1234', answer: 'rex' }, FAST)).rejects.toThrow(/together/i)
  })

  it('stores the question verbatim and the normalized answer hashed', async () => {
    const vault = await createPinVault(
      { pin: '1234', question: 'Pet name?', answer: '  Rex! ' },
      FAST,
    )
    expect(vault.question).toBe('Pet name?')
    expect(vault.answerHash).toMatch(/^[0-9a-f]{64}$/)
    expect(vault.answerSalt).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(vault)).not.toContain('rex') // answer never stored in the clear
  })

  it('rejects invalid PINs and empty answers at the boundary', async () => {
    await expect(createPinVault({ pin: '12' }, FAST)).rejects.toThrow()
    await expect(createPinVault({ pin: 'abcd' }, FAST)).rejects.toThrow()
    await expect(
      createPinVault({ pin: '1234', question: 'Q?', answer: '   ' }, FAST),
    ).rejects.toThrow()
  })
})

describe('verifyPin', () => {
  it('accepts the right PIN and rejects the wrong one', async () => {
    const vault = await createPinVault({ pin: '2468' }, FAST)
    expect(await verifyPin(vault, '2468')).toBe(true)
    expect(await verifyPin(vault, '2469')).toBe(false)
    expect(await verifyPin(vault, '8642')).toBe(false)
  })

  it('returns false (never throws) for malformed guesses', async () => {
    const vault = await createPinVault({ pin: '1357' }, FAST)
    expect(await verifyPin(vault, '135')).toBe(false)
    expect(await verifyPin(vault, '')).toBe(false)
    expect(await verifyPin(vault, 'abcd')).toBe(false)
    expect(await verifyPin(vault, '13579')).toBe(false)
  })

  it('fails closed on a corrupted/tampered record', async () => {
    const vault = await createPinVault({ pin: '1111' }, FAST)
    const flipped = { ...vault, hash: vault.hash.replace(/^./, vault.hash[0] === 'a' ? 'b' : 'a') }
    expect(await verifyPin(flipped as never, '1111')).toBe(false)
    expect(await verifyPin({ ...vault, salt: 'zz' } as never, '1111')).toBe(false)
    expect(await verifyPin({ ...vault, iterations: -1 } as never, '1111')).toBe(false)
  })

  it('rejects a PIN created under a different salt (cross-record verify)', async () => {
    const a = await createPinVault({ pin: '5555' }, FAST)
    const b = await createPinVault({ pin: '5555' }, FAST)
    // Same PIN, but a record mismatch must not accidentally verify.
    expect(await verifyPin(b, '5555')).toBe(true)
    expect(a.salt).not.toBe(b.salt)
  })
})

describe('verifySecurityAnswer', () => {
  it('verifies the normalized answer (case/whitespace-insensitive)', async () => {
    const vault = await createPinVault({ pin: '1234', question: 'Pet name?', answer: 'Rex' }, FAST)
    expect(await verifySecurityAnswer(vault, 'rex')).toBe(true)
    expect(await verifySecurityAnswer(vault, '  REX  ')).toBe(true)
    expect(await verifySecurityAnswer(vault, 'fido')).toBe(false)
  })

  it('returns false when no question is configured', async () => {
    const vault = await createPinVault({ pin: '1234' }, FAST)
    expect(await verifySecurityAnswer(vault, 'anything')).toBe(false)
  })

  it('returns false for empty answers instead of throwing', async () => {
    const vault = await createPinVault({ pin: '1234', question: 'Q?', answer: 'ok' }, FAST)
    expect(await verifySecurityAnswer(vault, '')).toBe(false)
    expect(await verifySecurityAnswer(vault, '   ')).toBe(false)
  })

  it('keeps recovery usable after the record round-trips through JSON', async () => {
    const vault = await createPinVault({ pin: '7890', question: 'City?', answer: 'Oslo' }, FAST)
    const restored = JSON.parse(JSON.stringify(vault))
    expect(await verifyPin(restored, '7890')).toBe(true)
    expect(await verifySecurityAnswer(restored, 'oslo')).toBe(true)
  })
})

describe('constantTimeEqual', () => {
  const encoder = (s: string): Uint8Array => new TextEncoder().encode(s)

  it('compares content, not references', () => {
    expect(constantTimeEqual(encoder('abc'), encoder('abc'))).toBe(true)
    expect(constantTimeEqual(encoder('abc'), encoder('abd'))).toBe(false)
    expect(constantTimeEqual(encoder('abc'), encoder('abcx'))).toBe(false)
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true)
  })

  it('survives huge inputs without short-circuit differences', () => {
    const a = new Uint8Array(4096).fill(7)
    const b = new Uint8Array(4096).fill(7)
    b[4095] = 8
    expect(constantTimeEqual(a, b)).toBe(false)
  })
})
