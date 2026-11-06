/**
 * Activity timeline — one merged, read-only stream over the append-only
 * ledgers (xp_events, revlog, friction_events, forest_plots,
 * study_coin_ledger) plus focus sessions. No new writes: the timeline is a
 * query over facts that already exist, which keeps it honest and free.
 */
import { sql } from 'drizzle-orm'
import { getDb } from '../index'

export interface TimelineEntry {
  /** ISO timestamp of the underlying fact. */
  at: string
  kind: 'review' | 'xp' | 'focus' | 'tree' | 'coin' | 'friction' | 'achievement' | 'goal' | 'habit'
  title: string
  detail: string | null
}

interface RawRow {
  at: string
  kind: TimelineEntry['kind']
  title: string
  detail: string | null
}

/** The last `days` days of activity, newest first, capped at `limit`. */
export function getActivityTimeline(days = 14, limit = 60): TimelineEntry[] {
  const db = getDb()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const rows: RawRow[] = []

  try {
    const xp = db.all<{
      at: string
      source: string
      amount: number
      meta: Record<string, unknown> | null
    }>(
      sql`SELECT created_at AS at, source, amount, meta FROM xp_events WHERE created_at >= ${since} ORDER BY created_at DESC LIMIT 200`,
    )
    for (const r of xp) {
      const label =
        r.source === 'review'
          ? 'Review completed'
          : r.source === 'achievement'
            ? 'Achievement unlocked'
            : r.source === 'habit'
              ? 'Habit checked in'
              : r.source === 'focus'
                ? 'Focus session'
                : `XP · ${r.source}`
      rows.push({
        at: r.at,
        kind:
          r.source === 'achievement'
            ? 'achievement'
            : r.source === 'habit'
              ? 'habit'
              : r.source === 'focus'
                ? 'focus'
                : 'xp',
        title: label,
        detail: `${r.amount >= 0 ? '+' : ''}${r.amount} XP`,
      })
    }
  } catch {
    /* table may be empty */
  }

  try {
    const focus = db.all<{ at: string; minutes: number; task: string | null; completed: number }>(
      sql`SELECT ended_at AS at, coalesce(actual_minutes, planned_minutes) AS minutes, task, completed FROM focus_sessions WHERE coalesce(ended_at, started_at) >= ${since} ORDER BY coalesce(ended_at, started_at) DESC LIMIT 100`,
    )
    for (const r of focus) {
      rows.push({
        at: r.at,
        kind: 'focus',
        title: r.completed ? 'Focus session completed' : 'Focus session ended',
        detail: `${Math.round(r.minutes)} min${r.task ? ` · ${r.task}` : ''}`,
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const trees = db.all<{ at: string; treeType: string; durationMinutes: number }>(
      sql`SELECT created_at AS at, tree_type AS treeType, duration_minutes AS durationMinutes FROM forest_plots WHERE created_at >= ${since} ORDER BY created_at DESC LIMIT 50`,
    )
    for (const r of trees) {
      rows.push({
        at: r.at,
        kind: 'tree',
        title: `Planted a ${r.treeType.replace('tree_', '').replace('_', ' ')}`,
        detail: `${r.durationMinutes} min of verified focus`,
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const coins = db.all<{ at: string; amount: number; reason: string }>(
      sql`SELECT created_at AS at, amount, reason FROM study_coin_ledger WHERE created_at >= ${since} AND reason != 'welcome_bonus' ORDER BY created_at DESC LIMIT 100`,
    )
    for (const r of coins) {
      rows.push({
        at: r.at,
        kind: 'coin',
        title: r.amount >= 0 ? `+${r.amount} study coins` : `${r.amount} study coins`,
        detail: r.reason.replace('_', ' '),
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const friction = db.all<{ at: string; trigger: string }>(
      sql`SELECT created_at AS at, trigger FROM friction_events WHERE created_at >= ${since} ORDER BY created_at DESC LIMIT 50`,
    )
    for (const r of friction) {
      rows.push({ at: r.at, kind: 'friction', title: 'Distraction caught', detail: r.trigger })
    }
  } catch {
    /* ignore */
  }

  rows.sort((a, b) => (a.at < b.at ? 1 : -1))
  return rows.slice(0, limit)
}
