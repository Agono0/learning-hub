/**
 * Learning HUB headless server — HABITS routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 *
 * Every handler delegates to the shared habits repo (packages/db repos/habits)
 * — the same definitions the web app, MCP and CLI call — so check-in XP
 * (source 'habit') and streak activity go through the canonical paths
 * (AGENTS.md rule 7) and cannot drift per host.
 */
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { checkinHabit, createHabit, db, getHabit, habitLogs, listHabits } from '@learning-hub/db'
import { dayKey, eventBus, validateHabit } from '@learning-hub/core'
import { jsonError, sendJson, readJson, readQuery } from '../http'
import type { Route } from './shared'

const DAY_MS = 86_400_000

// ── Schemas ─────────────────────────────────────────────────────────────────

/** GET /habits?all=1&tzOffset=N — all=1 includes archived habits; tz shifts the day key. */
const habitsQuerySchema = z.object({
  all: z.coerce.number().int().optional(),
  tzOffset: z.coerce.number().int().min(-720).max(840).optional(),
})

/** Habit creation (Atomic Habits 4-law loop; cue + response required via validateHabit). */
const createHabitSchema = z.object({
  name: z.string().optional(),
  cue: z.string().optional(),
  cueType: z.string().optional(),
  craving: z.string().optional(),
  response: z.string().optional(),
  reward: z.string().optional(),
  anchor: z.string().optional(),
})

/**
 * Check-in: idempotent per (habitId, date); `date` defaults to today in the
 * given tz offset. A repeat check-in never double-pays XP (repo-enforced).
 */
const checkinSchema = z.object({
  habitId: z.number().int().positive(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be a YYYY-MM-DD day key')
    .optional(),
  note: z.string().max(500).optional(),
  tzOffset: z.number().int().min(-720).max(840).optional(),
})

/** GET /habits/history?id=N — one habit's full check-in log. */
const habitHistoryQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ── Handlers ────────────────────────────────────────────────────────────────

/**
 * Current-streak walk over a habit's logged day keys (YYYY-MM-DD): today only
 * counts once logged, otherwise the streak counts back from yesterday. Steps
 * are exact 86_400_000 ms over UTC date strings, so no DST drift. Same math as
 * the MCP habit_list tool — one definition per host.
 */
function currentStreak(logDates: string[], today: string): number {
  const logSet = new Set(logDates)
  let cursor = new Date(today)
  if (!logSet.has(today)) cursor = new Date(cursor.getTime() - DAY_MS)
  let streak = 0
  while (logSet.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor = new Date(cursor.getTime() - DAY_MS)
  }
  return streak
}

/** GET /habits?all=1&tzOffset=N — habits in chain order with streaks, stages, today state. */
async function getHabits(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  // listHabits returns 90-day logDates + Lally solidifying stage per habit and
  // orders the chain (anchored habits first, stackChainOrder).
  const q = readQuery(url, habitsQuerySchema)
  const result = listHabits({ includeArchived: q.all === 1, tzOffset: q.tzOffset })
  sendJson(res, 200, {
    ok: true,
    today: result.today,
    habits: result.habits.map((h) => ({
      id: h.id,
      name: h.name,
      cue: h.cue,
      cueType: h.cueType,
      craving: h.craving,
      response: h.response,
      reward: h.reward,
      anchor: h.anchor,
      currentStreak: currentStreak(h.logDates, result.today),
      todayDone: h.todayDone,
      stage: h.solidifying.stage,
      totalLoggedDays: h.solidifying.days,
      daysToNextStage: h.solidifying.daysToNext,
      archived: h.archived,
    })),
    stageThresholds: result.stageThresholds,
  })
}

/** POST /habits {name?, cue?, cueType?, craving?, response?, reward?, anchor?} — create. */
async function postHabit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, createHabitSchema)
  // present-and-empty clears the field (→ null); name falls back to the cue
  // (web POST /api/habits parity).
  const trimOrNull = (v?: string): string | null => {
    const t = v?.trim()
    return t ? t : null
  }
  const cue = trimOrNull(body.cue)
  const craving = trimOrNull(body.craving)
  const response = trimOrNull(body.response)
  const reward = trimOrNull(body.reward)
  const name = body.name?.trim() || cue || ''
  if (name.length < 2) {
    jsonError(res, 400, 'Name is required.')
    return
  }

  // Core 4-law validation: cue + response block; craving/reward gaps warn only.
  const validation = validateHabit({ cue, craving, response, reward })
  if (!validation.ok) {
    jsonError(res, 400, validation.errors.join(' '), {
      errors: validation.errors,
      warnings: validation.warnings,
    })
    return
  }

  const habit = createHabit({
    name,
    cue,
    cueType: trimOrNull(body.cueType),
    craving,
    response,
    reward,
    anchor: trimOrNull(body.anchor),
  })
  sendJson(res, 201, { ok: true, habit, warnings: validation.warnings })
}

/**
 * POST /habits/check-in {habitId, date?, note?, tzOffset?}
 * → habit_logs row (unique per habit/day) + canonical XP (source 'habit') +
 * streak activity, one transaction inside the repo. Idempotent: a repeat
 * check-in returns 200 with alreadyDone: true and does NOT pay XP again.
 * `habit.checked` is emitted only after the commit, so webhook listeners see
 * durable state (web POST /api/habits/checkin parity).
 */
async function postHabitCheckin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, checkinSchema)
  const date = body.date ?? dayKey(new Date(), body.tzOffset ?? 0)

  const result = checkinHabit({ habitId: body.habitId, date, note: body.note ?? null })
  if (result.notFound) {
    jsonError(res, 404, 'Habit not found')
    return
  }
  if (result.alreadyDone) {
    sendJson(res, 200, { ok: true, alreadyDone: true, date: result.date, xpAwarded: 0 })
    return
  }

  // Fact after the commit: the habit was checked off for `result.date`.
  eventBus.emit('habit.checked', { habitId: body.habitId })
  sendJson(res, 201, {
    ok: true,
    alreadyDone: false,
    date: result.date,
    xpAwarded: result.xpAwarded,
  })
}

/**
 * GET /habits/history?id=N — one habit's full check-in log (heatmap data).
 * GET /habits caps logDates at 90 days; this read returns every logged day.
 */
async function getHabitHistory(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, habitHistoryQuerySchema)
  const habit = getHabit(q.id)
  if (!habit) {
    jsonError(res, 404, `Habit #${q.id} not found`)
    return
  }
  const logs = await db
    .select()
    .from(habitLogs)
    .where(eq(habitLogs.habitId, q.id))
    .orderBy(asc(habitLogs.date))
  sendJson(res, 200, { ok: true, habit: { id: habit.id, name: habit.name }, logs })
}

// ── Route table ─────────────────────────────────────────────────────────────

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const habitsRoutes: Route[] = [
  {
    method: 'GET',
    path: '/habits',
    summary: 'habits with streaks, automaticity stages, today state (?all=1&tzOffset=)',
    handler: getHabits,
  },
  {
    method: 'POST',
    path: '/habits',
    summary: 'create a habit (cue/craving/response/reward loop validated)',
    handler: postHabit,
  },
  {
    method: 'POST',
    path: '/habits/check-in',
    summary: 'idempotent daily check-in (canonical XP + streak activity)',
    handler: postHabitCheckin,
  },
  {
    method: 'GET',
    path: '/habits/history',
    summary: 'full check-in log for one habit (?id=)',
    handler: getHabitHistory,
  },
]
