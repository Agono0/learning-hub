'use client'

/**
 * ImpactStars (S3-96) — the star display for a day's impact rating
 * (1–4, the S3-50 evaluation sheet's scale).
 *
 * Pure display: `impact` null renders four hollow stars with a "not rated"
 * hint; 1–4 fills that many with the accent color. The a11y name carries
 * the scale ("Impact: 3 of 4"), so the visual is decoration and screen
 * readers get the number. Exported `starFill` is the pure fill-matrix the
 * tests cover.
 */
import React from 'react'
import { Star } from 'lucide-react'
import { cx } from '@/ui/cx'

/** Fill state per star position for an impact value (1–4, null unrated). */
export function starFill(impact: number | null, position: number, outOf = 4): 'filled' | 'hollow' {
  if (impact === null || impact < 1) return 'hollow'
  return position <= Math.min(impact, outOf) ? 'filled' : 'hollow'
}

export interface ImpactStarsProps {
  impact: number | null
  outOf?: number
  className?: string
  /** Visible label prefix (e.g. the day) — optional; stars alone are fine. */
  label?: string
}

export function ImpactStars({ impact, outOf = 4, className, label }: ImpactStarsProps) {
  const rating = impact !== null && impact >= 1 ? `${impact} of ${outOf}` : 'not rated'
  return (
    <span
      className={cx('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${label ? `${label} — ` : ''}Impact: ${rating}`}
      title={`Impact: ${rating}`}
    >
      {Array.from({ length: outOf }, (_, i) => {
        const fill = starFill(impact, i + 1, outOf)
        return (
          <Star
            key={i}
            aria-hidden
            className={cx(
              'size-3.5',
              fill === 'filled' ? 'fill-(--ac-strong) text-(--ac-strong)' : 'text-tertiary',
            )}
          />
        )
      })}
    </span>
  )
}
