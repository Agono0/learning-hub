/**
 * Learning HUB — Max Focus Mode repository.
 *
 * Coordinates active session state, commitment-lock early exits with mandatory
 * 60s cooldown and reflection, allowlists, and companion extension bridge pairing.
 */
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import {
  COOLDOWN_SECONDS,
  DEFAULT_ALLOWED_DOMAINS,
  MAX_FOCUS_HARD_CAP_MINUTES,
  exitGate,
  normalizeDomain,
  normalizeExeName,
  XP_REWARDS,
  type FocusAllowlistInput,
  type FocusLockStatus,
  type FocusSessionTier,
  type FrictionTrigger,
  type MaxFocusSession,
  type MaxFocusStartInput,
  type MaxSessionPhase,
  type SessionUnlockReason,
} from '@learning-hub/core'
import { updateStreakInTx } from '../review-service'
import { getDb, type LearningHubDB } from '../index'
import { focusAllowlists, focusBridge, focusSessions, frictionEvents } from '../schema'
import { withTransaction, type Transaction } from '../transaction'
import { awardXp } from './xp'

export type DbOrTx = LearningHubDB | Transaction

function generateSecureToken(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  // Base64URL
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The session currently in progress: not completed AND not ended. A session
 * that was abandoned or exited early has `endedAt` set and is never "open",
 * even though `completed` stays false.
 */
export function getOpenFocusSession(
  database?: DbOrTx,
): typeof focusSessions.$inferSelect | undefined {
  const conn = database ?? getDb()
  return conn
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.completed, false), isNull(focusSessions.endedAt)))
    .orderBy(desc(focusSessions.id))
    .limit(1)
    .get()
}

/**
 * Closes a Max Focus session whose lock ran out while nobody was watching
 * (app closed). It ended at the earlier of `lockedUntil` (planned end) and
 * `hardCapAt` (M2-03 absolute ceiling); it is NOT marked completed because
 * completion (and its XP) is only granted through the session-end route.
 * The M2-03 columns are stamped for the report card: `state = 'ended'`,
 * `exitReason = 'timer'`. Returns true if the session was closed.
 */
export function closeExpiredMaxSession(
  session: typeof focusSessions.$inferSelect,
  conn: DbOrTx,
  now: Date = new Date(),
): boolean {
  if (session.mode !== 'max' || session.endedAt) return false
  const lockEnd = session.lockedUntil !== null ? Date.parse(session.lockedUntil) : NaN
  const capEnd = session.hardCapAt !== null ? Date.parse(session.hardCapAt) : NaN
  const candidates = [lockEnd, capEnd].filter((ms) => Number.isFinite(ms))
  if (candidates.length === 0) return false
  const endMs = Math.min(...candidates)
  if (now.getTime() < endMs) return false
  const endIso = new Date(endMs).toISOString()
  conn
    .update(focusSessions)
    .set({
      endedAt: endIso,
      actualMinutes: session.plannedMinutes,
      state: 'ended',
      exitReason: 'timer',
    })
    .where(eq(focusSessions.id, session.id))
    .run()
  return true
}

// ─── M2-03: persisted lock-state columns (state / tier / exitReason / hardCapAt) ──
//
// Migration 033 extended `focus_sessions` with the Max Focus state-machine
// columns. The lifecycle mutators above (start / request / confirm / cancel /
// closeExpiredMaxSession) keep them in step; these setters cover the paths
// the platform layer drives directly: the native bridge reporting which
// enforcement tier it achieved (M2-05…M2-14), system-forced unlocks
// (battery / tamper / watchdog failure — M2-19/M2-20/M2-23), extensions
// clamped by the hard cap, and the history surfaces (M2-25).

/** Fetch one session row by id (works inside or outside a transaction). */
export function getMaxFocusSessionRow(id: number, database?: DbOrTx): FocusSessionRow | undefined {
  const conn = database ?? getDb()
  return conn.select().from(focusSessions).where(eq(focusSessions.id, id)).get()
}

/** Internal: require a row, with a clear error for the setters below. */
function requireSessionRow(id: number, database?: DbOrTx): FocusSessionRow {
  const row = getMaxFocusSessionRow(id, database)
  if (!row) throw new Error(`Focus session #${id} not found`)
  return row
}

/**
 * Persist a lock-phase transition (`locked → cooldown → can_confirm → ended`).
 * Throws when the session does not exist. Callers deriving the phase from the
 * machine should also stamp `exitReason` via {@link endMaxFocusSessionByReason}
 * when the target phase is `ended`.
 */
export function setMaxFocusSessionState(
  id: number,
  state: MaxSessionPhase,
  database?: DbOrTx,
): FocusSessionRow {
  const conn = database ?? getDb()
  requireSessionRow(id, conn)
  conn.update(focusSessions).set({ state }).where(eq(focusSessions.id, id)).run()
  return requireSessionRow(id, conn)
}

/** Record the enforcement tier the native layer actually achieved (null resets). */
export function setMaxFocusSessionTier(
  id: number,
  tier: FocusSessionTier | null,
  database?: DbOrTx,
): FocusSessionRow {
  const conn = database ?? getDb()
  requireSessionRow(id, conn)
  conn.update(focusSessions).set({ tier }).where(eq(focusSessions.id, id)).run()
  return requireSessionRow(id, conn)
}

/** Move a running lock's deadlines (`lockedUntil` planned end and/or `hardCapAt`). */
export function setMaxFocusSessionWindow(
  id: number,
  patch: { lockedUntil?: string; hardCapAt?: string },
  database?: DbOrTx,
): FocusSessionRow {
  const conn = database ?? getDb()
  requireSessionRow(id, conn)
  conn.update(focusSessions).set(patch).where(eq(focusSessions.id, id)).run()
  return requireSessionRow(id, conn)
}

/** Input for {@link endMaxFocusSessionByReason}. */
export interface EndMaxFocusByReasonArgs {
  /** Why the session ended — stored in `exit_reason` (migration 033). */
  reason: SessionUnlockReason
  /** End timestamp (ISO); defaults to now. */
  endedAt?: string
  /** Actual minutes; defaults to the elapsed start→end time. */
  actualMinutes?: number
  /** Natural completion flag — true only for a timer end that grants XP elsewhere. */
  completed?: boolean
}

/**
 * System-forced / natural end of a Max Focus session with the unlock reason
 * stamped: battery threshold (M2-19), tamper detection (M2-20), watchdog
 * failure (M2-23) or a natural timer end. Idempotent — an already-ended
 * session is returned unchanged. No XP here: reward stays on the canonical
 * completion path (rule 7); callers that end with `completed: true` route
 * through {@link finishFocusSession}.
 */
export function endMaxFocusSessionByReason(
  sessionId: number,
  args: EndMaxFocusByReasonArgs,
  database?: LearningHubDB,
): FocusSessionRow {
  const conn = database ?? getDb()

  return withTransaction((tx) => {
    const existing = tx.select().from(focusSessions).where(eq(focusSessions.id, sessionId)).get()
    if (!existing) throw new Error(`Focus session #${sessionId} not found`)
    if (existing.endedAt) return existing

    const endedAt = args.endedAt ?? new Date().toISOString()
    const actualMinutes = Math.max(
      0,
      args.actualMinutes ?? elapsedMinutes(existing.startedAt, new Date(endedAt)),
    )
    const [row] = tx
      .update(focusSessions)
      .set({
        endedAt,
        actualMinutes,
        completed: args.completed ?? false,
        state: 'ended',
        exitReason: args.reason,
      })
      .where(eq(focusSessions.id, sessionId))
      .returning()
      .all()
    return row!
  }, conn)
}

/**
 * Extend a running Max Focus session by `extraMinutes`, clamped to the
 * absolute hard cap. Extending is allowed only while `locked` — mid-exit-flow
 * extensions would let a session outrun its own reflection gate (the same
 * rule the core machine's `extendMaxSession` enforces device-side). Returns
 * the updated session and refreshed lock status.
 */
export function extendMaxFocusSession(
  extraMinutes: number,
  database?: LearningHubDB,
): { session: FocusSessionRow; lock: FocusLockStatus } {
  const conn = database ?? getDb()

  return withTransaction((tx) => {
    const session = getOpenFocusSession(tx)
    if (!session || session.mode !== 'max') {
      throw new Error('No active Max Focus session to extend.')
    }
    if (session.exitRequestedAt) {
      throw new Error('Cannot extend while an early exit is pending — cancel or finish it first.')
    }

    const startedMs = Date.parse(session.startedAt)
    const baseMs = session.lockedUntil
      ? Date.parse(session.lockedUntil)
      : startedMs + session.plannedMinutes * 60_000
    const capMs = session.hardCapAt
      ? Date.parse(session.hardCapAt)
      : startedMs + MAX_FOCUS_HARD_CAP_MINUTES * 60_000
    const proposed = baseMs + extraMinutes * 60_000
    const nextMs = Math.min(Number.isFinite(proposed) ? proposed : capMs, capMs)

    tx.update(focusSessions)
      .set({ lockedUntil: new Date(nextMs).toISOString() })
      .where(eq(focusSessions.id, session.id))
      .run()

    return { session: getMaxFocusSessionRow(session.id, tx)!, lock: getActiveFocusLock(tx) }
  }, conn)
}

/**
 * Map a persisted row onto the core session machine's {@link MaxFocusSession}
 * so handlers/platform code can run `advanceSession` / `requestSessionExit` /
 * `confirmSessionExit` over real data. The monotonic anchor is NOT persisted
 * (it is meaningless across boots and devices — see `core/focus-lock/resume.ts`);
 * callers supply the current reading. Phase derivation prefers the raw facts
 * (`endedAt`, `exitRequestedAt`) over the cached `state` column so a stale
 * cache can never resurrect an ended lock.
 */
export function toMaxFocusMachineSession(
  row: FocusSessionRow,
  monoAnchorMs: number,
): MaxFocusSession {
  const startedAtMs = safeParseMs(row.startedAt, 0)
  const plannedEndMs = row.lockedUntil
    ? safeParseMs(row.lockedUntil, startedAtMs + row.plannedMinutes * 60_000)
    : startedAtMs + row.plannedMinutes * 60_000
  const hardCapAtMs = row.hardCapAt
    ? safeParseMs(row.hardCapAt, startedAtMs + MAX_FOCUS_HARD_CAP_MINUTES * 60_000)
    : startedAtMs + MAX_FOCUS_HARD_CAP_MINUTES * 60_000
  const base = {
    sessionId: String(row.id),
    startedAtMs,
    plannedEndMs,
    hardCapAtMs,
    monoAnchorMs,
  }

  if (row.endedAt) {
    return {
      ...base,
      state: 'ended',
      exitRequestedAtMs: row.exitRequestedAt ? safeParseMs(row.exitRequestedAt, null) : null,
      cooldownEndsAtMs: null,
      unlockReason: (row.exitReason as SessionUnlockReason | null) ?? null,
      endedAtMs: safeParseMs(row.endedAt, startedAtMs),
    }
  }

  if (row.exitRequestedAt) {
    const requestedAtMs = safeParseMs(row.exitRequestedAt, startedAtMs)
    return {
      ...base,
      state: 'cooldown',
      exitRequestedAtMs: requestedAtMs,
      cooldownEndsAtMs: requestedAtMs + COOLDOWN_SECONDS * 1000,
      unlockReason: null,
      endedAtMs: null,
    }
  }

  return {
    ...base,
    state: 'locked',
    exitRequestedAtMs: null,
    cooldownEndsAtMs: null,
    unlockReason: null,
    endedAtMs: null,
  }
}

/** `Date.parse` with a fallback — corrupt timestamps never produce NaN shapes. */
function safeParseMs(iso: string, fallback: number): number
function safeParseMs(iso: string, fallback: number | null): number | null
function safeParseMs(iso: string, fallback: number | null): number | null {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : fallback
}

/** Recent Max Focus sessions, newest first (M2-25 history UI + GET handler). */
export function listMaxFocusSessions(
  opts: { limit?: number; db?: LearningHubDB } = {},
): FocusSessionRow[] {
  const conn = opts.db ?? getDb()
  return conn
    .select()
    .from(focusSessions)
    .where(eq(focusSessions.mode, 'max'))
    .orderBy(desc(focusSessions.startedAt))
    .limit(opts.limit ?? 20)
    .all()
}

/** Exit/reflection friction records for Max Focus sessions, newest first. */
export function listMaxFocusExits(
  opts: { limit?: number; db?: LearningHubDB } = {},
): (typeof frictionEvents.$inferSelect)[] {
  const conn = opts.db ?? getDb()
  return conn
    .select()
    .from(frictionEvents)
    .where(eq(frictionEvents.trigger, 'max_focus_exit'))
    .orderBy(desc(frictionEvents.createdAt))
    .limit(opts.limit ?? 50)
    .all()
}

/**
 * Ensures a focus bridge pairing record exists with a secure token.
 */
export function getOrCreateFocusBridge(database?: DbOrTx): typeof focusBridge.$inferSelect {
  const conn = database ?? getDb()
  const existing = conn.select().from(focusBridge).where(eq(focusBridge.id, 'default')).get()
  if (existing) return existing

  const nowIso = new Date().toISOString()
  const token = generateSecureToken()
  conn
    .insert(focusBridge)
    .values({
      id: 'default',
      pairingToken: token,
      updatedAt: nowIso,
    })
    .run()

  return conn.select().from(focusBridge).where(eq(focusBridge.id, 'default')).get()!
}

/**
 * Rotates the extension pairing token.
 */
export function rotateFocusBridgeToken(database?: DbOrTx): typeof focusBridge.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  const token = generateSecureToken()

  conn
    .insert(focusBridge)
    .values({
      id: 'default',
      pairingToken: token,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: focusBridge.id,
      set: {
        pairingToken: token,
        extensionId: null,
        updatedAt: nowIso,
      },
    })
    .run()

  return conn.select().from(focusBridge).where(eq(focusBridge.id, 'default')).get()!
}

/**
 * Records a periodic heartbeat received from the companion browser extension.
 */
export function recordFocusBridgeHeartbeat(extensionId?: string, database?: DbOrTx): void {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  getOrCreateFocusBridge(conn)

  const patch: Partial<typeof focusBridge.$inferInsert> = {
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  }
  if (extensionId) {
    patch.extensionId = extensionId
  }

  conn.update(focusBridge).set(patch).where(eq(focusBridge.id, 'default')).run()
}

/**
 * Inspects current focus session and computes real-time lock status.
 */
export function getActiveFocusLock(database?: DbOrTx): FocusLockStatus {
  const conn = database ?? getDb()
  const bridge = getOrCreateFocusBridge(conn)
  const activeSession = getOpenFocusSession(conn)

  if (!activeSession || activeSession.endedAt) {
    return {
      active: false,
      sessionId: null,
      mode: 'standard',
      endsAt: null,
      lockedUntil: null,
      exitRequestedAt: null,
      exitState: 'none',
      cooldownRemainingSec: 0,
      allowlist: {
        domains: [...DEFAULT_ALLOWED_DOMAINS],
        apps: [],
      },
      lastHeartbeatAt: bridge.lastHeartbeatAt,
      task: null,
      state: null,
      tier: null,
      hardCapAt: null,
    }
  }

  const now = new Date()
  const lockedUntil = activeSession.lockedUntil
  const isMax = activeSession.mode === 'max' && Boolean(lockedUntil)

  if (!isMax || !lockedUntil) {
    return {
      active: true,
      sessionId: activeSession.id,
      mode: 'standard',
      endsAt: null,
      lockedUntil: null,
      exitRequestedAt: null,
      exitState: 'none',
      cooldownRemainingSec: 0,
      allowlist: {
        domains: [...DEFAULT_ALLOWED_DOMAINS],
        apps: [],
      },
      lastHeartbeatAt: bridge.lastHeartbeatAt,
      task: activeSession.task,
      state: null,
      tier: null,
      hardCapAt: null,
    }
  }

  const gate = exitGate(
    {
      lockedUntil,
      exitRequestedAt: activeSession.exitRequestedAt,
      endedEarly: activeSession.endedEarly,
    },
    now,
  )

  const snapshot = activeSession.allowSnapshot ?? { domains: [], apps: [] }
  const domainsSet = new Set<string>()
  for (const d of DEFAULT_ALLOWED_DOMAINS) domainsSet.add(d)
  for (const d of snapshot.domains ?? []) {
    const norm = normalizeDomain(d)
    if (norm) domainsSet.add(norm)
  }

  const appsSet = new Set<string>()
  for (const a of snapshot.apps ?? []) {
    const norm = normalizeExeName(a)
    if (norm) appsSet.add(norm)
  }

  return {
    active: gate.state !== 'ended',
    sessionId: activeSession.id,
    mode: 'max',
    endsAt: lockedUntil,
    lockedUntil,
    exitRequestedAt: activeSession.exitRequestedAt,
    exitState: gate.state,
    cooldownRemainingSec: gate.remainingCooldownSec,
    allowlist: {
      domains: Array.from(domainsSet),
      apps: Array.from(appsSet),
    },
    lastHeartbeatAt: bridge.lastHeartbeatAt,
    task: activeSession.task,
    state: gate.state,
    tier: (activeSession.tier as FocusSessionTier | null) ?? null,
    hardCapAt: activeSession.hardCapAt,
  }
}

/**
 * Atomically starts a new Max Focus session with frozen allowlist snapshot.
 *
 * M2-03: the row is stamped with the state machine's starting phase
 * (`state = 'locked'`), the absolute hard cap (`hardCapAt = start + 4h`,
 * the locked Phase-1 decision) and, when the caller already knows it, the
 * enforcement `tier` the platform layer will apply (the native bridge can
 * refine it later via {@link setMaxFocusSessionTier}).
 */
export function startMaxFocusSession(
  input: MaxFocusStartInput & { tier?: FocusSessionTier },
  database?: LearningHubDB,
): { session: FocusSessionRow; lock: FocusLockStatus } {
  const conn = database ?? getDb()

  return withTransaction((tx) => {
    // Check if an existing uncompleted session is still active
    const existing = getOpenFocusSession(tx)

    // A lock that expired while the app was closed must not block a new one.
    if (existing && !closeExpiredMaxSession(existing, tx)) {
      throw new Error(
        `Focus session #${existing.id} is already in progress. Complete or exit it before starting Max Focus.`,
      )
    }

    // Resolve allowlist
    const domainsSet = new Set<string>()
    for (const d of DEFAULT_ALLOWED_DOMAINS) domainsSet.add(d)
    const appsSet = new Set<string>()

    let selectedAllowlistId: number | null = null
    if (input.allowlistId) {
      const row = tx
        .select()
        .from(focusAllowlists)
        .where(eq(focusAllowlists.id, input.allowlistId))
        .get()
      if (row) {
        selectedAllowlistId = row.id
        for (const d of row.domains ?? []) {
          const norm = normalizeDomain(d)
          if (norm) domainsSet.add(norm)
        }
        for (const a of row.apps ?? []) {
          const norm = normalizeExeName(a)
          if (norm) appsSet.add(norm)
        }
      }
    } else {
      const def = tx
        .select()
        .from(focusAllowlists)
        .where(eq(focusAllowlists.isDefault, true))
        .limit(1)
        .get()
      if (def) {
        selectedAllowlistId = def.id
        for (const d of def.domains ?? []) {
          const norm = normalizeDomain(d)
          if (norm) domainsSet.add(norm)
        }
        for (const a of def.apps ?? []) {
          const norm = normalizeExeName(a)
          if (norm) appsSet.add(norm)
        }
      }
    }

    for (const d of input.extraDomains ?? []) {
      const norm = normalizeDomain(d)
      if (norm) domainsSet.add(norm)
    }
    for (const a of input.extraApps ?? []) {
      const norm = normalizeExeName(a)
      if (norm) appsSet.add(norm)
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const lockedUntil = new Date(now.getTime() + input.minutes * 60_000).toISOString()
    const hardCapAt = new Date(now.getTime() + MAX_FOCUS_HARD_CAP_MINUTES * 60_000).toISOString()

    const snapshot = {
      domains: Array.from(domainsSet),
      apps: Array.from(appsSet),
    }

    const [created] = tx
      .insert(focusSessions)
      .values({
        startedAt: nowIso,
        plannedMinutes: input.minutes,
        type: 'deep',
        mode: 'max',
        task: input.task ?? null,
        lockedUntil,
        allowlistId: selectedAllowlistId,
        allowSnapshot: snapshot,
        leaks: 0,
        completed: false,
        endedEarly: false,
        state: 'locked',
        tier: input.tier ?? null,
        hardCapAt,
      })
      .returning()
      .all()

    const lock: FocusLockStatus = {
      active: true,
      sessionId: created!.id,
      mode: 'max',
      endsAt: lockedUntil,
      lockedUntil,
      exitRequestedAt: null,
      exitState: 'locked',
      cooldownRemainingSec: 0,
      allowlist: snapshot,
      lastHeartbeatAt: null,
      task: created!.task,
      state: 'locked',
      tier: input.tier ?? null,
      hardCapAt,
    }

    return { session: created!, lock }
  }, conn)
}

/**
 * Initiates an early exit request, kicking off the mandatory 60s cooldown timer.
 */
export function requestMaxFocusEarlyExit(database?: LearningHubDB): { lock: FocusLockStatus } {
  const conn = database ?? getDb()

  return withTransaction((tx) => {
    const session = getOpenFocusSession(tx)

    if (!session || session.endedAt || session.mode !== 'max') {
      throw new Error('No active Max Focus session to exit.')
    }

    const nowIso = new Date().toISOString()
    if (!session.exitRequestedAt) {
      tx.update(focusSessions)
        .set({ exitRequestedAt: nowIso, state: 'cooldown' })
        .where(eq(focusSessions.id, session.id))
        .run()
    }

    return { lock: getActiveFocusLock(tx) }
  }, conn)
}

/**
 * Confirms an early exit once the 60s reflection cooldown has completed.
 * Logs an append-only friction event with the user's typed reflection.
 */
export function confirmMaxFocusEarlyExit(
  reflection: string,
  database?: LearningHubDB,
): { session: typeof focusSessions.$inferSelect; lock: FocusLockStatus } {
  const conn = database ?? getDb()

  return withTransaction((tx) => {
    const session = getOpenFocusSession(tx)

    if (!session || session.endedAt || session.mode !== 'max') {
      throw new Error('No active Max Focus session to exit.')
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const gate = exitGate(
      {
        lockedUntil: session.lockedUntil ?? nowIso,
        exitRequestedAt: session.exitRequestedAt,
        endedEarly: session.endedEarly,
      },
      now,
    )

    if (gate.state === 'cooldown') {
      throw new Error(
        `Early exit cooldown active (${gate.remainingCooldownSec}s remaining). Take a moment to reflect before confirming.`,
      )
    }

    if (gate.state !== 'can_confirm') {
      throw new Error('Invalid early exit state.')
    }

    const startedMs = new Date(session.startedAt).getTime()
    const actualMinutes = Math.round(((now.getTime() - startedMs) / 60_000) * 10) / 10

    tx.update(focusSessions)
      .set({
        endedAt: nowIso,
        actualMinutes,
        completed: false,
        endedEarly: true,
        leaks: (session.leaks ?? 0) + 1,
        state: 'ended',
        exitReason: 'pin',
      })
      .where(eq(focusSessions.id, session.id))
      .run()

    tx.insert(frictionEvents)
      .values({
        trigger: 'max_focus_exit',
        delaySec: COOLDOWN_SECONDS,
        reflection,
        proceeded: true,
        sessionId: session.id,
        createdAt: nowIso,
      })
      .run()

    const updated = tx.select().from(focusSessions).where(eq(focusSessions.id, session.id)).get()!

    return { session: updated, lock: getActiveFocusLock(tx) }
  }, conn)
}

/**
 * Cancels an early exit request, resetting the timer and logging a resistance victory.
 */
export function cancelMaxFocusEarlyExit(database?: LearningHubDB): { lock: FocusLockStatus } {
  const conn = database ?? getDb()

  return withTransaction((tx) => {
    const session = getOpenFocusSession(tx)

    if (!session || session.endedAt || session.mode !== 'max') {
      return { lock: getActiveFocusLock(tx) }
    }

    if (session.exitRequestedAt) {
      const nowIso = new Date().toISOString()
      tx.update(focusSessions)
        .set({ exitRequestedAt: null, state: 'locked' })
        .where(eq(focusSessions.id, session.id))
        .run()

      tx.insert(frictionEvents)
        .values({
          trigger: 'max_focus_exit',
          delaySec: COOLDOWN_SECONDS,
          reflection: 'Decided to stay in focus and resist the impulse.',
          proceeded: false,
          sessionId: session.id,
          createdAt: nowIso,
        })
        .run()
    }

    return { lock: getActiveFocusLock(tx) }
  }, conn)
}

// ─── Standard (pomodoro/deep/custom) session lifecycle ─────────────────────
//
// Shared by the CLI `focus` command, the web /api/focus routes, and MCP focus
// tools — previously each host carried its own INSERT/UPDATE copies and the
// completion semantics (when XP and streak activity fire) had drifted.

/** Row shape of `focus_sessions` (re-exported for host typing convenience). */
export type FocusSessionRow = typeof focusSessions.$inferSelect

/** Input for {@link startFocusSession}. */
export interface StartFocusSessionInput {
  plannedMinutes: number
  /** pomodoro (default) | deep | custom */
  type?: 'pomodoro' | 'deep' | 'custom'
  /** Optional task label; trimmed, empty → null (web POST parity). */
  task?: string | null
  now?: Date
}

/**
 * Start a standard focus session (not Max-locked). The web POST /api/focus
 * route and the CLI `focus` command previously each inserted their own row.
 */
export function startFocusSession(
  input: StartFocusSessionInput,
  opts: { db?: LearningHubDB } = {},
): FocusSessionRow {
  const conn = opts.db ?? getDb()
  const [created] = conn
    .insert(focusSessions)
    .values({
      startedAt: (input.now ?? new Date()).toISOString(),
      plannedMinutes: input.plannedMinutes,
      type: input.type ?? 'pomodoro',
      task: input.task?.trim() || null,
    })
    .returning()
    .all()
  return created!
}

/**
 * Start a pomodoro session — the CLI `focus <minutes>` shape of
 * {@link startFocusSession}.
 */
export function createPomodoroSession(
  plannedMinutes: number,
  opts: { task?: string | null; now?: Date; db?: LearningHubDB } = {},
): FocusSessionRow {
  return startFocusSession(
    { plannedMinutes, type: 'pomodoro', task: opts.task, now: opts.now },
    { db: opts.db },
  )
}

/** Actual minutes rounded to one decimal, from `startedAt` to `now`. */
function elapsedMinutes(startedAt: string, now: Date): number {
  return Math.round(((now.getTime() - new Date(startedAt).getTime()) / 60_000) * 10) / 10
}

export interface FinishFocusSessionResult {
  session: FocusSessionRow
  /** XP paid by THIS call (0 when the session was already ended). */
  xpAwarded: number
}

/**
 * Complete a focus session: stamp `endedAt`/`actualMinutes`, mark completed,
 * and pay the canonical focus XP plus streak activity — but only on the
 * open→completed transition (an already-ended session can never be completed
 * retroactively; web PATCH /api/focus/[id] parity). One transaction so the
 * session state and its rewards commit atomically.
 */
export function finishFocusSession(
  sessionId: number,
  opts: { actualMinutes?: number; now?: Date; db?: LearningHubDB } = {},
): FinishFocusSessionResult {
  const conn = opts.db ?? getDb()

  return withTransaction((tx) => {
    const existing = tx.select().from(focusSessions).where(eq(focusSessions.id, sessionId)).get()
    if (!existing) throw new Error(`Focus session #${sessionId} not found`)
    if (existing.endedAt) return { session: existing, xpAwarded: 0 }

    const now = opts.now ?? new Date()
    const actualMinutes = opts.actualMinutes ?? elapsedMinutes(existing.startedAt, now)
    const [row] = tx
      .update(focusSessions)
      .set({ endedAt: now.toISOString(), actualMinutes, completed: true })
      .where(eq(focusSessions.id, sessionId))
      .returning()
      .all()

    // Rule 7: XP via the canonical awardXp path (repos/xp.ts); focus work
    // counts toward the streak exactly like the web completion route.
    awardXp(tx, {
      source: 'focus',
      meta: { sessionId, plannedMinutes: existing.plannedMinutes, task: existing.task },
    })
    updateStreakInTx(tx, now)

    return { session: row!, xpAwarded: XP_REWARDS.focusSession }
  }, conn)
}

/**
 * Abandon a focus session (CLI Ctrl+C = leak): stamp `endedAt`/`actualMinutes`,
 * keep `completed` false, and record the leak count (default 1). No XP is paid.
 */
export function abandonFocusSession(
  sessionId: number,
  opts: { actualMinutes?: number; leaks?: number; now?: Date; db?: LearningHubDB } = {},
): FocusSessionRow {
  const conn = opts.db ?? getDb()

  return withTransaction((tx) => {
    const existing = tx.select().from(focusSessions).where(eq(focusSessions.id, sessionId)).get()
    if (!existing) throw new Error(`Focus session #${sessionId} not found`)
    if (existing.endedAt) return existing

    const now = opts.now ?? new Date()
    const actualMinutes = opts.actualMinutes ?? elapsedMinutes(existing.startedAt, now)
    const [row] = tx
      .update(focusSessions)
      .set({
        endedAt: now.toISOString(),
        actualMinutes,
        completed: false,
        leaks: opts.leaks ?? 1,
      })
      .where(eq(focusSessions.id, sessionId))
      .returning()
      .all()
    return row!
  }, conn)
}

/** Recent sessions, newest first (MCP focus summary / web GET /api/focus). */
export function listRecentFocusSessions(
  opts: { limit?: number; db?: LearningHubDB } = {},
): FocusSessionRow[] {
  const conn = opts.db ?? getDb()
  const limit = opts.limit ?? 10
  return conn.select().from(focusSessions).orderBy(desc(focusSessions.startedAt)).limit(limit).all()
}

/** Per-trigger friction (distraction-gate) counts: total events and how many proceeded. */
export interface FrictionTriggerCount {
  trigger: FrictionTrigger
  count: number
  proceeded: number
}

/**
 * Friction events grouped by trigger with the proceeded tally — the MCP focus
 * summary previously carried this aggregate inline.
 */
export function frictionByTrigger(
  opts: { limit?: number; db?: LearningHubDB } = {},
): FrictionTriggerCount[] {
  const conn = opts.db ?? getDb()
  const rows = conn
    .select({
      trigger: frictionEvents.trigger,
      count: sql<number>`count(*)`,
      proceeded: sql<number>`sum(CASE WHEN proceeded THEN 1 ELSE 0 END)`,
    })
    .from(frictionEvents)
    .groupBy(frictionEvents.trigger)
    .all()
  const mapped = rows.map((f) => ({
    trigger: f.trigger,
    count: Number(f.count),
    proceeded: Number(f.proceeded ?? 0),
  }))
  return opts.limit !== undefined ? mapped.slice(0, opts.limit) : mapped
}

/**
 * Focus minutes logged over the last `days` days (window on `startedAt`),
 * counting COMPLETED sessions only — the weekly report's semantics
 * (`computeWeeklyReportMetrics` skips uncompleted sessions), which the CLI
 * `stats` panel previously diverged from by summing abandoned leaks too.
 */
export function sumFocusMinutes(
  opts: { days?: number; now?: Date; db?: LearningHubDB } = {},
): number {
  const conn = opts.db ?? getDb()
  const now = opts.now ?? new Date()
  const days = opts.days ?? 7
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const [row] = conn
    .select({ minutes: sql<number>`coalesce(sum(max(actual_minutes, 0)), 0)` })
    .from(focusSessions)
    .where(and(eq(focusSessions.completed, true), gte(focusSessions.startedAt, since)))
    .all()
  return Number(row?.minutes ?? 0)
}

// ─── Allowlist CRUD ────────────────────────────────────────────────────────

export function listFocusAllowlists(
  database?: LearningHubDB,
): (typeof focusAllowlists.$inferSelect)[] {
  const conn = database ?? getDb()
  return conn
    .select()
    .from(focusAllowlists)
    .orderBy(desc(focusAllowlists.isDefault), focusAllowlists.name)
    .all()
}

export function createFocusAllowlist(
  input: FocusAllowlistInput,
  database?: LearningHubDB,
): typeof focusAllowlists.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()

  return withTransaction((tx) => {
    if (input.isDefault) {
      tx.update(focusAllowlists).set({ isDefault: false }).run()
    }

    const [row] = tx
      .insert(focusAllowlists)
      .values({
        name: input.name,
        domains: input.domains.map(normalizeDomain).filter(Boolean),
        apps: input.apps.map(normalizeExeName).filter(Boolean),
        isDefault: input.isDefault,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning()
      .all()

    return row!
  }, conn)
}

export function updateFocusAllowlist(
  id: number,
  input: Partial<FocusAllowlistInput>,
  database?: LearningHubDB,
): typeof focusAllowlists.$inferSelect | null {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()

  return withTransaction((tx) => {
    const existing = tx.select().from(focusAllowlists).where(eq(focusAllowlists.id, id)).get()
    if (!existing) return null

    if (input.isDefault) {
      tx.update(focusAllowlists).set({ isDefault: false }).run()
    }

    const patch: Partial<typeof focusAllowlists.$inferInsert> = {
      updatedAt: nowIso,
    }
    if (input.name !== undefined) patch.name = input.name
    if (input.domains !== undefined) {
      patch.domains = input.domains.map(normalizeDomain).filter(Boolean)
    }
    if (input.apps !== undefined) {
      patch.apps = input.apps.map(normalizeExeName).filter(Boolean)
    }
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault

    tx.update(focusAllowlists).set(patch).where(eq(focusAllowlists.id, id)).run()

    return tx.select().from(focusAllowlists).where(eq(focusAllowlists.id, id)).get()!
  }, conn)
}

export function deleteFocusAllowlist(id: number, database?: LearningHubDB): boolean {
  const conn = database ?? getDb()
  const row = conn.select().from(focusAllowlists).where(eq(focusAllowlists.id, id)).get()
  if (!row) return false
  conn.delete(focusAllowlists).where(eq(focusAllowlists.id, id)).run()
  return true
}
