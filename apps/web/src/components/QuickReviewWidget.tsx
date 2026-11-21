'use client'

/**
 * 60-second micro-review widget for the dashboard — wires the previously-
 * orphaned `/api/hud/quick-review` endpoint (top due cards for desktop HUD
 * micro-review) into a zero-navigation grading loop: see 3 cards, grade,
 * done. Full sessions stay on /review; this is the "one spare minute" path.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Timer, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { Grade } from '@learning-hub/core/types'
import { apiGet, apiSend } from '@/lib/transport'
import { cx } from '@/ui/cx'
import { queryKeys } from '@/lib/query-keys'

export interface QuickReviewWidgetProps {
  className?: string
}

interface QuickCard {
  cardId: number
  front?: string
  prompt?: string
  deckName?: string
  type?: string
  content?: unknown
}

interface QuickReviewResponse {
  ok: boolean
  cards: QuickCard[]
}

/** Best-effort front text from whatever the audio repo returns per card. */
function frontOf(card: QuickCard): string {
  if (typeof card.front === 'string') return card.front
  if (typeof card.prompt === 'string') return card.prompt
  if (card.content && typeof card.content === 'object') {
    const c = card.content as Record<string, unknown>
    if (c.basic && typeof c.basic === 'object') {
      const b = c.basic as Record<string, unknown>
      if (typeof b.front === 'string') return b.front
    }
    if (typeof c.front === 'string') return c.front
  }
  return `Card #${card.cardId}`
}

/**
 * Dashboard micro-review. Grades go through the SAME `/api/review` pipeline
 * as the full session (one grading path — AGENTS.md rule 7), with a 0/1
 * confidence preset to "uncertain" because a 6-second glance is not a
 * calibrated JOL.
 */
export function QuickReviewWidget({ className }: QuickReviewWidgetProps) {
  const qc = useQueryClient()
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)

  const q = useQuery({
    queryKey: ['hud-quick-review'],
    queryFn: () => apiGet<QuickReviewResponse>('/api/hud/quick-review?limit=3'),
    staleTime: 60_000,
  })

  const gradeMutation = useMutation({
    mutationFn: (input: { cardId: number; grade: Grade }) =>
      apiSend('/api/review', 'POST', {
        cardId: input.cardId,
        grade: input.grade,
        confidence: 0,
        timeMs: 6000,
        tzOffset: new Date().getTimezoneOffset(),
      }),
    onSuccess: () => {
      setDone((d) => d + 1)
      setRevealed(false)
      setIdx((i) => i + 1)
      void qc.invalidateQueries({ queryKey: ['hud-quick-review'] })
      void qc.invalidateQueries({ queryKey: queryKeys.decks })
      // Quick grades feed the same FSRS/XP pipeline as full sessions, so the
      // dashboard aggregate (due count, XP, streak) and the activity timeline
      // must refetch too. `['timeline', 7]` matches the ActivityTimelineWidget
      // query key in apps/web/src/components/dashboard/widgets.tsx.
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      void qc.invalidateQueries({ queryKey: ['timeline', 7] })
    },
  })

  const cards = q.data?.cards ?? []
  const card = cards[idx % Math.max(1, cards.length)]

  return (
    <div className={cx('panel space-y-3', className)} data-testid="quick-review-widget">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          <Timer className="h-4 w-4 text-ac-text" />
          60-second review
        </h3>
        {done > 0 && (
          <span className="text-xs font-bold text-status-success-text dark:text-status-success-text">
            {done} graded
          </span>
        )}
      </div>

      {q.isLoading ? (
        <div className="h-20 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
      ) : q.isError ? (
        <p className="text-xs text-danger-text dark:text-danger-text">Could not load due cards.</p>
      ) : cards.length === 0 ? (
        <p className="text-xs text-tertiary dark:text-faint">
          Nothing due — the queue is clear. Check back after your next session.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {frontOf(card)}
          </p>
          {revealed ? (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-neutral-600 dark:text-secondary">
              Grade honestly — this feeds the same FSRS pipeline as a full session.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:border-indigo-400 dark:border-(--hub-border) dark:text-secondary"
            >
              <Timer className="h-3.5 w-3.5" /> Try recall, then reveal
            </button>
          )}
          {revealed && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => gradeMutation.mutate({ cardId: card.cardId, grade: 1 })}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-rose-600/90 px-3 py-2 text-xs font-bold text-white hover:bg-rose-500"
              >
                <XCircle className="h-4 w-4" /> Missed
              </button>
              <button
                type="button"
                onClick={() => gradeMutation.mutate({ cardId: card.cardId, grade: 3 })}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600/90 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
              >
                <CheckCircle2 className="h-4 w-4" /> Recalled
              </button>
            </div>
          )}
          <p className="text-[11px] text-faint">
            card {(idx % cards.length) + 1} of {cards.length} · grades run the standard review
            pipeline
          </p>
        </div>
      )}
    </div>
  )
}
