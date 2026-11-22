import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MAX_FOCUS_HARD_CAP_MINUTES, advanceSession } from '@learning-hub/core'
import {
  cancelMaxFocusEarlyExit,
  closeExpiredMaxSession,
  confirmMaxFocusEarlyExit,
  createFocusAllowlist,
  deleteFocusAllowlist,
  endMaxFocusSessionByReason,
  extendMaxFocusSession,
  focusAllowlists,
  focusSessions,
  frictionEvents,
  getActiveFocusLock,
  getMaxFocusSessionRow,
  getOpenFocusSession,
  getOrCreateFocusBridge,
  initDb,
  listFocusAllowlists,
  listMaxFocusExits,
  listMaxFocusSessions,
  recordFocusBridgeHeartbeat,
  requestMaxFocusEarlyExit,
  rotateFocusBridgeToken,
  setDb,
  setMaxFocusSessionState,
  setMaxFocusSessionTier,
  setMaxFocusSessionWindow,
  startMaxFocusSession,
  toMaxFocusMachineSession,
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

describe('M2-03 lock-state persistence (state / tier / exitReason / hardCapAt)', () => {
  it('stamps state=locked + the 4h hard cap at start and records a tier when given', () => {
    const { session, lock } = start(30, { tier: 'owner' })
    expect(session.state).toBe('locked')
    expect(session.tier).toBe('owner')
    const startedMs = new Date(session.startedAt).getTime()
    expect(new Date(session.hardCapAt!).getTime()).toBe(
      startedMs + MAX_FOCUS_HARD_CAP_MINUTES * 60_000,
    )
    expect(lock.state).toBe('locked')
    expect(lock.tier).toBe('owner')
    expect(lock.hardCapAt).toBe(session.hardCapAt)

    // A new start refuses while a session is open (lifecycle contract) —
    // end the first lock before checking the no-tier default shape.
    endMaxFocusSessionByReason(session.id, { reason: 'pin' })
    // without an explicit tier the column stays null (the native bridge fills it)
    const plain = start(15).session
    expect(plain.state).toBe('locked')
    expect(plain.tier).toBeNull()
    expect(plain.hardCapAt).not.toBeNull()
  })

  it('exit request persists cooldown; cancel restores locked', () => {
    start()
    requestMaxFocusEarlyExit()
    expect(getOpenFocusSession()!.state).toBe('cooldown')
    expect(getActiveFocusLock().state).toBe('cooldown')
    cancelMaxFocusEarlyExit()
    expect(getOpenFocusSession()!.state).toBe('locked')
    expect(getActiveFocusLock().state).toBe('locked')
  })

  it('confirm exit stamps state=ended with exitReason=pin', () => {
    const { session } = start()
    requestMaxFocusEarlyExit()
    db.update(focusSessions)
      .set({ exitRequestedAt: minutesAgo(2) })
      .where(eq(focusSessions.id, session.id))
      .run()
    const done = confirmMaxFocusEarlyExit('my reflection is long enough here')
    expect(done.session.state).toBe('ended')
    expect(done.session.exitReason).toBe('pin')
    expect(done.lock.state).toBeNull() // lock is inactive after the end
  })

  it('closeExpiredMaxSession ends at the earlier of planned end and hard cap, reason timer', () => {
    // One fixture timestamp, reused for set + assert (two clock reads drift).
    const expiredAt = minutesAgo(1)
    const a = start(10).session
    db.update(focusSessions).set({ lockedUntil: expiredAt }).where(eq(focusSessions.id, a.id)).run()
    expect(closeExpiredMaxSession(getMaxFocusSessionRow(a.id)!, db)).toBe(true)
    const endedA = getMaxFocusSessionRow(a.id)!
    expect(endedA.state).toBe('ended')
    expect(endedA.exitReason).toBe('timer')
    expect(endedA.endedAt).toBe(expiredAt)

    // hard cap earlier than the planned end still closes (cap = the ceiling)
    const b = start(10).session
    db.update(focusSessions)
      .set({ lockedUntil: new Date(Date.now() + 60_000).toISOString(), hardCapAt: expiredAt })
      .where(eq(focusSessions.id, b.id))
      .run()
    expect(closeExpiredMaxSession(getMaxFocusSessionRow(b.id)!, db)).toBe(true)
    expect(getMaxFocusSessionRow(b.id)!.endedAt).toBe(expiredAt)
  })

  it('setMaxFocusSessionState / Tier / Window persist and throw on unknown ids', () => {
    const { session } = start(20)
    expect(setMaxFocusSessionState(session.id, 'can_confirm').state).toBe('can_confirm')
    expect(setMaxFocusSessionTier(session.id, 'windows-admin').tier).toBe('windows-admin')
    expect(setMaxFocusSessionTier(session.id, null).tier).toBeNull()
    const future = new Date(Date.now() + 90_000).toISOString()
    const capped = new Date(Date.now() + 120_000).toISOString()
    const row = setMaxFocusSessionWindow(session.id, { lockedUntil: future, hardCapAt: capped })
    expect(row.lockedUntil).toBe(future)
    expect(row.hardCapAt).toBe(capped)
    expect(() => setMaxFocusSessionState(999_999, 'locked')).toThrow(/not found/)
    expect(() => setMaxFocusSessionTier(999_999, 'owner')).toThrow(/not found/)
    expect(() => setMaxFocusSessionWindow(999_999, { lockedUntil: future })).toThrow(/not found/)
  })

  it('endMaxFocusSessionByReason stamps battery/tamper ends and is idempotent', () => {
    const { session } = start(45)
    const row = endMaxFocusSessionByReason(session.id, { reason: 'battery' })
    expect(row.state).toBe('ended')
    expect(row.exitReason).toBe('battery')
    expect(row.completed).toBe(false)
    expect(row.endedAt).not.toBeNull()
    // the first end wins — a tamper event cannot rewrite an ended session
    const again = endMaxFocusSessionByReason(session.id, { reason: 'tamper' })
    expect(again.exitReason).toBe('battery')
    expect(() => endMaxFocusSessionByReason(999_999, { reason: 'failure' })).toThrow(/not found/)
  })

  it('extendMaxFocusSession moves the planned end, clamps to the hard cap, refuses mid-exit', () => {
    const { session } = start(60)
    const before = new Date(session.lockedUntil!).getTime()
    const extended = extendMaxFocusSession(30)
    expect(new Date(extended.session.lockedUntil!).getTime()).toBe(before + 30 * 60_000)
    expect(extended.lock.active).toBe(true)

    // asking for 10 more hours only reaches the 4h cap
    const clamped = extendMaxFocusSession(600)
    expect(new Date(clamped.session.lockedUntil!).getTime()).toBe(
      new Date(session.hardCapAt!).getTime(),
    )

    // mid-exit-flow extension is refused — the reflection gate must not be outrun
    requestMaxFocusEarlyExit()
    expect(() => extendMaxFocusSession(10)).toThrow(/exit is pending/)
  })

  it('toMaxFocusMachineSession maps rows the core machine can advance and end', () => {
    const { session } = start(30)
    const row = getMaxFocusSessionRow(session.id)!
    const startedMs = new Date(row.startedAt).getTime()
    const machine = toMaxFocusMachineSession(row, startedMs)
    expect(machine.state).toBe('locked')

    // advance past the planned end → the machine ends it with reason timer
    const past = advanceSession(machine, {
      wallMs: startedMs + 31 * 60_000,
      monoMs: startedMs + 31 * 60_000,
    })
    expect(past.session.state).toBe('ended')
    expect(past.session.unlockReason).toBe('timer')
    expect(past.events).toContain('session_ended')

    // exit request → cooldown shape with the 60s window
    requestMaxFocusEarlyExit()
    const cooling = toMaxFocusMachineSession(getMaxFocusSessionRow(session.id)!, startedMs)
    expect(cooling.state).toBe('cooldown')
    expect(cooling.cooldownEndsAtMs).toBe(cooling.exitRequestedAtMs! + 60_000)
  })

  it('listMaxFocusSessions returns only max rows; listMaxFocusExits the reflections', () => {
    const first = start(15, { task: 'max one' })
    // A CLOSED standard session (abandoned pomodoro shape) — it must not
    // appear in the max-only list, and an open row would block the next start.
    db.insert(focusSessions)
      .values({
        startedAt: new Date().toISOString(),
        plannedMinutes: 25,
        endedAt: new Date().toISOString(),
        actualMinutes: 25,
        completed: false,
      })
      .run() // standard session — must not appear
    const maxRows = listMaxFocusSessions({ limit: 10 })
    expect(maxRows).toHaveLength(1)
    expect(maxRows[0]!.mode).toBe('max')

    // The first lock is still open — end it before the exit-flow session.
    endMaxFocusSessionByReason(first.session.id, { reason: 'pin' })
    const { session } = start(20)
    requestMaxFocusEarlyExit()
    db.update(focusSessions)
      .set({ exitRequestedAt: minutesAgo(2) })
      .where(eq(focusSessions.id, session.id))
      .run()
    confirmMaxFocusEarlyExit('history test reflection, long enough')
    const exits = listMaxFocusExits()
    expect(exits).toHaveLength(1)
    expect(exits[0]).toMatchObject({ trigger: 'max_focus_exit', proceeded: true })
  })
})
