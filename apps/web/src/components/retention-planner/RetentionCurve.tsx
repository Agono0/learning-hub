import type { GridPoint } from '@learning-hub/core'
import { formatMinutes, pct } from './types'

/** Mean daily minutes per tested retention. Plain SVG, no animation. */
export function RetentionCurve({ points, budget }: { points: GridPoint[]; budget: number }) {
  if (points.length === 0) return null
  const w = 360
  const h = 160
  const pad = { l: 36, r: 10, t: 10, b: 24 }
  const max = Math.max(budget, ...points.map((p) => p.meanDailyMinutes)) * 1.1 || 1
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, points.length - 1)
  const y = (v: number) => h - pad.b - (v / max) * (h - pad.t - pad.b)
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.meanDailyMinutes)}`)
    .join(' ')
  const summary = points
    .map((p) => `${pct(p.retention)}: ${formatMinutes(p.meanDailyMinutes)}`)
    .join(', ')
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Modeled mean daily review minutes by retention. ${summary}. Budget ${budget} minutes.`}
        className="h-auto w-full"
        data-testid="retention-curve"
      >
        <line
          x1={pad.l}
          x2={w - pad.r}
          y1={y(budget)}
          y2={y(budget)}
          stroke="currentColor"
          strokeDasharray="4 3"
          opacity={0.6}
        />
        <text x={w - pad.r} y={y(budget) - 4} textAnchor="end" fontSize="10" fill="currentColor">
          budget {budget} min
        </text>
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} />
        {points.map((p, i) => (
          <g key={p.retention}>
            <circle
              cx={x(i)}
              cy={y(p.meanDailyMinutes)}
              r={4}
              fill="currentColor"
              opacity={p.fitsBudget ? 1 : 0.45}
            />
            <text x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fill="currentColor">
              {Math.round(p.retention * 100)}
            </text>
          </g>
        ))}
        <text x={pad.l - 4} y={pad.t + 6} textAnchor="end" fontSize="10" fill="currentColor">
          {Math.round(max)}
        </text>
        <text x={pad.l - 4} y={h - pad.b} textAnchor="end" fontSize="10" fill="currentColor">
          0
        </text>
      </svg>
      <figcaption className="text-xs text-tertiary">
        Desired retention (%) against modeled mean daily minutes. Faded points are over budget.
      </figcaption>
    </figure>
  )
}
