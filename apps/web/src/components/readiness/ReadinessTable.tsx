import React from 'react'
import { pct, type GroupRow } from './types'

interface Props {
  title: string
  rows: GroupRow[]
  target: number
  testid: string
}

/** Weakest group first, as the API sorts it. Every figure is text. */
export function ReadinessTable({ title, rows, target, testid }: Props) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-2" data-testid={testid}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-700"
            data-testid={`${testid}-row`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium">{r.label}</span>
              <span className="tabular-nums">
                {pct(r.plannedRecall)} planned
                <span className="opacity-60"> · {pct(r.baselineRecall)} if you stop</span>
              </span>
            </div>
            <p className="mt-1 text-xs opacity-70">
              {r.cards} cards, {r.unseen} new. {pct(r.atTarget)} of studied cards reach{' '}
              {pct(target)}.
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
