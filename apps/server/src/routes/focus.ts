/**
 * Learning HUB headless server — FOCUS routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 *
 * Every handler delegates to the shared focus repos (packages/db
 * repos/focus-lock and repos/focus-extras) — the same definitions the web app,
 * MCP and CLI call — so session XP, streak activity and friction logging go
 * through the canonical paths and cannot drift per host (AGENTS.md rule 7).
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  abandonFocusSession,
  cancelMaxFocusEarlyExit,
  confirmMaxFocusEarlyExit,
  createDistractionApp,
  finishFocusSession,
  frictionByTrigger,
  getActiveFocusLock,
  getOpenFocusSession,
  listDistractionApps,
  listRecentFocusSessions,
  requestMaxFocusEarlyExit,
  startFocusSession,
  startMaxFocusSession,
  sumFocusMinutes,
} from '@learning-hub/db'
import { dayKey, focusExitActionSchema, maxFocusStartSchema } from '@learning-hub/core'
import { ApiError, jsonError, sendJson, readJson, readQuery } from '../http'
import type { Route } from './shared'

// ── Schemas ─────────────────────────────────────────────────────────────────

/** Standard session start (web POST /api/focus parity: 1–600 planned minutes). */
const startSessionSchema = z.object({
  plannedMinutes: z.number().int().min(1).max(600),
  /** pomodoro (default) | deep | custom */
  type: z.enum(['pomodoro', 'deep', 'custom']).optional(),
  task: z.string().max(500).optional(),
})

/** Session completion: XP fires only on the open→completed transition (repo-enforced). */
const completeSessionSchema = z.object({
  sessionId: z.number().int().positive(),
  /** Actual focused minutes; omitted → computed from startedAt (1-decimal). */
  actualMinutes: z.number().min(0).optional(),
})

/** Session abandonment (a leak): no XP, `leaks` counter incremented (default 1). */
const abandonSessionSchema = z.object({
  sessionId: z.number().int().positive(),
  actualMinutes: z.number().min(0).optional(),
  leaks: z.number().int().min(0).optional(),
})

/** Distraction blocklist entry (focus-extras repo; unique name → duplicate is a 409). */
const distractionAppSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['app', 'website', 'habit']).optional(),
})

const focusListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

const focusInsightsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
})

// ── Error mapping ───────────────────────────────────────────────────────────

/**
 * Re-throw a shared repo's plain Error as an ApiError with web-handler parity:
 * missing session → 404, "already in progress" → 409, everything else → 400.
 * The repos throw bare Errors (they are host-agnostic); left unmapped,
 * sendError would turn them into a sanitized 500.
 */
function repoErrorToApi(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  const status = message.includes('not found')
    ? 404
    : message.includes('already in progress')
      ? 409
      : 400
  throw new ApiError(status, message)
}

// ── Handlers ────────────────────────────────────────────────────────────────

/** GET /focus/today?limit= — running session, recent sessions, 24h completed minutes. */
async function focusToday(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, focusListQuerySchema)
  const sessions = listRecentFocusSessions({ limit: q.limit ?? 10 })
  const completed = sessions.filter((s) => s.completed)
  sendJson(res, 200, {
    ok: true,
    day: dayKey(new Date()),
    // "running" = not completed AND not ended; abandoned/exited sessions keep
    // completed=false but have endedAt, and must not be restored as live.
    running: getOpenFocusSession() ?? null,
    sessions,
    // Completed-session minutes over the last 24h (sumFocusMinutes window).
    completedMinutes24h: sumFocusMinutes({ days: 1 }),
    completedRate: sessions.length ? completed.length / sessions.length : null,
  })
}

/** GET /focus/insights?days= — completed focus minutes per window + friction-by-trigger tallies. */
async function focusInsights(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, focusInsightsQuerySchema)
  const days = q.days ?? 7
  sendJson(res, 200, {
    ok: true,
    windowDays: days,
    // Completed sessions only — abandoned leaks are excluded on purpose
    // (weekly-report semantics, repos/focus-lock sumFocusMinutes).
    completedMinutes: sumFocusMinutes({ days }),
    frictionByTrigger: frictionByTrigger(),
  })
}

/** GET /focus/lock — real-time max/standard lock state (exit gate, cooldown, allowlist). */
async function focusLock(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, { ok: true, lock: getActiveFocusLock() })
}

/** POST /focus/session/start {plannedMinutes, type?, task?} — start a standard (non-Max) session. */
async function postSessionStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, startSessionSchema)
  // startFocusSession trims task (empty → null) — web POST parity.
  const session = startFocusSession({
    plannedMinutes: body.plannedMinutes,
    type: body.type,
    task: body.task ?? null,
  })
  sendJson(res, 201, { ok: true, session })
}

/** POST /focus/session/complete {sessionId, actualMinutes?} — complete + canonical XP + streak. */
async function postSessionComplete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, completeSessionSchema)
  try {
    // One transaction: end stamp + XP (awardXp, source 'focus') + streak —
    // an already-ended session returns xpAwarded: 0 (never pays twice).
    const result = finishFocusSession(body.sessionId, { actualMinutes: body.actualMinutes })
    sendJson(res, 200, { ok: true, session: result.session, xpAwarded: result.xpAwarded })
  } catch (err) {
    repoErrorToApi(err)
  }
}

/** POST /focus/session/abandon {sessionId, actualMinutes?, leaks?} — end as a leak; no XP. */
async function postSessionAbandon(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, abandonSessionSchema)
  try {
    const session = abandonFocusSession(body.sessionId, {
      actualMinutes: body.actualMinutes,
      leaks: body.leaks,
    })
    sendJson(res, 200, { ok: true, session })
  } catch (err) {
    repoErrorToApi(err)
  }
}

/** POST /focus/max {minutes?, allowlistId?, extraDomains?, extraApps?, task?} — commitment lock. */
async function postMaxFocusStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Core's canonical maxFocusStartSchema (minutes 10–240, default 25) — the
  // exact schema the web /api/focus/max POST validates with.
  const body = await readJson(req, maxFocusStartSchema)
  try {
    // Atomic start with frozen allowlist snapshot; a still-open session → 409.
    const result = startMaxFocusSession(body)
    sendJson(res, 201, { ok: true, session: result.session, lock: result.lock })
  } catch (err) {
    repoErrorToApi(err)
  }
}

/** POST /focus/max/exit {action:'request'|'confirm'|'cancel', reflection?} — early-exit gate. */
async function postMaxFocusExit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // request arms the mandatory 60s cooldown; confirm requires a ≥20-char
  // reflection (schema-enforced) and logs a friction event; cancel logs a
  // resistance win. All errors (no active Max session, cooldown active) → 400.
  const body = await readJson(req, focusExitActionSchema)
  try {
    if (body.action === 'request') {
      sendJson(res, 200, { ok: true, lock: requestMaxFocusEarlyExit().lock })
      return
    }
    if (body.action === 'confirm') {
      const result = confirmMaxFocusEarlyExit(body.reflection)
      sendJson(res, 200, { ok: true, session: result.session, lock: result.lock })
      return
    }
    sendJson(res, 200, { ok: true, lock: cancelMaxFocusEarlyExit().lock })
  } catch (err) {
    repoErrorToApi(err)
  }
}

/** GET /focus/distractions — the distraction apps/sites friction list. */
async function listDistractions(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, { ok: true, apps: listDistractionApps() })
}

/** POST /focus/distractions {name, kind?} — add to the blocklist (duplicate name → 409). */
async function postDistraction(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, distractionAppSchema)
  const app = createDistractionApp({ name: body.name, kind: body.kind })
  if (!app) {
    jsonError(res, 409, `Distraction "${body.name}" already exists`)
    return
  }
  sendJson(res, 201, { ok: true, app })
}

// ── Route table ─────────────────────────────────────────────────────────────

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const focusRoutes: Route[] = [
  {
    method: 'GET',
    path: '/focus/today',
    summary: 'running session, recent sessions, 24h completed minutes (?limit=)',
    handler: focusToday,
  },
  {
    method: 'GET',
    path: '/focus/insights',
    summary: 'completed focus minutes + friction by trigger (?days=)',
    handler: focusInsights,
  },
  {
    method: 'GET',
    path: '/focus/lock',
    summary: 'current max/standard focus lock state',
    handler: focusLock,
  },
  {
    method: 'POST',
    path: '/focus/session/start',
    summary: 'start a standard focus session',
    handler: postSessionStart,
  },
  {
    method: 'POST',
    path: '/focus/session/complete',
    summary: 'complete a session (canonical XP + streak activity)',
    handler: postSessionComplete,
  },
  {
    method: 'POST',
    path: '/focus/session/abandon',
    summary: 'abandon a session as a leak (no XP)',
    handler: postSessionAbandon,
  },
  {
    method: 'POST',
    path: '/focus/max',
    summary: 'start a max focus commitment lock (409 when one is running)',
    handler: postMaxFocusStart,
  },
  {
    method: 'POST',
    path: '/focus/max/exit',
    summary: 'request/confirm/cancel max early exit (60s reflection cooldown)',
    handler: postMaxFocusExit,
  },
  {
    method: 'GET',
    path: '/focus/distractions',
    summary: 'distraction apps/sites blocklist',
    handler: listDistractions,
  },
  {
    method: 'POST',
    path: '/focus/distractions',
    summary: 'add an app/site to the distraction blocklist',
    handler: postDistraction,
  },
]
