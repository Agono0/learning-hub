import { describe, expect, it } from 'vitest'
import {
  COOLDOWN_SECONDS,
  DEFAULT_ALLOWED_DOMAINS,
  SYSTEM_ALLOWED_APPS,
  buildDnrRules,
  exitGate,
  isAppAllowed,
  isDomainAllowed,
  normalizeDomain,
  normalizeExeName,
} from '../src/focus-lock'

describe('focus-lock domain logic', () => {
  it('normalizes domains properly', () => {
    expect(normalizeDomain('https://www.YouTube.COM/watch?v=123')).toBe('youtube.com')
    expect(normalizeDomain('HTTP://sub.example.org:8080/path')).toBe('sub.example.org')
    expect(normalizeDomain('learn.google.com#hash')).toBe('learn.google.com')
    expect(normalizeDomain('')).toBe('')
  })

  it('matches allowed domains by exact host and subdomain boundary', () => {
    const allowed = ['youtube.com', 'wikipedia.org']

    expect(isDomainAllowed('youtube.com', allowed)).toBe(true)
    expect(isDomainAllowed('m.youtube.com', allowed)).toBe(true)
    expect(isDomainAllowed('en.wikipedia.org', allowed)).toBe(true)
    expect(isDomainAllowed('notyoutube.com', allowed)).toBe(false)
    expect(isDomainAllowed('fake-wikipedia.org', allowed)).toBe(false)
    expect(isDomainAllowed('localhost', allowed)).toBe(true)
    expect(isDomainAllowed('127.0.0.1', allowed)).toBe(true)
    expect(isDomainAllowed('app.localhost', allowed)).toBe(true)
  })

  it('normalizes executable names and checks application allowlist', () => {
    expect(normalizeExeName('C:\\Windows\\System32\\Taskmgr.exe')).toBe('taskmgr.exe')
    expect(normalizeExeName('/usr/bin/code')).toBe('code')

    // System essentials are always allowed
    for (const sys of SYSTEM_ALLOWED_APPS) {
      expect(isAppAllowed(sys, [])).toBe(true)
    }

    // User allowlist
    const userAllowed = ['Code.exe', 'Anki.exe']
    expect(isAppAllowed('C:\\Users\\user\\AppData\\Code.exe', userAllowed)).toBe(true)
    expect(isAppAllowed('anki.exe', userAllowed)).toBe(true)
    expect(isAppAllowed('discord.exe', userAllowed)).toBe(false)
    expect(isAppAllowed('steam.exe', userAllowed)).toBe(false)
  })

  it('generates declarativeNetRequest MV3 rules with allow and redirect priorities', () => {
    const rules = buildDnrRules({ domains: ['github.com'] })
    expect(rules.length).toBeGreaterThan(1)

    // Should contain redirect catch-all rule at priority 1
    const redirectRule = rules.find((r) => r.id === 999999)
    expect(redirectRule).toBeDefined()
    expect(redirectRule?.priority).toBe(1)
    expect(redirectRule?.action.type).toBe('redirect')
    expect(redirectRule?.action.redirect?.extensionPath).toBe('/blocked.html')

    // Should contain priority 2 allow rules for default + extra
    const allowRules = rules.filter((r) => r.priority === 2)
    const allAllowedDomains = allowRules.flatMap((r) => r.condition.requestDomains ?? [])
    expect(allAllowedDomains).toContain('github.com')
    for (const def of DEFAULT_ALLOWED_DOMAINS) {
      expect(allAllowedDomains).toContain(def)
    }
    expect(allAllowedDomains).toContain('localhost')
  })

  it('calculates exitGate cooldown state machine correctly', () => {
    const baseNow = new Date('2026-11-06T10:00:00.000Z')
    const lockedUntil = new Date('2026-11-06T10:30:00.000Z').toISOString()

    // 1. Locked without exit requested
    const state1 = exitGate({ lockedUntil }, baseNow)
    expect(state1.state).toBe('locked')
    expect(state1.cooldownEndsAt).toBeNull()

    // 2. In cooldown (30s elapsed of 60s)
    const exitRequestedAt = new Date('2026-11-06T10:10:00.000Z').toISOString()
    const nowMid = new Date('2026-11-06T10:10:30.000Z')
    const state2 = exitGate({ lockedUntil, exitRequestedAt }, nowMid)
    expect(state2.state).toBe('cooldown')
    expect(state2.remainingCooldownSec).toBe(30)
    expect(state2.cooldownEndsAt).toBe(new Date('2026-11-06T10:11:00.000Z').toISOString())

    // 3. Cooldown finished -> can confirm
    const nowAfter = new Date('2026-11-06T10:11:05.000Z')
    const state3 = exitGate({ lockedUntil, exitRequestedAt }, nowAfter)
    expect(state3.state).toBe('can_confirm')
    expect(state3.remainingCooldownSec).toBe(0)

    // 4. Session naturally ended or ended early
    const nowPast = new Date('2026-11-06T10:35:00.000Z')
    const state4 = exitGate({ lockedUntil }, nowPast)
    expect(state4.state).toBe('ended')

    const state5 = exitGate({ lockedUntil, endedEarly: true }, nowMid)
    expect(state5.state).toBe('ended')
  })
})
