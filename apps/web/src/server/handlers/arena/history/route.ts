/**
 * /api/arena/history — the arena record book.
 *
 * GET → aggregate stats (runs, win rate, accuracy, best combo/score, totals,
 * current win streak) plus the most recent runs, newest first, plus a
 * per-deck record (a run counts toward every deck it touched) enriched with
 * deck names. Everything is derived from the append-only arena_runs table —
 * no mutable counters that could drift from history.
 */
import { queryLimit } from '@/lib/query-params'
import { inArray } from 'drizzle-orm'
import {
  db,
  decks,
  getArenaStats,
  getArenaStatsByDeck,
  getArenaStatsByGuardian,
  listArenaRuns,
  listArenaRunsForExport,
  type ArenaRunRow,
} from '@learning-hub/db'
import { paceStats } from '@learning-hub/core'
import { withRoute } from '@/lib/api'

// ─── Weekly trial ───────────────────────────────────────────────────────────

/** Monday 00:00 UTC of the week containing `now`, plus its YYYY-Www key. */
function weekStart(now: Date): { start: Date; weekKey: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow)
  // ISO week number: Thursday of this week fixes the week-year.
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + 3)
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return {
    start: d,
    weekKey: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
  }
}

interface WeeklyTrialTemplate {
  key: string
  name: string
  description: string
  target: number
  unit: 'victories' | 'boss_victories' | 'combo'
}

const WEEKLY_TRIALS: WeeklyTrialTemplate[] = [
  {
    key: 'three_wins',
    name: 'Arena Regular',
    description: 'Win 3 arena runs this week.',
    target: 3,
    unit: 'victories',
  },
  {
    key: 'boss_win',
    name: 'Giant Slayer',
    description: 'Win 1 boss run (15+ challenges) this week.',
    target: 1,
    unit: 'boss_victories',
  },
  {
    key: 'combo_12',
    name: 'Flow State',
    description: 'Land a 12-combo in any run this week.',
    target: 12,
    unit: 'combo',
  },
]

/**
 * This week's trial: one deterministic template per ISO week, progress from
 * the week's settled runs. Recognition only — completing a trial changes no
 * economy state; the runs' own reviews already gave their XP.
 */
function weeklyTrial(
  now: Date,
  runs: ArenaRunRow[],
): {
  weekKey: string
  key: string
  name: string
  description: string
  target: number
  progress: number
  done: boolean
} {
  const { start, weekKey } = weekStart(now)
  const startIso = start.toISOString()
  const thisWeek = runs.filter((r) => r.createdAt >= startIso)
  let hash = 0
  for (let i = 0; i < weekKey.length; i++) hash = (hash * 31 + weekKey.charCodeAt(i)) | 0
  const template = WEEKLY_TRIALS[Math.abs(hash) % WEEKLY_TRIALS.length]!
  let progress = 0
  if (template.unit === 'victories') {
    progress = thisWeek.filter((r) => r.result === 'victory').length
  } else if (template.unit === 'boss_victories') {
    progress = thisWeek.filter((r) => r.result === 'victory' && r.boss).length
  } else {
    progress = thisWeek.reduce((best, r) => Math.max(best, r.bestCombo), 0)
  }
  return {
    weekKey,
    key: template.key,
    name: template.name,
    description: template.description,
    target: template.target,
    progress: Math.min(progress, template.target),
    done: progress >= template.target,
  }
}

/** How the accuracy trend is moving, for the record book's insight line. */
function accuracyInsight(recent: ArenaRunRow[]): {
  direction: 'up' | 'down' | 'flat' | null
  deltaPercent: number
} {
  if (recent.length < 10) return { direction: null, deltaPercent: 0 }
  const acc = (r: ArenaRunRow) => (r.rounds === 0 ? 0 : r.correct / r.rounds)
  // listArenaRuns is newest-first: first 5 = recent, next 5 = previous.
  const recentAvg = recent.slice(0, 5).reduce((sum, r) => sum + acc(r), 0) / 5
  const priorAvg = recent.slice(5, 10).reduce((sum, r) => sum + acc(r), 0) / 5
  const delta = recentAvg - priorAvg
  return {
    direction: Math.abs(delta) < 0.01 ? 'flat' : delta > 0 ? 'up' : 'down',
    deltaPercent: Math.round(Math.abs(delta) * 100),
  }
}

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = queryLimit(url.searchParams, 10, 50)
  const perDeck = getArenaStatsByDeck()
  // The trend reads left-to-right oldest → newest over the latest runs.
  const trendRows = listArenaRuns({ limit: 10 }).reverse()
  const deckIds = perDeck.map((d) => d.deckId)
  const deckRows = deckIds.length
    ? await db
        .select({ id: decks.id, name: decks.name, emoji: decks.emoji })
        .from(decks)
        .where(inArray(decks.id, deckIds))
    : []
  const deckById = new Map(deckRows.map((d) => [d.id, d]))
  // The rival ghost: your highest-scoring run (ties go to the newest), so
  // the fight HUD can pace you against your own best.
  const bestRun = listArenaRuns({ limit: 100 }).reduce<
    ReturnType<typeof listArenaRuns>[number] | null
  >((best, r) => (best === null || r.score > best.score ? r : best), null)
  const insight = accuracyInsight(listArenaRuns({ limit: 10 }))
  const trial = weeklyTrial(new Date(), listArenaRuns({ limit: 100 }))
  return Response.json({
    ok: true,
    stats: getArenaStats(),
    runs: listArenaRuns({ limit }),
    perDeck: perDeck.map((d) => ({
      ...d,
      name: deckById.get(d.deckId)?.name ?? 'Deleted deck',
      emoji: deckById.get(d.deckId)?.emoji ?? null,
    })),
    bestRunId: bestRun?.id ?? null,
    perGuardian: getArenaStatsByGuardian(),
    trial,
    pace: paceStats(listArenaRunsForExport({ limit: 50 })),
    trend: trendRows.map((r) => ({
      runId: r.referenceId,
      accuracy: r.rounds === 0 ? 0 : r.correct / r.rounds,
      result: r.result,
      createdAt: r.createdAt,
    })),
    insight,
  })
})
