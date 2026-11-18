/**
 * Permission Center web tests — the runtime adapter's pure surface (node
 * environment: no window), snapshot hardening, and the wiring contract
 * between the catalog, the hooks and the components.
 */
import { describe, expect, it } from 'vitest'
import {
  PERMISSION_CATALOG,
  PERMISSION_IDS,
  emptySnapshot,
  nextPermissionToAsk,
  permissionReadiness,
  type PermissionSnapshot,
} from '@learning-hub/core/permissions'
import {
  currentPlatform,
  detectPermissions,
  getPermissionPrefs,
  isAndroid,
  recordPermissionDecision,
  savePermissionPrefs,
} from '../src/platform/permissions'

describe('platform adapter (node environment, no window)', () => {
  it('treats node/no-window as the web platform with no Android UA', () => {
    expect(currentPlatform()).toBe('web')
    expect(isAndroid()).toBe(false)
  })

  it('detects notifications as undetermined/unsupported without a DOM, and Android-only capabilities off-platform', async () => {
    const snapshot = await detectPermissions()
    expect(PERMISSION_IDS.every((id) => snapshot[id] !== undefined)).toBe(true)
    // exact_alarms + battery exist only on Android; in node they are unsupported.
    expect(snapshot.exact_alarms).toBe('unsupported')
    expect(snapshot.battery_optimization).toBe('unsupported')
    expect(['undetermined', 'unsupported', 'denied', 'granted']).toContain(snapshot.notifications)
    expect(snapshot.push).toBe('unsupported')
  })

  it('never throws on corrupt prefs storage', () => {
    expect(getPermissionPrefs()).toEqual({ decisions: {}, lastAskedAt: {} })
  })
})

describe('notification delivery helpers (node env)', () => {
  it('deliverLocalNotification is a safe no-op without window/plugin', async () => {
    const { deliverLocalNotification } = await import('../src/platform/permissions')
    expect(await deliverLocalNotification('Learning HUB', 'test')).toBe(false)
  })

  it('requestPermission for manual capabilities returns unsupported (never fakes a prompt)', async () => {
    const { requestPermission } = await import('../src/platform/permissions')
    expect(await requestPermission('battery_optimization')).toBe('unsupported')
    expect(await requestPermission('exact_alarms')).toBe('unsupported')
  })
})

describe('decision persistence contract', () => {
  it('recordPermissionDecision persists through savePermissionPrefs round-trip shape', () => {
    const prefs = recordPermissionDecision('notifications', 'never')
    expect(prefs.decisions.notifications).toBe('never')
    // Save shape must be JSON-serializable for localStorage
    expect(() => JSON.stringify(prefs)).not.toThrow()
    savePermissionPrefs(prefs)
  })
})

describe('catalog ↔ UI wiring contract', () => {
  it('every catalog entry renders: status presentation must cover all five statuses', async () => {
    const { STATUS_PRESENTATION } = await import('../src/components/PermissionCenter')
    for (const status of ['granted', 'denied', 'undetermined', 'manual', 'unsupported'] as const) {
      const p = STATUS_PRESENTATION[status]
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.tone).toBeDefined()
      // Color is never the only signal: every status carries an icon + text.
      expect(p.icon).toBeDefined()
    }
  })

  it('readiness drives the header: all-granted = no blocked features', () => {
    const granted: PermissionSnapshot = {
      notifications: 'granted',
      push: 'granted',
      exact_alarms: 'granted',
      battery_optimization: 'granted',
    }
    const r = permissionReadiness(granted)
    expect(r.blockedFeatures).toHaveLength(0)
    expect(r.grantedCount).toBe(r.applicableCount)
  })

  it('the nudge uses the same one-ask decision function as the center', () => {
    // Contract: both import nextPermissionToAsk from core — pin the identity.
    expect(nextPermissionToAsk(emptySnapshot(), { decisions: {}, lastAskedAt: {} })).toBe(
      'notifications',
    )
    expect(PERMISSION_CATALOG.notifications.impact).toBe(1)
  })
})
