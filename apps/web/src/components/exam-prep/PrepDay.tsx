import React from 'react'
import { Badge } from '@/ui'
import { pct, reviewHref, MAX_LIST, type PrepDayDto } from './types'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return `${WEEKDAY[d.getUTCDay()]} ${date}`
}

/** One study day: how many reviews, and the cards in order. Rest days say so. */
export function PrepDay({ day, today }: { day: PrepDayDto; today: boolean }) {
  const ids = day.reviews.map((r) => r.cardId)
  return (
    <li
      className="rounded-lg border border-black/10 p-3 dark:border-white/10"
      data-testid="prep-day"
    >
      <details>
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            {dayLabel(day.date)}
            {today && <span className="ml-2 text-xs opacity-70">today</span>}
          </span>
          <span className="flex items-center gap-2 text-sm">
            {day.rest ? (
              <Badge tone="neutral">Rest day</Badge>
            ) : (
              <Badge tone={day.reviews.length ? 'accent' : 'neutral'}>
                {day.reviews.length === 0 ? 'Nothing to add' : `${day.reviews.length} reviews`}
              </Badge>
            )}
            <span className="tabular-nums opacity-70">{pct(day.meanExamRecallAfter)}</span>
          </span>
        </summary>
        {day.reviews.length > 0 && (
          <div className="mt-2">
            <ol className="space-y-1 text-sm">
              {day.reviews.map((r) => (
                <li
                  key={r.cardId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3"
                  data-testid="prep-review"
                >
                  <span className="min-w-0 break-words">
                    {r.label}
                    <span className="ml-2 text-xs opacity-60">{r.deck}</span>
                    {r.nth > 1 && <span className="ml-2 text-xs opacity-60">review {r.nth}</span>}
                  </span>
                  <span className="tabular-nums opacity-80">
                    {pct(r.recallBefore)} now, {pct(r.examRecallAfter)} on exam day
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs opacity-70">
              This opens the review queue on these cards, in this order. You answer each one
              yourself.
              {ids.length > MAX_LIST ? ` The first ${MAX_LIST} open at once.` : ''}
            </p>
            <a
              href={reviewHref(ids)}
              className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-black/15 px-3 text-sm font-medium dark:border-white/20"
              data-testid="prep-study-link"
            >
              {`Study ${Math.min(ids.length, MAX_LIST)} of these cards`}
            </a>
          </div>
        )}
      </details>
    </li>
  )
}
