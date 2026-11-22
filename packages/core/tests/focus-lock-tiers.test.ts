/**
 * Per-tier permission checklist unit tests (M2-32): granted-vs-needed rows
 * per tier, case/whitespace-insensitive matching (parity with the M2-20
 * tamper check), and the best-available-tier projection.
 */
import { describe, expect, it } from 'vitest'
import { TIER_REQUIREMENTS, bestAvailableTier, tierChecklist } from '../src/focus-lock/tiers'

describe('tierChecklist', () => {
  it('reports every requirement granted for a fully provisioned Device Owner device', () => {
    const result = tierChecklist('owner', ['device_owner', 'lock_task', 'device_admin'])
    expect(result.satisfied).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.rows).toHaveLength(3)
    expect(result.rows.every((r) => r.granted)).toBe(true)
  })

  it('matches case-insensitively and trims (Kotlin reports SHOUTING_CASE)', () => {
    const result = tierChecklist('accessibility', [
      ' DEVICE_ADMIN ',
      'Accessibility_Service',
      'OVERLAY',
    ])
    expect(result.satisfied).toBe(true)
  })

  it('lists exactly the missing permissions for a partial Tier 2 device', () => {
    const result = tierChecklist('accessibility', ['device_admin'])
    expect(result.satisfied).toBe(false)
    expect(result.missing).toEqual(['accessibility_service', 'overlay'])
    expect(result.rows.find((r) => r.permission === 'device_admin')?.granted).toBe(true)
    expect(result.rows.find((r) => r.permission === 'overlay')?.granted).toBe(false)
  })

  it('windows-basic needs only the keyboard hook; windows-admin also elevation', () => {
    const basic = tierChecklist('windows-basic', ['KeyboardHook'])
    expect(basic.satisfied).toBe(true)
    const admin = tierChecklist('windows-admin', ['keyboard_hook'])
    expect(admin.satisfied).toBe(false)
    expect(admin.missing).toEqual(['elevation'])
  })

  it('an empty grant list fails every tier', () => {
    for (const tier of Object.keys(TIER_REQUIREMENTS) as (keyof typeof TIER_REQUIREMENTS)[]) {
      expect(tierChecklist(tier, []).satisfied).toBe(false)
    }
  })
})

describe('bestAvailableTier', () => {
  it('prefers the strongest satisfied tier', () => {
    expect(
      bestAvailableTier([
        'device_owner',
        'lock_task',
        'device_admin',
        'accessibility_service',
        'overlay',
      ]),
    ).toBe('owner')
  })

  it('falls back tier by tier as provisioning drops', () => {
    expect(bestAvailableTier(['device_admin', 'accessibility_service', 'overlay'])).toBe(
      'accessibility',
    )
    expect(bestAvailableTier(['keyboard_hook', 'elevation'])).toBe('windows-admin')
    expect(bestAvailableTier(['keyboard_hook'])).toBe('windows-basic')
  })

  it('returns null when nothing is enforceable — the honest no-lock answer', () => {
    expect(bestAvailableTier([])).toBeNull()
    expect(bestAvailableTier(['overlay'])).toBeNull()
  })
})
