import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cancelMaxFocusEarlyExit,
  closeExpiredMaxSession,
  confirmMaxFocusEarlyExit,
  createFocusAllowlist,
  deleteFocusAllowlist,
  focusAllowlists,
  focusSessions,
  frictionEvents,
  getActiveFocusLock,
  getOpenFocusSession,
  getOrCreateFocusBridge,
  initDb,
  listFocusAllowlists,
  recordFocusBridgeHeartbeat,
  requestMaxFocusEarlyExit,
  rotateFocusBridgeToken,
  setDb,
  startMaxFocusSession,
  updateFocusAllowlist,
  type LearningHubDB,
} from '../src/index'

let db: LearningHubDB

beforeAll(async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lh-focus-lock-'))
  db = await initDb({ path: join(tmp, 'focus.db') })
  setDb(db)
})

beforeEach(() => {
  db.delete(frictionEvents).run()
  db.delete(focusSessions).run()
  db.delete(focusAllowlists).run()
})

afterAll(() => {
  try {
    ;(db as unknown as { close?: () => void }).close?.()
  } catch {
    /* ignore */
  }
})

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const start = (minutes = 25, extra: Record<string, unknown> = {}) =>
  startMaxFocusSession({ minutes, ...extra } as Parameters<typeof startMaxFocusSession>[0])

describe('focus bridge pairing', () => {
  it('creates one stable base64url token, rotates it, and records heartbeats', () => {
    const a = getOrCreateFocusBridge()
    expect(a.pairingToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(getOrCreateFocusBridge().pairingToken).toBe(a.pairingToken)

    recordFocusBridgeHeartbeat('ext-123')
    const beat = getOrCreateFocusBridge()
    expect(beat.extensionId).toBe('ext-123')
    expect(beat.lastHeartbeatAt).not.toBeNull()

    const rotated = rotateFocusBridgeToken()
    expect(rotated.pairingToken).not.toBe(a.pairingToken)
    expect(rotated.extensionId).toBeNull() // re-pair required
  })
})

describe('max focus lifecycle', () => {
  it('reports inactive with default domains when nothing is running', () => {
    const lock = getActiveFocusLock()
    expect(lock).toMatchObject({ active: false, sessionId: null, exitState: 'none' })
    expect(lock.allowlist.domains.length).toBeGreaterThan(0)
  })

  it('starts a lock with a frozen, normalized allowlist snapshot', () => {
    createFocusAllowlist({
      name: 'Uni',
      domains: ['https://www.My-Uni.edu/path'],
      apps: ['Code.EXE'],
      isDefault: true,
    })
    const { session, lock } = start(30, { extraDomains: ['docs.rs'], task: 'Thesis' })
    expect(session.mode).toBe('max')
    expect(lock.exitState).toBe('locked')
    expect(lock.allowlist.domains).toEqual(expect.arrayContaining(['my-uni.edu', 'docs.rs']))
    expect(lock.allowlist.apps).toEqual(['code.exe'])

    // later allowlist edits don't change the running lock
    updateFocusAllowlist(listFocusAllowlists()[0]!.id, { domains: ['other.org'] })
    expect(getActiveFocusLock().allowlist.domains).toContain('my-uni.edu')
    expect(getActiveFocusLock().task).toBe('Thesis')
  })

  it('refuses a second concurrent session', () => {
    start()
    expect(() => start()).toThrow(/already in progress/)
  })

  it('enforces the 60s cooldown, then confirms exit with a friction record', () => {
    const { session } = start()
    const req = requestMaxFocusEarlyExit()
    expect(req.lock.exitState).toBe('cooldown')
    expect(req.lock.cooldownRemainingSec).toBeGreaterThan(55)
    expect(() => confirmMaxFocusEarlyExit('bored')).toThrow(/cooldown/)

    // fast-forward: the exit was requested two minutes ago
    db.update(focusSessions)
      .set({ exitRequestedAt: minutesAgo(2) })
      .where(eq(focusSessions.id, session.id))
      .run()
    const done = confirmMaxFocusEarlyExit('bored')
    expect(done.session.endedEarly).toBe(true)
    expect(done.session.completed).toBe(false)
    expect(done.session.endedAt).not.toBeNull()
    expect(done.lock.active).toBe(false)

    const fr = db.select().from(frictionEvents).all()
    expect(fr).toHaveLength(1)
    expect(fr[0]).toMatchObject({ trigger: 'max_focus_exit', proceeded: true, reflection: 'bored' })
  })

  it('cancelling an exit request resets the gate and logs a resisted impulse', () => {
    start()
    requestMaxFocusEarlyExit()
    const { lock } = cancelMaxFocusEarlyExit()
    expect(lock.exitState).toBe('locked')
    expect(lock.exitRequestedAt).toBeNull()
    const fr = db.select().from(frictionEvents).all()
    expect(fr[0]).toMatchObject({ proceeded: false })
    // cancelling again (no pending request) is a no-op
    cancelMaxFocusEarlyExit()
    expect(db.select().from(frictionEvents).all()).toHaveLength(1)
  })

  it('throws on exit requests with no max session running', () => {
    expect(() => requestMaxFocusEarlyExit()).toThrow(/No active Max Focus/)
    expect(() => confirmMaxFocusEarlyExit('x')).toThrow(/No active Max Focus/)
  })
})

describe('open-session semantics (regressions)', () => {
  it('an ended-but-not-completed session is not open', () => {
    db.insert(focusSessions)
      .values({
        startedAt: minutesAgo(30),
        plannedMinutes: 25,
        completed: false,
        endedAt: minutesAgo(10),
      })
      .run()
    expect(getOpenFocusSession()).toBeUndefined()
    expect(getActiveFocusLock().active).toBe(false)
    // and it doesn't block a new max session
    expect(() => start()).not.toThrow()
  })

  it('an older still-open session is found even when a newer one has ended', () => {
    const [older] = db
      .insert(focusSessions)
      .values({ startedAt: minutesAgo(20), plannedMinutes: 50 })
      .returning()
      .all()
    db.insert(focusSessions)
      .values({ startedAt: minutesAgo(5), plannedMinutes: 25, endedAt: minutesAgo(1) })
      .run()
    expect(getOpenFocusSession()?.id).toBe(older!.id)
  })

  it('a max lock that expired while the app was closed does not block a new one', () => {
    const [stale] = db
      .insert(focusSessions)
      .values({
        startedAt: minutesAgo(90),
        plannedMinutes: 60,
        mode: 'max',
        lockedUntil: minutesAgo(30),
      })
      .returning()
      .all()
    expect(getActiveFocusLock().active).toBe(false)

    const { session } = start()
    expect(session.id).not.toBe(stale!.id)
    const closed = db.select().from(focusSessions).where(eq(focusSessions.id, stale!.id)).get()!
    expect(closed.endedAt).toBe(stale!.lockedUntil)
    expect(closed.actualMinutes).toBe(60)
    expect(closed.completed).toBe(false) // XP only via the session-end route
  })

  it('closeExpiredMaxSession ignores live locks and standard sessions', () => {
    const live = {
      mode: 'max',
      lockedUntil: new Date(Date.now() + 60_000).toISOString(),
      endedAt: null,
    }
    const std = { mode: 'standard', lockedUntil: null, endedAt: null }
    expect(closeExpiredMaxSession(live as never, db)).toBe(false)
    expect(closeExpiredMaxSession(std as never, db)).toBe(false)
  })
})

describe('allowlist CRUD', () => {
  it('keeps exactly one default, normalizes entries, and deletes', () => {
    const a = createFocusAllowlist({ name: 'A', domains: ['A.com'], apps: [], isDefault: true })
    const b = createFocusAllowlist({ name: 'B', domains: [], apps: ['X.exe'], isDefault: true })
    const rows = listFocusAllowlists()
    expect(rows.filter((r) => r.isDefault).map((r) => r.id)).toEqual([b.id])
    expect(rows[0]!.id).toBe(b.id) // default sorts first
    expect(a.domains).toEqual(['a.com'])

    expect(updateFocusAllowlist(a.id, { isDefault: true })?.isDefault).toBe(true)
    expect(listFocusAllowlists().filter((r) => r.isDefault)).toHaveLength(1)
    expect(updateFocusAllowlist(99_999, { name: 'x' })).toBeNull()

    expect(deleteFocusAllowlist(a.id)).toBe(true)
    expect(deleteFocusAllowlist(a.id)).toBe(false)
  })
})
