import { describe, expect, it } from 'vitest'
import {
  EMERGENCY_DIALER_URI,
  isAppAlwaysAllowed,
  mergeAllowlists,
  normalizeAppName,
  sessionAllowlistSchema,
  SYSTEM_ALLOWED_APPS,
} from '../src/focus-lock/emergency.js'

describe('emergency allowlist enforcement (M2-15)', () => {
  it('keeps the dialer reachable even with an empty user allowlist', () => {
    const enforced = mergeAllowlists([])
    expect(enforced.length).toBeGreaterThanOrEqual(SYSTEM_ALLOWED_APPS.length)
    for (const system of SYSTEM_ALLOWED_APPS) {
      expect(enforced).toContain(normalizeAppName(system))
    }
  })

  it('unions user apps with the system set, normalized and deduplicated', () => {
    const enforced = mergeAllowlists(['Code.exe', ' firefox ', 'com.android.dialer'])
    expect(enforced).toContain('code')
    expect(enforced).toContain('firefox')
    // The dialer appears exactly once even though it is both user-listed and system.
    expect(enforced.filter((a) => a === 'com.android.dialer')).toHaveLength(1)
    expect(new Set(enforced).size).toBe(enforced.length)
  })

  it('never lets corruption or a hostile allowlist remove system apps', () => {
    const hostile = ['', '  ', 'COM.ANDROID.CONTACTS.EXE']
    const enforced = mergeAllowlists(hostile)
    expect(enforced).toContain('com.android.contacts')
    expect(enforced.filter((a) => a === 'com.android.contacts')).toHaveLength(1)
  })

  it('isAppAlwaysAllowed matches system packages across case/suffix forms', () => {
    expect(isAppAlwaysAllowed('com.android.dialer')).toBe(true)
    expect(isAppAlwaysAllowed('com.android.dialer.exe')).toBe(true)
    expect(isAppAlwaysAllowed('com.spotify.music')).toBe(false)
    expect(isAppAlwaysAllowed('')).toBe(false)
  })

  it('normalizeAppName lowercases, trims and strips .exe', () => {
    expect(normalizeAppName('  Code.EXE ')).toBe('code')
    expect(normalizeAppName('Firefox')).toBe('firefox')
    expect(normalizeAppName('')).toBe('')
  })
})

describe('sessionAllowlistSchema', () => {
  it('outputs the ENFORCED list (domains lowercased, apps merged)', () => {
    const parsed = sessionAllowlistSchema.parse({
      domains: ['Docs.Google.com', 'github.com', 'github.com'],
      apps: ['Code.exe', 'notepad'],
    })
    expect(parsed.domains).toEqual(['docs.google.com', 'github.com'])
    expect(parsed.apps).toContain('code')
    expect(parsed.apps).toContain('notepad')
    expect(parsed.apps).toContain('com.android.dialer')
  })

  it('applies calm defaults for empty input', () => {
    const parsed = sessionAllowlistSchema.parse({})
    expect(parsed.domains).toEqual([])
    expect(parsed.apps).toEqual(SYSTEM_ALLOWED_APPS.map((a) => normalizeAppName(a)))
  })

  it('round-trips through JSON the way the session record stores it', () => {
    const parsed = sessionAllowlistSchema.parse({ apps: ['code.exe'] })
    const reparsed = sessionAllowlistSchema.parse(JSON.parse(JSON.stringify(parsed)))
    expect(reparsed).toEqual(parsed)
  })
})

describe('emergency dialer contract', () => {
  it('uses the tel: scheme without hardcoding a regional emergency number', () => {
    expect(EMERGENCY_DIALER_URI).toBe('tel:')
    // 911/112 are regional — the tile opens the dialer, the user dials.
    expect(EMERGENCY_DIALER_URI).not.toMatch(/\d/)
  })
})
