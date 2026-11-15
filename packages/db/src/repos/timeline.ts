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

/** `snake_case_id` → `snake case id` (all underscores, not just the first). */
export function humanize(code: string): string {
  return code.replace(/_+/g, ' ').trim()
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
    // Focus XP is folded into the focus_sessions entry below (one row per session, not two).
    const xp = db.all<{ at: string; source: string; amount: number }>(
      sql`SELECT created_at AS at, source, amount FROM xp_events WHERE created_at >= ${since} AND source != 'focus' ORDER BY created_at DESC LIMIT 200`,
    )
    for (const r of xp) {
      const label =
        r.source === 'review'
          ? 'Review completed'
          : r.source === 'achievement'
            ? 'Achievement unlocked'
            : r.source === 'habit'
              ? 'Habit checked in'
              : `XP · ${humanize(r.source)}`
      rows.push({
        at: r.at,
        kind: r.source === 'achievement' ? 'achievement' : r.source === 'habit' ? 'habit' : 'xp',
        title: label,
        detail: `${r.amount >= 0 ? '+' : ''}${r.amount} XP`,
      })
    }
  } catch {
    /* table may be empty */
  }

  try {
    // Only finished sessions are facts; a running one has no end time yet.
    const focus = db.all<{
      at: string
      minutes: number
      task: string | null
      completed: number
      xp: number | null
    }>(
      sql`SELECT f.ended_at AS at, coalesce(f.actual_minutes, f.planned_minutes) AS minutes, f.task, f.completed,
            (SELECT sum(x.amount) FROM xp_events x WHERE x.source = 'focus' AND json_extract(x.meta, '$.sessionId') = f.id) AS xp
          FROM focus_sessions f
          WHERE f.ended_at IS NOT NULL AND f.ended_at >= ${since}
          ORDER BY f.ended_at DESC LIMIT 100`,
    )
    for (const r of focus) {
      const parts = [`${Math.round(r.minutes)} min`]
      if (r.task) parts.push(r.task)
      if (r.xp) parts.push(`+${r.xp} XP`)
      rows.push({
        at: r.at,
        kind: 'focus',
        title: r.completed ? 'Focus session completed' : 'Focus session ended',
        detail: parts.join(' · '),
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
        title: `Planted a ${humanize(r.treeType.replace(/^tree_/, ''))}`,
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
        detail: humanize(r.reason),
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
      rows.push({
        at: r.at,
        kind: 'friction',
        title: 'Distraction caught',
        detail: humanize(r.trigger),
      })
    }
  } catch {
    /* ignore */
  }

  rows.sort((a, b) => (a.at < b.at ? 1 : -1))
  return rows.slice(0, limit)
}
