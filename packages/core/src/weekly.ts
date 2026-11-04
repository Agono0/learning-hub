/**
 * Weekly review report — pure math over plain query rows. No DB imports: the
 * server hands the raw rows in (revlog, xp_events, focus_sessions, cards,
 * streaks), and this module buckets every timestamped row by the user's LOCAL
 * day via {@link dayKey}(date, offsetMinutes) — the same tz convention every
 * other day-bucketed surface uses (`Date#getTimezoneOffset()` semantics:
 * minutes to ADD to local time to get UTC, negative east of UTC).
 *
 * Everything is deterministic for a given `(raw, today, now)` — the report is
 * testable without a database and the AI layer only sees finished numbers.
 */
import { z } from 'zod'
import { dayKey } from './streaks'
import { calculateRetrievability } from './fsrs'

const DAY_MS = 86_400_000

// ─── Raw row shapes (as they come from drizzle / the views) ─────────────────

/** One revlog row feeding the report (subset of columns actually used). */
export interface WeeklyReviewRow {
  cardId?: number | null
  /** 1 Again … 4 Easy (Again counts as not-retained) */
  rating: number
  /** FSRS state BEFORE the review; state >= 2 = a "real" review (v_true_retention rule). Missing → treated as 2. */
  state?: number | null
  /** FSRS predicted retrievability logged at review time (Feature 10), 0..1 — optional */
  retrievability?: number | null
  /** Review duration in ms (reserved for coach metrics) — optional */
  timeMs?: number | null
  /** ISO timestamp of the review */
  reviewedAt: string
}

/** One xp_events row. */
export interface WeeklyXpRow {
  amount: number
  createdAt: string // ISO
}

/** One focus_sessions row (subset). */
export interface WeeklyFocusRow {
  startedAt: string // ISO
  actualMinutes?: number | null
  completed?: boolean | null
}

/** The single-row streaks state (or null on a fresh account). */
export interface WeeklyStreakRow {
  current: number
  best: number
  freezes: number
  weekendAmulet?: boolean | null
  lastActiveDate?: string | null // YYYY-MM-DD
}

/** One cards row feeding the weakest-cards list and the due forecast. */
export interface WeeklyCardRow {
  id: number
  /** Display text (front/question) — derived by the query layer; core stays shape-agnostic. */
  label?: string | null
  due: string // ISO
  lapses?: number | null
  stability?: number | null
  difficulty?: number | null
  reps?: number | null
  state?: number | null
  suspended?: boolean | null
  lastReview?: string | null // ISO
}

/** All raw rows needed for one weekly report. */
export interface WeeklyReportRaw {
  /** Timezone offset in `Date#getTimezoneOffset()` semantics (client sends `new Date().getTimezoneOffset()`); default 0 = UTC. */
  offsetMinutes?: number
  /** Local day that ENDS the window ('YYYY-MM-DD' or Date); default `dayKey(now, offsetMinutes)`. */
  today?: Date | string
  /** Reference instant for "current" retrievability; default `Date.now()`. Pass it for deterministic tests. */
  now?: Date | string
  /** revlog rows overlapping the week (rows outside the window are ignored, so fetch a day wider if in doubt) */
  reviews: WeeklyReviewRow[]
  xpEvents: WeeklyXpRow[]
  focusSessions: WeeklyFocusRow[]
  streak?: WeeklyStreakRow | null
  /** Cards to rank (weakest) and bucket (due forecast); suspended cards are skipped. */
  cards: WeeklyCardRow[]
  /** Max weakest cards returned (default 5). */
  weakestLimit?: number
}

// ─── Output shapes ──────────────────────────────────────────────────────────

/** One local day of the window (exactly 7 rows, zero-filled, weekStart..weekEnd). */
export interface WeeklyDayRow {
  date: string // YYYY-MM-DD
  reviews: number
  correct: number // rating > 1
  xp: number
  focusMinutes: number
}

/** Week-scoped true retention, using the v_true_retention rule (state >= 2 rows only). */
export interface WeeklyTrueRetention {
  /** qualifying "real" reviews in the window (state >= 2) */
  total: number
  /** of those, rated Hard/Good/Easy */
  retained: number
  /** retained / total, 0..1 — null when there were no qualifying reviews */
  rate: number | null
  /** rate * 100 rounded to 1 decimal — null without data */
  pct: number | null
}

/** Streak health snapshot: stored state + week-activity context. */
export interface WeeklyStreakHealth {
  current: number
  best: number
  freezes: number
  weekendAmulet: boolean
  lastActiveDate: string | null
  /** local days in the window with >= 1 review */
  daysActive: number
  /** 7 - daysActive */
  daysMissed: number
  /** current streak > 0 but nothing reviewed on the window's last local day — it dies at local midnight */
  atRisk: boolean
}

/** One weakest card (lowest retrievability first, most lapses as tie-break). */
export interface WeakCard {
  id: number
  label: string
  /** Current predicted recall 0..1 (FSRS-6 curve at `now`); null when the card has no review history. */
  retrievability: number | null
  lapses: number
  difficulty: number | null
  due: string // ISO
}

/** Cards due on one of the next 7 local days (overdue cards fold into today). */
export interface WeeklyForecastBucket {
  date: string // YYYY-MM-DD
  count: number
}

/** Predicted vs actual over the week's reviews that logged a retrievability prediction. */
export interface WeeklyCalibration {
  /** scored reviews (prediction logged and within 0.5..1) */
  n: number
  predictedAvg: number | null
  /** mean actual outcome of the same rows (1 = retained) */
  actualAvg: number | null
  /** predictedAvg - actualAvg; positive = overconfident (model promised more than happened) */
  delta: number | null
}

/** The full weekly report — every number the review page and the coach need. */
export interface WeeklyReportMetrics {
  /** first local day of the 7-day window */
  weekStart: string
  /** last local day (the `today` passed in, default the current local day) */
  weekEnd: string
  offsetMinutes: number
  /** exactly 7 rows, zero-filled */
  days: WeeklyDayRow[]
  totals: { reviews: number; correct: number; xp: number; focusMinutes: number }
  trueRetention: WeeklyTrueRetention
  streak: WeeklyStreakHealth
  weakestCards: WeakCard[]
  forecast: WeeklyForecastBucket[]
  /** cards due within the window (sum of forecast counts) */
  upcomingTotal: number
  calibration: WeeklyCalibration
  /** Flat key:value record ready for `coachPrompt()` (COACH_SYSTEM). */
  coachMetrics: Record<string, number | string | null>
}

/** One coach suggestion — evidence must cite a number (COACH_SYSTEM rule). */
export interface WeeklySuggestion {
  title: string
  evidence: string
  action: string
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function localDayKeys(weekEnd: string): string[] {
  const endMs = Date.parse(weekEnd + 'T00:00:00Z')
  const keys: string[] = []
  for (let i = -6; i <= 0; i++) keys.push(dayKey(new Date(endMs + i * DAY_MS)))
  return keys
}

function parseMs(iso: string | undefined | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

// ─── Report ─────────────────────────────────────────────────────────────────

/**
 * Build the full weekly report from raw rows. The window is the 7 LOCAL days
 * ending at `raw.today` (default: the current local day given `offsetMinutes`).
 * Rows are bucketed by `dayKey(timestamp, offsetMinutes)`; rows outside the
 * window are ignored, so callers may fetch a slightly wider range and let this
 * function scope it.
 */
export function computeWeeklyReportMetrics(raw: WeeklyReportRaw): WeeklyReportMetrics {
  const offsetMinutes = Number.isFinite(raw.offsetMinutes) ? (raw.offsetMinutes as number) : 0

  const weekEnd =
    raw.today == null
      ? dayKey(new Date(), offsetMinutes)
      : typeof raw.today === 'string'
        ? raw.today.slice(0, 10)
        : dayKey(raw.today, offsetMinutes)
  const keys = localDayKeys(weekEnd)
  const startMs = Date.parse(keys[0]! + 'T00:00:00Z')
  const slotOf = (iso: string): number | null => {
    const ms = parseMs(iso)
    if (ms == null) return null
    const slot = Math.round((Date.parse(dayKey(new Date(ms), offsetMinutes) + 'T00:00:00Z') - startMs) / DAY_MS)
    return slot >= 0 && slot < 7 ? slot : null
  }

  // reviews per local day + week-scoped true retention (state >= 2 = real review)
  const days: WeeklyDayRow[] = keys.map((date) => ({ date, reviews: 0, correct: 0, xp: 0, focusMinutes: 0 }))
  let retentionTotal = 0
  let retentionRetained = 0
  for (const r of raw.reviews) {
    const slot = slotOf(r.reviewedAt)
    if (slot == null) continue
    const retained = r.rating > 1
    days[slot]!.reviews += 1
    if (retained) days[slot]!.correct += 1
    if ((r.state ?? 2) >= 2) {
      retentionTotal += 1
      if (retained) retentionRetained += 1
    }
  }

  // XP per local day
  for (const e of raw.xpEvents) {
    const slot = slotOf(e.createdAt)
    if (slot == null) continue
    days[slot]!.xp += Math.max(0, e.amount)
  }

  // focus minutes per local day (completed sessions only)
  for (const s of raw.focusSessions) {
    if (s.completed !== true) continue
    const slot = slotOf(s.startedAt)
    if (slot == null) continue
    days[slot]!.focusMinutes += Math.max(0, s.actualMinutes ?? 0)
  }

  const totals = days.reduce(
    (acc, d) => ({
      reviews: acc.reviews + d.reviews,
      correct: acc.correct + d.correct,
      xp: acc.xp + d.xp,
      focusMinutes: acc.focusMinutes + d.focusMinutes,
    }),
    { reviews: 0, correct: 0, xp: 0, focusMinutes: 0 },
  )

  const rate = retentionTotal === 0 ? null : retentionRetained / retentionTotal
  const trueRetention: WeeklyTrueRetention = {
    total: retentionTotal,
    retained: retentionRetained,
    rate,
    pct: rate == null ? null : round1(rate * 100),
  }

  // streak health: stored row + week context
  const s = raw.streak
  const daysActive = days.filter((d) => d.reviews > 0).length
  const lastActiveDate = s?.lastActiveDate ?? null
  const streak: WeeklyStreakHealth = {
    current: s?.current ?? 0,
    best: s?.best ?? 0,
    freezes: s?.freezes ?? 0,
    weekendAmulet: s?.weekendAmulet === true,
    lastActiveDate,
    daysActive,
    daysMissed: 7 - daysActive,
    atRisk: (s?.current ?? 0) > 0 && (lastActiveDate == null || lastActiveDate < weekEnd),
  }

  // weakest cards: current retrievability ascending, lapses as tie-break
  const nowMs = raw.now == null ? Date.now() : (typeof raw.now === 'string' ? Date.parse(raw.now) : raw.now.getTime())
  const limit = Math.max(1, Math.floor(raw.weakestLimit ?? 5))
  const ranked: WeakCard[] = []
  for (const c of raw.cards) {
    if (c.suspended) continue
    const lastReviewMs = parseMs(c.lastReview)
    const history = (c.reps ?? 0) > 0 || lastReviewMs != null
    if (!history) continue // brand-new cards have no memory strength to measure
    const stability = c.stability ?? 0
    const elapsedDays = lastReviewMs == null ? 0 : Math.max(0, (nowMs - lastReviewMs) / DAY_MS)
    const retrievability = stability > 0 && lastReviewMs != null ? calculateRetrievability(stability, elapsedDays) : null
    ranked.push({
      id: c.id,
      label: c.label ?? '',
      retrievability,
      lapses: c.lapses ?? 0,
      difficulty: c.difficulty ?? null,
      due: c.due,
    })
  }
  ranked.sort((a, b) => {
    const ra = a.retrievability ?? 1
    const rb = b.retrievability ?? 1
    if (ra !== rb) return ra - rb
    if (a.lapses !== b.lapses) return b.lapses - a.lapses
    const da = a.difficulty ?? 0
    const db = b.difficulty ?? 0
    if (da !== db) return db - da
    return a.id - b.id
  })
  const weakestCards = ranked.slice(0, limit)

  // upcoming load: cards due on each of the NEXT 7 local days (today..+6; overdue folds into today)
  const endMs = Date.parse(weekEnd + 'T00:00:00Z')
  const forecast: WeeklyForecastBucket[] = []
  for (let i = 0; i < 7; i++) forecast.push({ date: dayKey(new Date(endMs + i * DAY_MS)), count: 0 })
  for (const c of raw.cards) {
    if (c.suspended) continue
    const dueMs = parseMs(c.due)
    if (dueMs == null) continue // unparseable dues are a data bug — excluded from the window
    const dueKey = dayKey(new Date(dueMs), offsetMinutes)
    let slot = forecast.findIndex((f) => f.date === dueKey)
    if (slot < 0) slot = dueKey < weekEnd ? 0 : -1 // overdue (before the local today) → today's bucket
    if (slot >= 0) forecast[slot]!.count += 1
  }
  const upcomingTotal = forecast.reduce((a, f) => a + f.count, 0)

  // calibration: predicted vs actual over rows that logged a prediction (0.5..1, same rule as calibrationCurve)
  let calN = 0
  let calPredicted = 0
  let calActual = 0
  for (const r of raw.reviews) {
    if (slotOf(r.reviewedAt) == null) continue
    const p = r.retrievability
    if (p == null || !Number.isFinite(p) || p < 0.5 || p > 1) continue
    calN += 1
    calPredicted += p
    calActual += r.rating > 1 ? 1 : 0
  }
  const predictedAvg = calN === 0 ? null : calPredicted / calN
  const actualAvg = calN === 0 ? null : calActual / calN
  const calibration: WeeklyCalibration = {
    n: calN,
    predictedAvg,
    actualAvg,
    delta: calN === 0 ? null : (calPredicted - calActual) / calN,
  }

  const coachMetrics: Record<string, number | string | null> = {
    reviews: totals.reviews,
    trueRetentionPct: trueRetention.pct,
    focusMinutes: totals.focusMinutes,
    xp: totals.xp,
    streakCurrent: streak.current,
    streakBest: streak.best,
    streakFreezes: streak.freezes,
    daysActiveThisWeek: streak.daysActive,
    daysMissedThisWeek: streak.daysMissed,
    streakAtRiskToday: streak.atRisk ? 'yes' : 'no',
    weakestCard: weakestCards[0]
      ? `${weakestCards[0].label || `card #${weakestCards[0].id}`} — retrievability ${
          weakestCards[0].retrievability == null ? 'n/a' : `${round1(weakestCards[0].retrievability * 100)}%`
        }, ${weakestCards[0].lapses} lapse(s)`
      : null,
    cardsDueNext7Days: upcomingTotal,
    calibrationDeltaPct: calibration.delta == null ? null : round1(calibration.delta * 100),
  }

  return {
    weekStart: keys[0]!,
    weekEnd,
    offsetMinutes,
    days,
    totals,
    trueRetention,
    streak,
    weakestCards,
    forecast,
    upcomingTotal,
    calibration,
    coachMetrics,
  }
}

// ─── Deterministic (manual-mode) suggestions ────────────────────────────────

/**
 * Rule-based coach suggestions, used when no AI provider is configured
 * ('none'). Follows the same contract as the COACH_SYSTEM prompt: exactly 3
 * suggestions, each citing a specific number from the metrics — no generic
 * advice. Ordered by severity (streak at risk → quality → workload).
 */
export function ruleBasedSuggestions(m: WeeklyReportMetrics): WeeklySuggestion[] {
  const pctStr = (x: number | null | undefined): string =>
    x == null ? 'no data' : `${round1(x * 100)}%`
  const out: WeeklySuggestion[] = []

  if (m.streak.atRisk) {
    out.push({
      title: 'Protect your streak — one card is enough',
      evidence: `streak at ${m.streak.current} day(s), last active ${m.streak.lastActiveDate ?? 'unknown'}, and 0 reviews today (${m.weekEnd}).`,
      action: 'Do at least one card review before your local midnight — an emergency 1-card review keeps the chain alive.',
    })
  }
  if (m.totals.reviews === 0) {
    out.push({
      title: 'Rebuild the habit small',
      evidence: `0 reviews and ${m.totals.xp} XP logged across the whole week (${m.weekStart} … ${m.weekEnd}).`,
      action: 'Start with a single 5-minute session today: clear the smallest deck due queue and stop there.',
    })
  }
  if (m.trueRetention.rate != null && m.trueRetention.rate < 0.9) {
    out.push({
      title: 'Quality before volume',
      evidence: `true retention is ${m.trueRetention.pct}% over ${m.trueRetention.total} mature review(s) — below the 90% target.`,
      action: 'Pause new cards for a few days and relearn the lapses first; accuracy recovers, then volume returns.',
    })
  }
  if (m.weakestCards.length > 0 && m.weakestCards[0]) {
    const w = m.weakestCards[0]
    const weak = (w.retrievability != null && w.retrievability < 0.9) || w.lapses >= 3
    if (weak) {
      out.push({
        title: 'Drill your leakiest cards',
        evidence: `"${w.label || `card #${w.id}`}" sits at ${pctStr(w.retrievability)} retrievability with ${w.lapses} lapse(s) — ${m.weakestCards.length} weak card(s) found.`,
        action: 'Relearn the 3 weakest cards today and rewrite the memory hook (a sharper image or example) for each one.',
      })
    }
  }
  if (m.totals.focusMinutes < 120) {
    const missing = Math.ceil((120 - m.totals.focusMinutes) / 25)
    out.push({
      title: 'Protect deep-work blocks',
      evidence: `${m.totals.focusMinutes} completed focus minute(s) this week vs the 120-minute target.`,
      action: `Book ${missing} pomodoro(s) next week on fixed calendar slots — start with one tomorrow morning.`,
    })
  }
  if (m.calibration.n >= 5 && m.calibration.delta != null && m.calibration.delta > 0.05) {
    const predicted = m.calibration.predictedAvg
    const actual = m.calibration.actualAvg
    const delta = m.calibration.delta
    if (predicted != null && actual != null) {
      out.push({
        title: 'Recalibrate your confidence',
        evidence: `the scheduler predicted ${pctStr(predicted)} recall but you kept ${pctStr(actual)} across ${m.calibration.n} scored review(s) (overconfidence +${round1(delta * 100)}pts).`,
        action: 'Grade honestly — press Again the moment recall wobbles, and treat Easy as earned only after clean recalls.',
      })
    }
  }
  if (m.calibration.n >= 5 && m.calibration.delta != null && m.calibration.delta < -0.05) {
    const predicted = m.calibration.predictedAvg
    const actual = m.calibration.actualAvg
    if (predicted != null && actual != null) {
      out.push({
        title: 'Trust your memory (it beats the model)',
        evidence: `the scheduler predicted ${pctStr(predicted)} recall but you kept ${pctStr(actual)} across ${m.calibration.n} scored review(s).`,
        action: 'Lower desired retention toward 0.85 in Settings to cut review volume — your actual recall is comfortably above the model.',
      })
    }
  }
  if (m.upcomingTotal >= 100) {
    const peak = m.forecast.reduce((a, b) => (b.count > a.count ? b : a), m.forecast[0]!)
    out.push({
      title: 'Heavy week ahead — spread it',
      evidence: `${m.upcomingTotal} cards due in the next 7 days, peaking at ${peak.count} on ${peak.date}.`,
      action: 'Cap new cards this week and split the due queue into two shorter daily sessions.',
    })
  }
  if (m.trueRetention.rate != null && m.trueRetention.rate >= 0.9 && m.totals.reviews >= 50) {
    out.push({
      title: 'Keep doing exactly this',
      evidence: `${m.trueRetention.pct}% true retention on ${m.totals.reviews} review(s) is at or above target.`,
      action: 'Same schedule next week — protect the daily review block before adding anything new.',
    })
  }
  if (m.totals.focusMinutes >= 120) {
    out.push({
      title: 'Keep doing the deep work',
      evidence: `${m.totals.focusMinutes} completed focus minute(s) this week — target met.`,
      action: 'Keep the block and open each session with the same 2-minute warm-up ritual.',
    })
  }
  // fillers (cited, not generic) — the coach contract is exactly 3, so the
  // filler list must always be able to fill the gap from any state
  const fillers: WeeklySuggestion[] = [
    ...(m.streak.daysActive >= 4
      ? [
          {
            title: 'Consistency is the win',
            evidence: `${m.streak.daysActive}/7 local day(s) active, ${m.streak.daysMissed} missed.`,
            action: 'Keep the cadence; only add a new deck after two more stable weeks.',
          },
        ]
      : []),
    {
      title: 'Plan the review block',
      evidence: `${m.totals.reviews} review(s) and ${m.totals.xp} XP this week; ${m.upcomingTotal} card(s) already due in the next 7 days.`,
      action: 'Put three fixed review slots in next week’s calendar and let the scheduler’s due queue decide the size.',
    },
    {
      title: 'Clear the backlog before adding anything',
      evidence: `${m.upcomingTotal} card(s) due in the next 7 days; ${m.streak.freezes} streak freeze(s) banked.`,
      action: 'Work only the due queue next week — no new cards until the backlog is under half this size.',
    },
    {
      title: 'Bank the wins where you can see them',
      evidence: `${m.totals.xp} XP earned across ${m.streak.daysActive} active day(s) this week.`,
      action: 'Write one journal sentence per active day naming what made it work — visible wins drive the next week.',
    },
  ]
  for (const f of fillers) {
    if (out.length >= 3) break
    if (!out.some((o) => o.title === f.title)) out.push(f)
  }
  return out.slice(0, 3)
}

// ─── Wire schemas (the API route validates its response with these) ─────────

const dayKeyRegex = /^\d{4}-\d{2}-\d{2}$/

/** One coach suggestion as it travels over the wire. */
export const weeklySuggestionSchema = z.object({
  title: z.string().min(1),
  evidence: z.string().min(1),
  action: z.string().min(1),
})

const weakCardSchema = z.object({
  id: z.number(),
  label: z.string(),
  retrievability: z.number().nullable(),
  lapses: z.number().int(),
  difficulty: z.number().nullable(),
  due: z.string(),
})

const forecastBucketSchema = z.object({ date: z.string().regex(dayKeyRegex), count: z.number().int() })

/** The weekly metrics block of the API response. */
export const weeklyMetricsSchema = z.object({
  weekStart: z.string().regex(dayKeyRegex),
  weekEnd: z.string().regex(dayKeyRegex),
  offsetMinutes: z.number(),
  days: z
    .array(
      z.object({
        date: z.string().regex(dayKeyRegex),
        reviews: z.number().int(),
        correct: z.number().int(),
        xp: z.number(),
        focusMinutes: z.number(),
      }),
    )
    .length(7),
  totals: z.object({
    reviews: z.number().int(),
    correct: z.number().int(),
    xp: z.number(),
    focusMinutes: z.number(),
  }),
  trueRetention: z.object({
    total: z.number().int(),
    retained: z.number().int(),
    rate: z.number().min(0).max(1).nullable(),
    pct: z.number().min(0).max(100).nullable(),
  }),
  streak: z.object({
    current: z.number().int(),
    best: z.number().int(),
    freezes: z.number().int(),
    weekendAmulet: z.boolean(),
    lastActiveDate: z.string().regex(dayKeyRegex).nullable(),
    daysActive: z.number().int(),
    daysMissed: z.number().int(),
    atRisk: z.boolean(),
  }),
  weakestCards: z.array(weakCardSchema),
  forecast: z.array(forecastBucketSchema).length(7),
  upcomingTotal: z.number().int(),
  calibration: z.object({
    n: z.number().int(),
    predictedAvg: z.number().min(0).max(1).nullable(),
    actualAvg: z.number().min(0).max(1).nullable(),
    delta: z.number().nullable(),
  }),
  coachMetrics: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
})

/** The prompt-transport envelope (mirrors core/ai AIEnvelope, kept local so weekly stays decoupled from the AI module). */
export const weeklyEnvelopeSchema = z.object({
  v: z.number(),
  feature: z.string().min(1),
  system: z.string(),
  prompt: z.string(),
  schema: z.string().optional(),
})

/** Full GET /api/weekly response, validated at the boundary before returning. */
export const weeklyReportResponseSchema = z.object({
  metrics: weeklyMetricsSchema,
  weakestCards: z.array(weakCardSchema),
  forecast: z.array(forecastBucketSchema),
  suggestions: z.object({
    mode: z.enum(['ai', 'manual']),
    suggestions: z.array(weeklySuggestionSchema).length(3),
    /** Present whenever the suggestions are rule-based — paste into any chatbot, POST the reply to /api/ai/transport. */
    envelope: weeklyEnvelopeSchema.optional(),
    /** Set when a configured provider failed and the manual summary took over. */
    error: z.string().optional(),
  }),
})
