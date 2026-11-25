/**
 * Input validation for public worker endpoints. Invalid input is refused with a message,
 * never silently clamped. Numeric bounds are generous sanity limits (assumptions, not measured
 * from real clients) that only stop absurd values from reaching the leaderboard.
 */
import { filterContentSafety } from '@learning-hub/core/online'

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
export const STATS_LIMITS = {
  weeklyXp: 1_000_000,
  streak: 36_500,
  level: 10_000,
  alias: 40,
} as const

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string }

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

export interface StatsSync {
  userId: string
  alias: string
  weeklyXp: number
  streak: number
  level: number
}

export function parseStatsSync(raw: unknown): Validated<StatsSync> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, error: 'Invalid body' }
  const b = raw as Record<string, unknown>
  if (typeof b.userId !== 'string' || !ID_PATTERN.test(b.userId))
    return { ok: false, error: 'userId must be 1-64 letters, digits, - or _' }
  if (typeof b.alias !== 'string' || b.alias.trim().length === 0 || b.alias.length > 200)
    return { ok: false, error: 'alias required (max 40 characters)' }
  const weeklyXp = intIn(b.weeklyXp, 0, STATS_LIMITS.weeklyXp)
  const streak = intIn(b.streak, 0, STATS_LIMITS.streak)
  const level = intIn(b.level, 1, STATS_LIMITS.level)
  if (weeklyXp === null) return { ok: false, error: 'weeklyXp must be an integer 0-1000000' }
  if (streak === null) return { ok: false, error: 'streak must be an integer 0-36500' }
  if (level === null) return { ok: false, error: 'level must be an integer 1-10000' }
  const { clean } = filterContentSafety(b.alias.trim().slice(0, STATS_LIMITS.alias))
  return { ok: true, value: { userId: b.userId, alias: clean, weeklyXp, streak, level } }
}

export const WS_MAX_MESSAGE_CHARS = 4096
export const ROOM_MAX_PARTICIPANTS = 50
const STATUSES = ['studying', 'break', 'away']

export interface JoinParticipant {
  id: string
  alias: string
  avatar?: string
  status: string
  streak: number
  cardsReviewed: number
}

export function parseJoinParticipant(raw: unknown): Validated<JoinParticipant> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, error: 'participant' }
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string' || !ID_PATTERN.test(p.id)) return { ok: false, error: 'id' }
  if (typeof p.alias !== 'string' || p.alias.trim().length === 0 || p.alias.length > 200)
    return { ok: false, error: 'alias' }
  if (p.avatar !== undefined && (typeof p.avatar !== 'string' || p.avatar.length > 16))
    return { ok: false, error: 'avatar' }
  const status = p.status === undefined ? 'studying' : p.status
  if (typeof status !== 'string' || !STATUSES.includes(status))
    return { ok: false, error: 'status' }
  const streak = p.streak === undefined ? 0 : intIn(p.streak, 0, STATS_LIMITS.streak)
  const cards = p.cardsReviewed === undefined ? 0 : intIn(p.cardsReviewed, 0, 1_000_000)
  if (streak === null || cards === null) return { ok: false, error: 'numbers' }
  const { clean } = filterContentSafety(p.alias.trim().slice(0, STATS_LIMITS.alias))
  return {
    ok: true,
    value: {
      id: p.id,
      alias: clean,
      avatar: p.avatar as string | undefined,
      status,
      streak,
      cardsReviewed: cards,
    },
  }
}
