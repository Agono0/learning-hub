'use client'

/**
 * ArenaProgressPanel — local practice rank and a run-activity heatmap.
 *
 * Reads /api/arena/progress. The rank is a personal practice ladder (points
 * come from correct retrieval, not combat score); the heatmap shows which
 * days you actually practiced. Neither is a competitive ranking and neither
 * affects coins or scheduling.
 */
import { useEffect, useState } from 'react'
import { Medal } from 'lucide-react'
import { Badge, Panel, ProgressBar, Skeleton } from '@/ui'
import { apiGet } from '@/lib/transport'

export interface ProgressPayload {
  rank: {
    points: number
    tier: { key: string; name: string; min: number }
    next: { key: string; name: string; min: number } | null
    intoTier: number
    tierSpan: number
    progressPct: number
  }
  heatmap: {
    days: Array<{ date: string; runs: number; level: 0 | 1 | 2 | 3 | 4 }>
    totalRuns: number
    activeDays: number
    currentStreak: number
    longestStreak: number
    busiestDay: { date: string; runs: number } | null
  }
}

const LEVEL_CLASS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-neutral-200 dark:bg-(--hub-border)',
  1: 'bg-indigo-500/25',
  2: 'bg-indigo-500/50',
  3: 'bg-indigo-500/75',
  4: 'bg-indigo-500',
}

/** One-line rank caption: what is left to the next tier, or that the ladder is topped. */
export function rankCaption(rank: ProgressPayload['rank']): string {
  if (!rank.next) return `${rank.points} practice points. Top of the ladder.`
  const left = rank.next.min - rank.points
  return `${rank.points} practice points. ${left} more to ${rank.next.name}.`
}

/** Pad the oldest-first day list so the first column starts on Monday (UTC). */
export function heatmapWeeks(
  days: ProgressPayload['heatmap']['days'],
): Array<Array<ProgressPayload['heatmap']['days'][number] | null>> {
  if (days.length === 0) return []
  const first = new Date(`${days[0]!.date}T00:00:00.000Z`)
  const lead = (first.getUTCDay() + 6) % 7
  const cells: Array<ProgressPayload['heatmap']['days'][number] | null> = [
    ...Array.from({ length: lead }, () => null),
    ...days,
  ]
  const weeks: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function ArenaProgressPanel({ refreshKey }: { refreshKey?: unknown }): React.ReactElement {
  const [data, setData] = useState<ProgressPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setFailed(false)
    apiGet<ProgressPayload>('/api/arena/progress', { days: 84 })
      .then((d) => {
        if (live) setData(d)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [refreshKey])

  if (failed) return <></>
  if (!data) return <Skeleton className="h-28 w-full" />

  const weeks = heatmapWeeks(data.heatmap.days)

  return (
    <Panel data-testid="arena-progress">
      <div className="flex flex-wrap items-center gap-2">
        <Medal className="h-4 w-4 text-faint" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Practice rank</h3>
        <Badge tone="accent">
          <span data-testid="arena-rank-name">{data.rank.tier.name}</span>
        </Badge>
        <span className="text-xs text-faint" data-testid="arena-rank-caption">
          {rankCaption(data.rank)}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={data.rank.progressPct} label="Progress to next practice rank" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-faint">
        <span data-testid="arena-heatmap-streak">
          Streak {data.heatmap.currentStreak} {data.heatmap.currentStreak === 1 ? 'day' : 'days'}
        </span>
        <span>Longest {data.heatmap.longestStreak}</span>
        <span>
          {data.heatmap.activeDays} active {data.heatmap.activeDays === 1 ? 'day' : 'days'} in the
          last {data.heatmap.days.length}
        </span>
      </div>

      <div
        className="mt-2 flex gap-1 overflow-x-auto"
        role="img"
        aria-label={`Arena activity over the last ${data.heatmap.days.length} days`}
        data-testid="arena-heatmap"
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((d, di) =>
              d ? (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.runs} ${d.runs === 1 ? 'run' : 'runs'}`}
                  className={`h-3 w-3 rounded-sm ${LEVEL_CLASS[d.level]}`}
                  data-testid="arena-heatmap-cell"
                  data-level={d.level}
                />
              ) : (
                <div key={`pad-${di}`} className="h-3 w-3" aria-hidden="true" />
              ),
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-faint">
        A personal practice ladder from correct answers. Not a competitive ranking.
      </p>
    </Panel>
  )
}
