/**
 * Learning HUB — Max Focus Mode repository.
 *
 * Coordinates active session state, commitment-lock early exits with mandatory
 * 60s cooldown and reflection, allowlists, and companion extension bridge pairing.
 */
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  COOLDOWN_SECONDS,
  DEFAULT_ALLOWED_DOMAINS,
  exitGate,
  normalizeDomain,
  normalizeExeName,
  type FocusAllowlistInput,
  type FocusLockStatus,
  type MaxFocusStartInput,
} from '@learning-hub/core/focus-lock'
import { getDb, type LearningHubDB } from '../index'
import { focusAllowlists, focusBridge, focusSessions, frictionEvents } from '../schema'
import { withTransaction, type Transaction } from '../transaction'

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
 * (app closed). It ended at `lockedUntil`; it is NOT marked completed because
 * completion (and its XP) is only granted through the session-end route.
 * Returns true if the session was closed.
 */
export function closeExpiredMaxSession(
  session: typeof focusSessions.$inferSelect,
  conn: DbOrTx,
  now: Date = new Date(),
): boolean {
  if (session.mode !== 'max' || !session.lockedUntil || session.endedAt) return false
  if (new Date(session.lockedUntil).getTime() > now.getTime()) return false
  conn
    .update(focusSessions)
    .set({ endedAt: session.lockedUntil, actualMinutes: session.plannedMinutes })
    .where(eq(focusSessions.id, session.id))
    .run()
  return true
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
  }
}

/**
 * Atomically starts a new Max Focus session with frozen allowlist snapshot.
 */
export function startMaxFocusSession(
  input: MaxFocusStartInput,
  database?: LearningHubDB,
): { session: typeof focusSessions.$inferSelect; lock: FocusLockStatus } {
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
        .set({ exitRequestedAt: nowIso })
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
        .set({ exitRequestedAt: null })
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
