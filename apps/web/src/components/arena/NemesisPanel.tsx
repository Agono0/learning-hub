'use client'

/**
 * NemesisPanel — the cards the arena keeps catching you on.
 *
 * Reads /api/arena/nemesis (per-card stats from the accepted grade logs of
 * settled runs). Shows the mastery-tier spread, the top nemeses with the
 * reason each one scored (misses, confident misses, streak) and cards that
 * recovered. It is a practice-insight view built on self-reported grades:
 * never a scheduler input, never an economy input.
 */
import { useEffect, useState } from 'react'
import { Skull, Sparkles } from 'lucide-react'
import { Badge, EmptyState, Panel, ProgressBar, Skeleton } from '@/ui'
import { apiGet } from '@/lib/transport'

type Tier = 'new' | 'shaky' | 'learning' | 'steady' | 'mastered'

export interface NemesisCard {
  cardId: number
  front: string
  format: string | null
  attempts: number
  correct: number
  misses: number
  accuracy: number
  overconfidentMisses: number
  avgTimeMs: number
  correctStreak: number
  worstMissStreak: number
  recentDelta: number | null
  tier: Tier
  nemesisScore: number
}

export interface NemesisPayload {
  sampledRuns: number
  cardsSeen: number
  tiers: Record<Tier, number>
  nemeses: NemesisCard[]
  redeemed: NemesisCard[]
}

const TIER_TONE: Record<Tier, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  new: 'neutral',
  shaky: 'danger',
  learning: 'warning',
  steady: 'accent',
  mastered: 'success',
}

const TIER_ORDER: Tier[] = ['shaky', 'learning', 'steady', 'mastered', 'new']

/** One plain-language reason line per nemesis — what actually drove its score. */
export function nemesisReason(c: NemesisCard): string {
  const parts: string[] = [`missed ${c.misses} of ${c.attempts}`]
  if (c.overconfidentMisses > 0) {
    parts.push(
      `${c.overconfidentMisses} confident ${c.overconfidentMisses === 1 ? 'miss' : 'misses'}`,
    )
  }
  if (c.worstMissStreak >= 2) parts.push(`${c.worstMissStreak} misses in a row at worst`)
  if (c.recentDelta !== null && c.recentDelta <= -0.25) parts.push('getting worse lately')
  if (c.recentDelta !== null && c.recentDelta >= 0.25) parts.push('improving lately')
  return parts.join(' · ')
}

export function NemesisPanel({ refreshKey }: { refreshKey?: unknown }): React.ReactElement {
  const [data, setData] = useState<NemesisPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setFailed(false)
    apiGet<NemesisPayload>('/api/arena/nemesis', { limit: 5 })
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
  if (!data) return <Skeleton className="h-24 w-full" />

  return (
    <Panel data-testid="arena-nemesis">
      <div className="flex flex-wrap items-center gap-2">
        <Skull className="h-4 w-4 text-faint" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Nemesis cards</h3>
        <span className="text-xs text-faint" data-testid="arena-nemesis-sample">
          from {data.sampledRuns} settled {data.sampledRuns === 1 ? 'run' : 'runs'},{' '}
          {data.cardsSeen} cards seen
        </span>
      </div>

      {data.cardsSeen === 0 ? (
        <EmptyState title="No arena history yet">
          Finish a run and the cards that keep costing you will show up here.
        </EmptyState>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="arena-nemesis-tiers">
            {TIER_ORDER.map((t) => (
              <Badge key={t} tone={TIER_TONE[t]}>
                {t} {data.tiers[t] ?? 0}
              </Badge>
            ))}
          </div>

          {data.nemeses.length === 0 ? (
            <p className="mt-3 text-xs text-faint" data-testid="arena-nemesis-none">
              No card is beating you repeatedly. Cards need at least two attempts to count.
            </p>
          ) : (
            <ul className="mt-3 space-y-2" data-testid="arena-nemesis-list">
              {data.nemeses.map((c) => (
                <li
                  key={c.cardId}
                  className="rounded-lg border border-(--hub-border) p-2"
                  data-testid={`arena-nemesis-row-${c.cardId}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TIER_TONE[c.tier]}>{c.tier}</Badge>
                    <span className="text-sm font-medium">{c.front || '(empty card)'}</span>
                    <span className="ml-auto text-xs text-faint">
                      score {c.nemesisScore} · avg {(c.avgTimeMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-faint">{nemesisReason(c)}</p>
                  <div className="mt-1">
                    <ProgressBar
                      value={Math.round(c.accuracy * 100)}
                      label={`Accuracy on card ${c.cardId}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data.redeemed.length > 0 ? (
            <div className="mt-3" data-testid="arena-nemesis-redeemed">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Back on track
              </div>
              <ul className="mt-1 space-y-1">
                {data.redeemed.map((c) => (
                  <li key={c.cardId} className="text-xs text-faint">
                    {c.front || '(empty card)'} · {c.correctStreak} correct in a row after{' '}
                    {c.worstMissStreak} misses
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
      <p className="mt-3 text-[11px] text-faint">
        Based on the grades you self-report in the arena. A practice aid, not a measured score.
      </p>
    </Panel>
  )
}
