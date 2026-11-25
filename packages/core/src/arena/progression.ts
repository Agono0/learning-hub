/**
 * Arena practice progression — a local practice rank and an activity heatmap.
 *
 * Both are pure functions over the player's own settled runs. The rank is a
 * *practice* ladder: it rewards showing up and retrieving correctly, it is
 * never compared against other people, never competitive, and never moves
 * coins or the scheduler. Points come from correct retrieval (not combat
 * score) so the ladder cannot be farmed by button-mashing a high-score run.
 */

export interface ProgressionRun {
  createdAt: string
  result: string
  rounds: number
  correct: number
  boss: boolean
}

export interface PracticeRankTier {
  key: string
  name: string
  /** Practice points needed to reach this tier. */
  min: number
}

export const PRACTICE_RANKS: ReadonlyArray<PracticeRankTier> = [
  { key: 'initiate', name: 'Initiate', min: 0 },
  { key: 'squire', name: 'Squire', min: 60 },
  { key: 'knight', name: 'Knight', min: 200 },
  { key: 'captain', name: 'Captain', min: 500 },
  { key: 'paladin', name: 'Paladin', min: 1000 },
  { key: 'warden', name: 'Warden', min: 2000 },
  { key: 'archon', name: 'Archon', min: 4000 },
]

/**
 * Practice points for one run: 1 per correct answer, +10 for a victory,
 * +15 more for a boss victory. A defeat still pays its correct answers.
 */
export function runPracticePoints(run: ProgressionRun): number {
  const base = Math.max(0, Math.floor(run.correct))
  const win = run.result === 'victory' ? 10 : 0
  const boss = run.result === 'victory' && run.boss ? 15 : 0
  return base + win + boss
}

export interface PracticeRank {
  points: number
  tier: PracticeRankTier
  next: PracticeRankTier | null
  /** Points into the current tier. */
  intoTier: number
  /** Points the current tier spans (0 at the top tier). */
  tierSpan: number
  /** 0-100 progress toward the next tier (100 at the top tier). */
  progressPct: number
}

export function practiceRank(runs: ReadonlyArray<ProgressionRun>): PracticeRank {
  const points = runs.reduce((s, r) => s + runPracticePoints(r), 0)
  let idx = 0
  for (let i = 0; i < PRACTICE_RANKS.length; i++) {
    if (points >= PRACTICE_RANKS[i]!.min) idx = i
  }
  const tier = PRACTICE_RANKS[idx]!
  const next = PRACTICE_RANKS[idx + 1] ?? null
  const tierSpan = next ? next.min - tier.min : 0
  const intoTier = points - tier.min
  const progressPct = next ? Math.min(100, Math.floor((intoTier / tierSpan) * 100)) : 100
  return { points, tier, next, intoTier, tierSpan, progressPct }
}

// ─── Activity heatmap ───────────────────────────────────────────────────────

export interface HeatmapDay {
  /** YYYY-MM-DD (UTC). */
  date: string
  runs: number
  /** 0 (none) to 4 (heaviest) — bucketed against the busiest day shown. */
  level: 0 | 1 | 2 | 3 | 4
}

export interface ActivityHeatmap {
  days: HeatmapDay[]
  totalRuns: number
  activeDays: number
  /** Consecutive active days ending today (0 when today has no run and yesterday neither). */
  currentStreak: number
  longestStreak: number
  busiestDay: { date: string; runs: number } | null
}

const DAY_MS = 86_400_000

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function levelFor(runs: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (runs <= 0 || max <= 0) return 0
  const ratio = runs / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

/**
 * Per-day run counts for the `span` UTC days ending at `now`, oldest first.
 * A streak counts today only if today has a run; otherwise it may still be
 * alive through yesterday (the player has not played yet today).
 */
export function buildActivityHeatmap(
  runs: ReadonlyArray<Pick<ProgressionRun, 'createdAt'>>,
  now: Date = new Date(),
  span = 84,
): ActivityHeatmap {
  const n = Math.min(Math.max(Math.floor(span), 1), 366)
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const counts = new Map<string, number>()
  for (const r of runs) {
    const t = Date.parse(r.createdAt)
    if (Number.isNaN(t)) continue
    const k = dayKey(t)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const raw: Array<{ date: string; runs: number }> = []
  for (let i = n - 1; i >= 0; i--) {
    const date = dayKey(todayMs - i * DAY_MS)
    raw.push({ date, runs: counts.get(date) ?? 0 })
  }
  const max = raw.reduce((m, d) => Math.max(m, d.runs), 0)
  const days: HeatmapDay[] = raw.map((d) => ({ ...d, level: levelFor(d.runs, max) }))

  let longest = 0
  let run = 0
  for (const d of days) {
    run = d.runs > 0 ? run + 1 : 0
    longest = Math.max(longest, run)
  }

  let current = 0
  let i = days.length - 1
  if (days[i]!.runs === 0) i-- // today not played yet: streak may live through yesterday
  for (; i >= 0 && days[i]!.runs > 0; i--) current++

  const busiest = days.reduce<HeatmapDay | null>(
    (b, d) => (d.runs > 0 && (!b || d.runs > b.runs) ? d : b),
    null,
  )
  return {
    days,
    totalRuns: days.reduce((s, d) => s + d.runs, 0),
    activeDays: days.filter((d) => d.runs > 0).length,
    currentStreak: current,
    longestStreak: longest,
    busiestDay: busiest ? { date: busiest.date, runs: busiest.runs } : null,
  }
}
