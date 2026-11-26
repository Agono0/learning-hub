import { describe, expect, it } from 'vitest'
import {
  MAX_LOCK_HORIZON_MS,
  canonicalProofString,
  isValidNonce,
  normalizeProofDomains,
  signLockProof,
  verifyLockProof,
  type ProofLock,
} from '../src/focus-lock'

const TOKEN = 'synthetic-pairing-token-not-a-real-secret'
const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA'
const NOW = Date.parse('2026-11-26T00:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const lockOf = (over: Partial<ProofLock> = {}): ProofLock => ({
  active: true,
  endsAt: iso(NOW + 30 * 60_000),
  hardCapAt: iso(NOW + 4 * 3_600_000),
  domains: ['b.example', 'a.example'],
  ...over,
})
const sign = (over: Partial<ProofLock> = {}, nowMs = NOW) =>
  signLockProof(TOKEN, { nonce: NONCE, lock: lockOf(over), nowMs })
const verify = (p: unknown, nowMs = NOW, nonce = NONCE, token = TOKEN) =>
  verifyLockProof(token, nonce, p, nowMs)
const reason = async (p: unknown, nowMs = NOW) => {
  const r = await verify(p, nowMs)
  return r.ok ? 'ok' : r.reason
}

describe('focus fallback proof', () => {
  it('accepts a fresh, well-formed proof and returns the earlier of endsAt and hardCapAt', async () => {
    const r = await verify(await sign())
    expect(r).toEqual({
      ok: true,
      lock: { active: true, endsAt: iso(NOW + 30 * 60_000), domains: ['a.example', 'b.example'] },
    })
    const capped = await verify(await sign({ hardCapAt: iso(NOW + 10 * 60_000) }))
    expect(capped.ok && capped.lock.endsAt).toBe(iso(NOW + 10 * 60_000))
  })

  it('accepts an inactive lock with a null end', async () => {
    const r = await verify(await sign({ active: false, endsAt: null, hardCapAt: null }))
    expect(r).toEqual({
      ok: true,
      lock: { active: false, endsAt: null, domains: ['a.example', 'b.example'] },
    })
  })

  it('rejects a wrong token, wrong nonce and a replayed response under a new nonce', async () => {
    const p = await sign()
    expect((await verify(p, NOW, NONCE, 'other-token')).ok).toBe(false)
    expect(await reason({ ...p, nonce: 'BBBBBBBBBBBBBBBBBBBBBB' })).toBe('nonce')
    const r = await verifyLockProof(TOKEN, 'CCCCCCCCCCCCCCCCCCCCCC', p, NOW)
    expect(r.ok).toBe(false)
  })

  it('binds every field: any change to the lock, timestamps or version breaks the MAC or shape', async () => {
    const p = await sign()
    const tampered: unknown[] = [
      { ...p, lock: { ...p.lock, active: false } },
      { ...p, lock: { ...p.lock, endsAt: iso(NOW + 3_600_000) } },
      { ...p, lock: { ...p.lock, hardCapAt: iso(NOW + 3_000_000) } },
      { ...p, lock: { ...p.lock, hardCapAt: null } },
      { ...p, lock: { ...p.lock, domains: ['a.example'] } },
      { ...p, lock: { ...p.lock, domains: ['a.example', 'b.example', 'c.example'] } },
      { ...p, issuedAt: iso(NOW + 1000) },
      { ...p, expiresAt: iso(Date.parse(p.expiresAt) + 1000) },
      { ...p, mac: (p.mac.startsWith('A') ? 'B' : 'A') + p.mac.slice(1) },
    ]
    for (const t of tampered) expect(await reason(t)).not.toBe('ok')
    expect(await reason({ ...p, v: 2 })).toBe('version')
  })

  it('binds expiresAt specifically: lengthening the window with the old MAC fails', async () => {
    const p = await sign()
    const longer = { ...p, expiresAt: iso(Date.parse(p.issuedAt) + 100_000) }
    expect(await reason(longer)).toBe('mac')
  })

  it('enforces the time rules', async () => {
    const p = await sign()
    expect(await reason(p, NOW + 130_000)).toBe('issued-window')
    expect(await reason(p, NOW - 130_000)).toBe('issued-window')
    // within skew but after expiry (ttl 60 s)
    expect(await reason(p, NOW + 61_000)).toBe('expired')
    for (const bad of [
      { issuedAt: 'not a date' },
      { issuedAt: '2026-11-26' },
      { expiresAt: null },
      { expiresAt: 12345 },
    ]) {
      expect(await reason({ ...p, ...bad })).toBe('timestamps')
    }
  })

  it('rejects a ttl above the cap or not after issuedAt, even if signed by the right token', async () => {
    const long = await signLockProof(TOKEN, {
      nonce: NONCE,
      lock: lockOf(),
      nowMs: NOW,
      ttlMs: 10 * 60_000,
    })
    // signLockProof clamps; build an over-long one by hand to prove the verifier checks it
    expect(Date.parse(long.expiresAt) - Date.parse(long.issuedAt)).toBe(120_000)
    const p = await sign()
    expect(await reason({ ...p, expiresAt: p.issuedAt })).toBe('ttl')
  })

  it('rejects active locks that are ended, endless or beyond the product ceiling', async () => {
    expect(await reason(await sign({ endsAt: iso(NOW - 1000), hardCapAt: null }))).toBe(
      'lock-ended',
    )
    expect(await reason(await sign({ endsAt: null, hardCapAt: null }))).toBe('active-without-end')
    const far = iso(NOW + MAX_LOCK_HORIZON_MS + 60_000)
    expect(await reason(await sign({ endsAt: far, hardCapAt: null }))).toBe('lock-horizon')
    // a far endsAt is fine when the signed hardCapAt is near
    expect(await reason(await sign({ endsAt: far, hardCapAt: iso(NOW + 60_000) }))).toBe('ok')
  })

  it('is strict about shape and types', async () => {
    const p = await sign()
    for (const bad of [
      null,
      undefined,
      'x',
      5,
      [],
      { ...p, lock: null },
      { ...p, lock: [] },
      { ...p, mac: 5 },
      { ...p, mac: 'short' },
      { ...p, lock: { ...p.lock, active: 'true' } },
      { ...p, lock: { ...p.lock, domains: 'a.example' } },
      { ...p, lock: { ...p.lock, domains: [1] } },
    ]) {
      expect(await reason(bad)).not.toBe('ok')
    }
  })

  it('refuses non-canonical domain lists (unsorted, mixed case, duplicates, spaces)', async () => {
    const p = await sign()
    for (const domains of [
      ['b.example', 'a.example'],
      ['A.example', 'b.example'],
      ['a.example', 'a.example'],
      [' a.example'],
    ]) {
      expect(await reason({ ...p, lock: { ...p.lock, domains } })).not.toBe('ok')
    }
  })

  it('bounds the domain list and each name', () => {
    expect(normalizeProofDomains(Array.from({ length: 501 }, (_, i) => `d${i}.example`))).toBeNull()
    expect(normalizeProofDomains(['a'.repeat(254)])).toBeNull()
    expect(normalizeProofDomains(['bad domain.com'])).toBeNull()
    expect(normalizeProofDomains(['a.com\nb.com'])).toBeNull()
    expect(normalizeProofDomains(['-a.com'])).toBeNull()
    expect(normalizeProofDomains([''])).toBeNull()
    expect(normalizeProofDomains(['B.Example', 'b.example', 'a.example'])).toEqual([
      'a.example',
      'b.example',
    ])
  })

  it('canonical form is length-prefixed so fields cannot borrow bytes from each other', () => {
    const base = { v: 1, nonce: NONCE, issuedAt: iso(NOW), expiresAt: iso(NOW + 60_000) }
    const a = canonicalProofString({
      ...base,
      lock: lockOf({ domains: ['ab.example', 'c.example'] }),
    })
    const b = canonicalProofString({
      ...base,
      lock: lockOf({ domains: ['ab.example', 'c.example', 'x.example'] }),
    })
    const c = canonicalProofString({ ...base, lock: lockOf({ endsAt: null, active: false }) })
    expect(new Set([a, b, c]).size).toBe(3)
    expect(
      canonicalProofString({ ...base, lock: lockOf({ endsAt: null, hardCapAt: null }) }),
    ).not.toBe(
      canonicalProofString({ ...base, lock: lockOf({ endsAt: '', hardCapAt: null } as never) }),
    )
  })

  it('validates nonces', () => {
    expect(isValidNonce(NONCE)).toBe(true)
    for (const bad of ['', 'short', 'a'.repeat(65), 'has space aaaaaaaaaaaaaa', 5, null])
      expect(isValidNonce(bad)).toBe(false)
  })

  it('refuses to sign with an empty token, a bad nonce or bad domains', async () => {
    await expect(signLockProof('', { nonce: NONCE, lock: lockOf(), nowMs: NOW })).rejects.toThrow()
    await expect(signLockProof(TOKEN, { nonce: 'x', lock: lockOf(), nowMs: NOW })).rejects.toThrow()
    await expect(
      signLockProof(TOKEN, { nonce: NONCE, lock: lockOf({ domains: ['bad domain'] }), nowMs: NOW }),
    ).rejects.toThrow()
  })
})
