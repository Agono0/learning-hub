/**
 * Learning insights — pure correlation math joining the body metrics the user
 * already logs (sleep, exercise, mood) with the learning metrics the app
 * already records (retention, review volume, focus minutes).
 *
 * Honesty rules (same spirit as physiology.ts): small samples are labelled,
 * correlation never implies causation, and every statement is generated from
 * the numbers — never embellished.
 */

export interface DailyMetric {
  date: string // YYYY-MM-DD
  value: number | null
}

export interface InsightInput {
  sleep: DailyMetric[] // hours
  sleepQuality: DailyMetric[] // 1..5
  exercise: DailyMetric[] // minutes
  mood: DailyMetric[] // 1..5
  focusMinutes: DailyMetric[]
  reviews: DailyMetric[]
  /** true retention 0..1 (from v_true_retention), null when no mature reviews that day */
  retention: DailyMetric[]
}

export interface Insight {
  id: string
  label: string
  /** Pearson r, or null when it cannot be computed (no variance / tiny n) */
  r: number | null
  n: number
  direction: 'positive' | 'negative' | 'none'
  statement: string
  caveat: string
}

export interface InsightsReport {
  insights: Insight[]
  /** days with enough joined data — surfaced so the UI can be honest */
  daysWithRetention: number
}

/**
 * Pearson correlation of the paired (non-null) samples.
 * Returns null when fewer than MIN_N pairs or zero variance on either side.
 */
export function pearson(
  a: Array<number | null>,
  b: Array<number | null>,
): { r: number | null; n: number } {
  const MIN_N = 3
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x != null && y != null) pairs.push([x, y])
  }
  const n = pairs.length
  if (n < MIN_N) return { r: null, n }

  let sx = 0
  let sy = 0
  for (const [x, y] of pairs) {
    sx += x
    sy += y
  }
  const mx = sx / n
  const my = sy / n

  let cov = 0
  let vx = 0
  let vy = 0
  for (const [x, y] of pairs) {
    const dx = x - mx
    const dy = y - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return { r: null, n }
  const r = cov / Math.sqrt(vx * vy)
  return { r: Math.max(-1, Math.min(1, r)), n }
}

function strengthOf(r: number): string {
  const a = Math.abs(r)
  if (a >= 0.5) return 'strong'
  if (a >= 0.3) return 'notable'
  return 'weak'
}

function alignByDate(
  primary: DailyMetric[],
  secondary: DailyMetric[],
): Array<[number | null, number | null]> {
  const byDate = new Map(secondary.map((d) => [d.date, d.value]))
  return primary.map((d) => [d.value, byDate.get(d.date) ?? null])
}

/**
 * Computes the cross-metric insight list. Every insight pairs one behaviour
 * metric with one learning outcome (retention first, review volume second).
 */
export function computeLearningInsights(input: InsightInput): InsightsReport {
  const defs: Array<{
    id: string
    label: string
    metric: DailyMetric[]
    against: DailyMetric[]
    unit: string
    againstLabel: string
  }> = [
    {
      id: 'sleep-retention',
      label: 'Sleep duration',
      metric: input.sleep,
      against: input.retention,
      unit: 'h',
      againstLabel: 'true retention',
    },
    {
      id: 'sleep-quality-retention',
      label: 'Sleep quality',
      metric: input.sleepQuality,
      against: input.retention,
      unit: '/5',
      againstLabel: 'true retention',
    },
    {
      id: 'exercise-retention',
      label: 'Exercise',
      metric: input.exercise,
      against: input.retention,
      unit: ' min',
      againstLabel: 'true retention',
    },
    {
      id: 'mood-retention',
      label: 'Mood',
      metric: input.mood,
      against: input.retention,
      unit: '/5',
      againstLabel: 'true retention',
    },
    {
      id: 'focus-reviews',
      label: 'Focus minutes',
      metric: input.focusMinutes,
      against: input.reviews,
      unit: ' min',
      againstLabel: 'reviews done',
    },
    {
      id: 'sleep-focus',
      label: 'Sleep duration',
      metric: input.sleep,
      against: input.focusMinutes,
      unit: 'h',
      againstLabel: 'focus minutes',
    },
  ]

  const insights: Insight[] = []
  const daysWithRetention = input.retention.filter((d) => d.value != null).length

  for (const def of defs) {
    const pairs = alignByDate(def.metric, def.against)
    const { r, n } = pearson(
      pairs.map(([a]) => a),
      pairs.map(([, b]) => b),
    )
    const caveat =
      n < 10
        ? `Only ${n} day${n === 1 ? '' : 's'} with both numbers — treat as a hint, not a finding.`
        : 'Correlation is not causation — but with n=' + n + ' it is worth noticing.'

    let direction: Insight['direction'] = 'none'
    let statement: string
    if (r == null) {
      statement =
        n < 3
          ? `Not enough days with both ${def.label.toLowerCase()} and ${def.againstLabel} logged yet (n=${n}).`
          : `No measurable relationship between ${def.label.toLowerCase()} and ${def.againstLabel} in your data so far.`
    } else {
      direction = r > 0.05 ? 'positive' : r < -0.05 ? 'negative' : 'none'
      statement =
        direction === 'none'
          ? `No measurable relationship between ${def.label.toLowerCase()} and ${def.againstLabel} in your data so far.`
          : `${strengthOf(r)} ${direction} link: days with more ${def.label.toLowerCase()} tend to come with ${
              direction === 'positive' ? 'higher' : 'lower'
            } ${def.againstLabel} (r=${r.toFixed(2)}, n=${n}).`
    }

    insights.push({ id: def.id, label: def.label, r, n, direction, statement, caveat })
  }

  return { insights, daysWithRetention }
}
