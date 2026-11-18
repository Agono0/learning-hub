/**
 * Permissions domain tests — catalog integrity, readiness math, calm
 * onboarding decisions, and persistence-shape hardening.
 */
import { describe, expect, it } from 'vitest'
import {
  PERMISSION_CATALOG,
  PERMISSION_IDS,
  PERMISSION_STATUSES,
  emptySnapshot,
  isActionable,
  isSettled,
  mergeSnapshot,
  nextPermissionToAsk,
  parsePermissionPrefs,
  permissionReadiness,
  permissionSummaryLine,
  shouldOfferPrompt,
  withDecision,
  type PermissionPromptPrefs,
  type PermissionSnapshot,
} from '../src/permissions'
import * as core from '../src/index'

const FRESH: PermissionPromptPrefs = { decisions: {}, lastAskedAt: {} }

describe('permission catalog integrity', () => {
  it('has a unique, non-empty id set', () => {
    expect(new Set(PERMISSION_IDS).size).toBe(PERMISSION_IDS.length)
    expect(PERMISSION_IDS.length).toBeGreaterThanOrEqual(4)
  })

  it('documents every entry completely (honest-denial rule)', () => {
    for (const id of PERMISSION_IDS) {
      const def = PERMISSION_CATALOG[id]
      expect(def.title.length).toBeGreaterThan(0)
      expect(def.summary.length).toBeGreaterThan(10)
      expect(def.deniedImpact.length).toBeGreaterThan(0)
      expect(def.enables.length).toBeGreaterThan(0)
      expect(def.platforms.length).toBeGreaterThan(0)
      // Manual permissions must have manual grant steps; promptable ones may rely on the OS dialog.
      if (!def.canRequest) {
        for (const platform of def.platforms) {
          expect(def.grantSteps[platform]?.length ?? 0).toBeGreaterThan(0)
        }
      }
    }
  })

  it('reports notifications as promptable everywhere and battery as manual-only', () => {
    expect(PERMISSION_CATALOG.notifications.canQuery).toBe(true)
    expect(PERMISSION_CATALOG.notifications.canRequest).toBe(true)
    expect(PERMISSION_CATALOG.battery_optimization.canRequest).toBe(false)
    expect(PERMISSION_CATALOG.battery_optimization.canQuery).toBe(false)
    expect(PERMISSION_CATALOG.exact_alarms.platforms).toEqual(['android'])
    expect(PERMISSION_CATALOG.push.platforms).toEqual(['web'])
  })

  it('impact values match the display order (calm onboarding invariant)', () => {
    const impacts = PERMISSION_IDS.map((id) => PERMISSION_CATALOG[id].impact)
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i]).toBeGreaterThanOrEqual(impacts[i - 1]!)
    }
  })
})

describe('isSettled / isActionable', () => {
  it('granted and unsupported are settled; denied, manual and undetermined are actionable', () => {
    expect(isSettled('granted')).toBe(true)
    expect(isSettled('unsupported')).toBe(true)
    expect(isSettled('denied')).toBe(false)
    expect(isSettled('undetermined')).toBe(false)

    expect(isActionable('notifications', 'denied')).toBe(true)
    expect(isActionable('notifications', 'manual')).toBe(true)
    expect(isActionable('notifications', 'granted')).toBe(false)
    // exact_alarms is manual-only: actionable only on its platform vocabulary
    expect(isActionable('exact_alarms', 'manual')).toBe(true)
  })
})

describe('shouldOfferPrompt (3-day throttle + decision record)', () => {
  const NOW = new Date('2026-01-10T12:00:00Z')

  it('offers undetermined promptable permissions by default', () => {
    expect(shouldOfferPrompt('notifications', 'undetermined', FRESH, NOW)).toBe(true)
  })

  it('never offers for granted, denied, unsupported or manual statuses', () => {
    for (const status of PERMISSION_STATUSES) {
      if (status === 'undetermined') continue
      expect(shouldOfferPrompt('notifications', status, FRESH, NOW)).toBe(false)
    }
  })

  it('respects "later" and "never" decisions', () => {
    expect(
      shouldOfferPrompt(
        'notifications',
        'undetermined',
        withDecision(FRESH, 'notifications', 'later'),
        NOW,
      ),
    ).toBe(false)
    expect(
      shouldOfferPrompt(
        'notifications',
        'undetermined',
        withDecision(FRESH, 'notifications', 'never'),
        NOW,
      ),
    ).toBe(false)
  })

  it('re-offers "ask_now" only after the 3-day throttle', () => {
    const asked = withDecision(FRESH, 'notifications', 'ask_now', new Date('2026-01-09T12:00:00Z'))
    expect(shouldOfferPrompt('notifications', 'undetermined', asked, NOW)).toBe(false)
    const later = new Date('2026-01-13T12:00:01Z')
    expect(shouldOfferPrompt('notifications', 'undetermined', asked, later)).toBe(true)
  })

  it('never offers manual capabilities (no OS dialog exists)', () => {
    expect(shouldOfferPrompt('battery_optimization', 'undetermined', FRESH, NOW)).toBe(false)
  })
})

describe('nextPermissionToAsk — one ask at a time, impact order', () => {
  it('picks the highest-impact promptable permission first (notifications)', () => {
    expect(nextPermissionToAsk(emptySnapshot(), FRESH, new Date('2026-01-10T12:00:00Z'))).toBe(
      'notifications',
    )
  })

  it('returns null when everything is granted', () => {
    const granted: PermissionSnapshot = {
      notifications: 'granted',
      push: 'granted',
      exact_alarms: 'granted',
      battery_optimization: 'granted',
    }
    expect(nextPermissionToAsk(granted, FRESH)).toBeNull()
  })

  it('returns null when the only candidate was dismissed', () => {
    const webSnapshot: PermissionSnapshot = {
      notifications: 'undetermined',
      push: 'undetermined',
      exact_alarms: 'unsupported',
      battery_optimization: 'unsupported',
    }
    const dismissed = withDecision(FRESH, 'notifications', 'never')
    dismissed.decisions.push = 'never'
    expect(nextPermissionToAsk(webSnapshot, dismissed, new Date('2026-01-10T12:00:00Z'))).toBeNull()
  })

  it('falls through to the next candidate when the first is denied', () => {
    const webSnapshot: PermissionSnapshot = {
      notifications: 'denied',
      push: 'undetermined',
      exact_alarms: 'unsupported',
      battery_optimization: 'unsupported',
    }
    expect(nextPermissionToAsk(webSnapshot, FRESH, new Date('2026-01-10T12:00:00Z'))).toBe('push')
  })

  it('never asks for unsupported platform capabilities', () => {
    const androidSnapshot: PermissionSnapshot = {
      notifications: 'granted',
      push: 'unsupported',
      exact_alarms: 'manual',
      battery_optimization: 'manual',
    }
    expect(nextPermissionToAsk(androidSnapshot, FRESH)).toBeNull()
  })
})

describe('permissionReadiness + summary line', () => {
  it('counts granted/applicable and lists blocked features', () => {
    const webSnapshot: PermissionSnapshot = {
      notifications: 'granted',
      push: 'denied',
      exact_alarms: 'unsupported',
      battery_optimization: 'unsupported',
    }
    const r = permissionReadiness(webSnapshot)
    expect(r.grantedCount).toBe(1)
    expect(r.applicableCount).toBe(2)
    expect(r.actionable).toContain('push')
    expect(r.blockedFeatures).toContain('Offline reminder delivery')
  })

  it('summary line is honest in every state', () => {
    const all: PermissionSnapshot = {
      notifications: 'granted',
      push: 'granted',
      exact_alarms: 'granted',
      battery_optimization: 'granted',
    }
    expect(permissionSummaryLine(all)).toBe('All permissions granted')
    expect(permissionSummaryLine(emptySnapshot())).toContain('of 4 granted')
    const bare = permissionSummaryLine({})
    expect(bare).toContain('0 of 4 granted')
    expect(bare).toContain('pending')
  })
})

describe('snapshot merge & prefs parsing hardening', () => {
  it('mergeSnapshot fills unknown ids and drops foreign ones', () => {
    const merged = mergeSnapshot({ notifications: 'granted' }, { push: 'denied' })
    expect(merged.notifications).toBe('granted')
    expect(merged.push).toBe('denied')
    expect(merged.exact_alarms).toBe('undetermined')
    expect(merged.battery_optimization).toBe('undetermined')
    // Foreign ids (a newer/older catalog version) never enter the snapshot.
    const cleaned = mergeSnapshot(emptySnapshot(), {
      foreign: 'granted',
    } as unknown as PermissionSnapshot)
    expect(Object.keys(cleaned).every((k) => PERMISSION_IDS.includes(k as never))).toBe(true)
  })

  it('parsePermissionPrefs survives corrupt storage', () => {
    expect(parsePermissionPrefs(null)).toEqual({ decisions: {}, lastAskedAt: {} })
    expect(parsePermissionPrefs('garbage')).toEqual({ decisions: {}, lastAskedAt: {} })
    expect(
      parsePermissionPrefs({ decisions: { notifications: 'never' } }).decisions.notifications,
    ).toBe('never')
    // Unknown ids / bad values are rejected wholesale (zod), not partially applied
    expect(parsePermissionPrefs({ decisions: { weird_id: 'never' } }).decisions).toEqual({})
  })

  it('withDecision records lastAskedAt only for ask_now', () => {
    const now = new Date('2026-01-10T12:00:00Z')
    expect(withDecision(FRESH, 'notifications', 'later', now).lastAskedAt).toEqual({})
    const asked = withDecision(FRESH, 'notifications', 'ask_now', now)
    expect(asked.decisions.notifications).toBe('ask_now')
    expect(asked.lastAskedAt.notifications).toBe(now.toISOString())
    // later/never decisions do not overwrite an existing ask stamp
    const then = withDecision(asked, 'notifications', 'never', new Date('2026-01-11T00:00:00Z'))
    expect(then.lastAskedAt.notifications).toBe(now.toISOString())
  })
})

describe('public surface parity', () => {
  it('is re-exported from the package root', () => {
    expect(core.PERMISSION_CATALOG).toBe(PERMISSION_CATALOG)
    expect(typeof core.nextPermissionToAsk).toBe('function')
    expect(typeof core.permissionReadiness).toBe('function')
  })
})
