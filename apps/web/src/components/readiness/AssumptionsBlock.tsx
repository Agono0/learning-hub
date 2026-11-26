import React from 'react'
import { Callout } from '@/ui'

/** Shown beside every set of numbers: what the figures are and are not. */
export function AssumptionsBlock({
  items,
  confidence,
}: {
  items: string[]
  confidence?: { level: string; reason: string }
}) {
  return (
    <div className="space-y-2" data-testid="readiness-assumptions">
      {confidence && (
        <Callout
          tone={
            confidence.level === 'insufficient' || confidence.level === 'low' ? 'warning' : 'cyan'
          }
        >
          <span className="font-medium">History: {confidence.level}.</span> {confidence.reason}
        </Callout>
      )}
      <details className="text-xs opacity-80" open>
        <summary className="cursor-pointer font-medium">How to read these numbers</summary>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {items.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}
