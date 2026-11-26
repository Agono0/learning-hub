import React from 'react'
import { Badge } from '@/ui'
import { STATE_NAMES, dueLabel, pct, type SessionCardDto } from './types'

/** One picked card: its label, deck, state, lapses, due and estimated recall. */
export function SessionCard({ card }: { card: SessionCardDto }) {
  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10"
      data-testid="session-card"
    >
      <span className="min-w-0 break-words">
        {card.label}
        <span className="ml-2 text-xs opacity-60">{card.deck}</span>
        {card.tags.length > 0 && (
          <span className="ml-2 text-xs opacity-60">{card.tags.map((t) => `#${t}`).join(' ')}</span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
        <Badge tone="neutral">{STATE_NAMES[card.state] ?? 'Card'}</Badge>
        {card.lapses > 0 && (
          <span>
            {card.lapses} {card.lapses === 1 ? 'lapse' : 'lapses'}
          </span>
        )}
        <span>{dueLabel(card.dueInDays)}</span>
        <span>recall {pct(card.recall)}</span>
      </span>
    </li>
  )
}
