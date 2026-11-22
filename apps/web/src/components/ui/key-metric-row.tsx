'use client'

/**
 * Clay-restyled metric grid for the page layer (`src/components/ui`) —
 * kit-izes the FSRS metrics grid pattern (e.g. `app/settings/page.tsx`
 * FSRS-6 Weight Optimizer card) into a semantic `dl` of label/value pairs.
 * Purely presentational (no client JS); the design-system kit (`src/ui`) is
 * untouched.
 *
 * Mobile-first: 2 columns at phone width, growing to `columns` at `sm`.
 * Values are `tabular-nums` so number columns align while live values tick.
 */

import React from 'react'
import { cn } from './lib'

/** One metric cell. */
export interface KeyMetric {
  /** Small tertiary label (rendered as the `dt`). */
  label: string
  /** The value itself — preformatted by the caller (units, decimals, dashes). */
  value: string
  /** Optional one-line explanation shown under the value. */
  hint?: string
}

/** Props for {@link KeyMetricRow}. */
export interface KeyMetricRowProps {
  /** Metrics in display order. */
  metrics: readonly KeyMetric[]
  /** Target column count at `sm` and up. Defaults to `2`. */
  columns?: 2 | 3 | 4
  /** Passthrough classes (margins/width tweaks only). */
  className?: string
}

/** Column map: 2-up on phones, target count from `sm`. */
const COLUMNS: Record<NonNullable<KeyMetricRowProps['columns']>, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
}

/**
 * Bordered `dl` grid of dt/dd-ish metric pairs: label `text-xs
 * text-tertiary`, value `text-sm font-semibold tabular-nums text-strong`,
 * optional hint in `text-faint`. Not interactive — for anything clickable,
 * use the kit `StatCard` instead.
 */
export function KeyMetricRow({
  metrics,
  columns = 2,
  className,
}: KeyMetricRowProps): React.ReactElement {
  return (
    <dl
      className={cn(
        'grid gap-2 rounded-lg border border-neutral-200 p-3 dark:border-(--hub-border)',
        COLUMNS[columns],
        className,
      )}
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0">
          <dt className="text-xs text-tertiary">{metric.label}</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-strong">
            {metric.value}
          </dd>
          {metric.hint ? (
            <dd className="mt-0.5 text-[11px] leading-snug text-faint">{metric.hint}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  )
}
