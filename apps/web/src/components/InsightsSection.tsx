'use client'

/**
 * InsightsSection — "what actually helps you learn": honest cross-metric
 * correlations from your own logs (sleep, exercise, mood × retention, focus).
 * Small samples are labelled; correlation is never causation.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Minus, Telescope } from 'lucide-react'
import { apiGet } from '@/lib/transport'

interface Insight {
  id: string
  label: string
  r: number | null
  n: number
  direction: 'positive' | 'negative' | 'none'
  statement: string
  caveat: string
}

interface InsightsResponse {
  ok: boolean
  insights: Insight[]
  daysWithRetention: number
}

const TONE = {
  positive: 'text-status-success-text dark:text-status-success-text bg-emerald-600/10',
  negative: 'text-status-warning-text dark:text-status-warning-text bg-amber-500/10',
  none: 'text-tertiary bg-neutral-200/60 dark:bg-(--hub-border)',
} as const

export function InsightsSection() {
  const q = useQuery<InsightsResponse>({
    queryKey: ['insights'],
    queryFn: () => apiGet('/api/insights'),
    staleTime: 5 * 60 * 1000,
  })

  const insights = q.data?.insights ?? []
  const meaningful = insights.filter((i) => i.r != null && Math.abs(i.r) >= 0.3)
  const rest = insights.filter((i) => !(i.r != null && Math.abs(i.r) >= 0.3))

  return (
    <section className="panel space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Telescope className="h-4 w-4 text-indigo-400" /> What helps you learn
        </h2>
        <p className="text-xs text-tertiary">
          Correlations between your logged sleep, exercise, mood and focus — and your outcomes.
          {q.data && q.data.daysWithRetention < 10
            ? ` Only ${q.data.daysWithRetention} day${q.data.daysWithRetention === 1 ? '' : 's'} with review data so far.`
            : ''}
        </p>
      </div>

      {q.isLoading && <p className="text-sm text-faint">Crunching your logs…</p>}

      {meaningful.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {meaningful.map((i) => {
            const Icon = i.direction === 'positive' ? ArrowUpRight : ArrowDownRight
            return (
              <div
                key={i.id}
                className="rounded-xl border border-neutral-200 p-3 dark:border-(--hub-border)"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{i.statement}</span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[i.direction]}`}
                  >
                    <Icon className="h-3 w-3" /> r={i.r?.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-faint">{i.caveat}</p>
              </div>
            )
          })}
        </div>
      )}

      {rest.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-tertiary">
            {meaningful.length > 0 ? 'Other tracked pairs' : 'Tracked pairs'} ({rest.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {rest.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-xs text-tertiary">
                <Minus className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {i.statement} <span className="text-faint">{i.caveat}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
