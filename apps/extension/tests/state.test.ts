import { describe, expect, it } from 'vitest'
import { DEFAULT_PORT, isLockActive, normalizePort, parseStoredState } from '../src/state'

describe('extension stored state', () => {
  it('accepts only valid TCP ports', () => {
    expect(normalizePort(8080)).toBe(8080)
    expect(normalizePort(' 3000 ')).toBe(3000)
    for (const bad of [0, -1, 70000, 1.5, 'abc', '', null, undefined, {}]) {
      expect(normalizePort(bad)).toBe(DEFAULT_PORT)
    }
  })

  it('parses well-formed state and drops malformed fields', () => {
    expect(
      parseStoredState({
        pairingToken: ' tok ',
        loopbackPort: 1234,
        lastKnownLock: { active: true, endsAt: '2030-01-01T00:00:00Z', domains: ['a.com', 3] },
      }),
    ).toEqual({
      pairingToken: 'tok',
      loopbackPort: 1234,
      lastKnownLock: {
        active: true,
        endsAt: '2030-01-01T00:00:00Z',
        domains: ['a.com'],
        source: 'legacy',
      },
    })
    expect(parseStoredState({ pairingToken: 5, loopbackPort: 'x', lastKnownLock: 'yes' })).toEqual({
      loopbackPort: DEFAULT_PORT,
      lastKnownLock: null,
    })
    expect(parseStoredState({ lastKnownLock: { active: 'true' } }).lastKnownLock).toBeNull()
  })

  it('treats a lock as active only until it ends', () => {
    const now = Date.parse('2026-01-01T12:00:00Z')
    const lock = { active: true, endsAt: '2026-01-01T13:00:00Z', domains: [] }
    expect(isLockActive(lock, now)).toBe(true)
    expect(isLockActive({ ...lock, endsAt: '2026-01-01T11:00:00Z' }, now)).toBe(false)
    expect(isLockActive({ ...lock, active: false }, now)).toBe(false)
    expect(isLockActive({ ...lock, endsAt: null }, now)).toBe(false)
    expect(isLockActive(null, now)).toBe(false)
  })
})
