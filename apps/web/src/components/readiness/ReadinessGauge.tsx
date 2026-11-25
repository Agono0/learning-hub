import React from 'react'
import { pct } from './types'

interface Props {
  baseline: number
  planned: number
  target: number
  unseen: number
  cards: number
}

/**
 * Two stacked bars on one 0-100% scale: recall if you stop today, and recall
 * under the review scenario. A tick marks the target. Text carries every value
 * so the bars are never the only signal.
 */
export function ReadinessGauge({ baseline, planned, target, unseen, cards }: Props) {
  const row = (label: string, value: number, tone: string, testid: string) => (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums" data-testid={testid}>
          {pct(value)}
        </span>
      </div>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        role="img"
        aria-label={`${label}: ${pct(value)}`}
      >
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-neutral-900 dark:bg-neutral-100"
          style={{ left: `${Math.round(target * 100)}%` }}
          aria-hidden
        />
      </div>
    </div>
  )
  return (
    <div className="space-y-3" data-testid="readiness-gauge">
      {row('If you stop reviewing today', baseline, 'bg-amber-500', 'readiness-baseline')}
      {row('With the review scenario', planned, 'bg-emerald-500', 'readiness-planned')}
      <p className="text-xs opacity-70">
        Marker is your target of {pct(target)}. Averages cover the {cards - unseen} cards you have
        studied. {unseen > 0 ? `${unseen} new cards are not counted as forgotten.` : ''}
      </p>
    </div>
  )
}
