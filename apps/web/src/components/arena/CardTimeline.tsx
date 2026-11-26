'use client'

/**
 * CardTimeline — one card's arena history, loaded on demand.
 *
 * A strip of attempt markers (colored by grade, outlined when the miss was
 * confident), plus speed trend and streak facts. Reads /api/arena/card/[id].
 * Self-reported grades: a practice aid, not a measured score.
 */
import { useEffect, useState } from 'react'
import { Skeleton } from '@/ui'
import { apiGet } from '@/lib/transport'

export interface CardTimelinePayload {
  cardId: number
  front: string
  attempts: Array<{
    run: number
    attempt: number
    grade: number
    confidence: number
    timeMs: number
    correct: boolean
    overconfident: boolean
  }>
  fastestMs: number | null
  slowestMs: number | null
  speedTrend: 'faster' | 'slower' | 'steady' | 'unknown'
  runsSeen: number
  bestCorrectStreak: number
}

const GRADE_LABEL: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

const GRADE_CLASS: Record<number, string> = {
  1: 'bg-rose-500',
  2: 'bg-amber-500',
  3: 'bg-indigo-500',
  4: 'bg-cyan-500',
}

export function speedTrendLabel(t: CardTimelinePayload['speedTrend']): string {
  switch (t) {
    case 'faster':
      return 'Getting faster'
    case 'slower':
      return 'Getting slower'
    case 'steady':
      return 'Steady pace'
    default:
      return 'Not enough attempts for a pace trend'
  }
}

export function attemptTitle(a: CardTimelinePayload['attempts'][number]): string {
  const base = `Run ${a.run}, attempt ${a.attempt}: ${GRADE_LABEL[a.grade] ?? 'Unknown'} in ${(a.timeMs / 1000).toFixed(1)}s`
  return a.overconfident ? `${base} (confident miss)` : base
}

export function CardTimeline({ cardId }: { cardId: number }): React.ReactElement {
  const [data, setData] = useState<CardTimelinePayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    apiGet<CardTimelinePayload>(`/api/arena/card/${cardId}`)
      .then((d) => {
        if (live) setData(d)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [cardId])

  if (failed) {
    return (
      <p className="mt-2 text-xs text-faint" data-testid="arena-card-timeline-error">
        The card history could not be loaded.
      </p>
    )
  }
  if (!data) return <Skeleton className="mt-2 h-10 w-full" />

  return (
    <div className="mt-2 space-y-2" data-testid={`arena-card-timeline-${cardId}`}>
      <div className="flex flex-wrap gap-1" role="img" aria-label="Attempt history, oldest first">
        {data.attempts.map((a) => (
          <span
            key={a.attempt}
            title={attemptTitle(a)}
            className={`h-3 w-3 rounded-full ${GRADE_CLASS[a.grade] ?? 'bg-neutral-200'} ${
              a.overconfident ? 'ring-2 ring-rose-500/60 ring-offset-1' : ''
            }`}
            data-testid="arena-card-attempt"
            data-grade={a.grade}
          />
        ))}
      </div>
      <p className="text-xs text-faint">
        {data.attempts.length} {data.attempts.length === 1 ? 'attempt' : 'attempts'} over{' '}
        {data.runsSeen} {data.runsSeen === 1 ? 'run' : 'runs'} · best streak{' '}
        {data.bestCorrectStreak} · {speedTrendLabel(data.speedTrend)}
        {data.fastestMs !== null && data.slowestMs !== null
          ? ` · ${(data.fastestMs / 1000).toFixed(1)}s to ${(data.slowestMs / 1000).toFixed(1)}s`
          : ''}
      </p>
    </div>
  )
}
