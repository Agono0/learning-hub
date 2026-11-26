/** The context audit: reviews, sessions and goals in, a structured picture out. */
import { attributeReviews } from './attribute'
import {
  CTX_DEFAULTS,
  UNLOGGED,
  round3,
  type CtxGoal,
  type CtxReview,
  type CtxSession,
  type ReviewContext,
} from './cues'
import {
  goalReadiness,
  suggestContext,
  PLAN_LIMITS,
  type ContextSuggestion,
  type GoalReadiness,
} from './plan'
import { normalizedEntropy, rateBy, type GroupRate } from './stats'
import { cardProfiles, transferGap, type CardContextProfile, type TransferResult } from './transfer'

export interface CtxAuditOptions {
  now?: Date
  windowDays?: number
  tzOffsetMinutes?: number
}

export interface BoundCard extends CardContextProfile {
  suggestion: ContextSuggestion
}

export interface CtxAudit {
  asOf: string
  windowDays: number
  reviews: number
  /** Reviews that fall inside a logged session. */
  attributedShare: number
  truncated: boolean
  byPlace: GroupRate[]
  byBucket: GroupRate[]
  byDayType: GroupRate[]
  byNoise: GroupRate[]
  /** 0 (every review in one context) to 1 (spread evenly). Over all reviews. */
  diversity: number
  cardsProfiled: number
  boundCards: BoundCard[]
  transfer: TransferResult
  goals: GoalReadiness[]
}

export function runContextAudit(
  reviews: CtxReview[],
  sessions: CtxSession[],
  goals: CtxGoal[],
  opts: CtxAuditOptions = {},
): CtxAudit {
  const now = opts.now ?? new Date()
  const windowDays = opts.windowDays ?? CTX_DEFAULTS.windowDays
  const since = now.getTime() - windowDays * 86_400_000
  const inWin = reviews.filter((r) => {
    const t = Date.parse(r.reviewedAt)
    return Number.isFinite(t) && t >= since && t <= now.getTime()
  })
  const truncated = inWin.length > CTX_DEFAULTS.maxReviews
  const scoped = truncated
    ? [...inWin]
        .sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt))
        .slice(0, CTX_DEFAULTS.maxReviews)
    : inWin
  const rows: ReviewContext[] = attributeReviews(scoped, sessions, {
    tzOffsetMinutes: opts.tzOffsetMinutes,
    now,
  })
  const logged = rows.filter((r) => r.place !== UNLOGGED).length

  const joint = new Map<string, number>()
  for (const r of rows)
    joint.set(`${r.place}|${r.bucket}`, (joint.get(`${r.place}|${r.bucket}`) ?? 0) + 1)

  const profiles = cardProfiles(rows)
  const places = [...new Set(sessions.map((s) => s.place))]
  const bound = profiles
    .filter((p) => p.bound)
    .slice(0, PLAN_LIMITS.maxSuggestions)
    .map((p) => ({ ...p, suggestion: suggestContext(p, rows, places) }))

  return {
    asOf: now.toISOString(),
    windowDays,
    reviews: rows.length,
    attributedShare: round3(rows.length ? logged / rows.length : 0),
    truncated,
    byPlace: rateBy(rows, 'place'),
    byBucket: rateBy(rows, 'bucket'),
    byDayType: rateBy(rows, 'dayType'),
    byNoise: rateBy(rows, 'noise'),
    diversity: normalizedEntropy([...joint.values()]),
    cardsProfiled: profiles.length,
    boundCards: bound,
    transfer: transferGap(rows),
    goals: goals.map((g) => goalReadiness(g, rows)),
  }
}
