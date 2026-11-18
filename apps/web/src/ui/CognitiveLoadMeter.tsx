import type { ReactNode } from 'react'
import { Brain, Zap } from 'lucide-react'
import { Badge } from './Feedback'
import { cx } from './cx'

export interface CognitiveLoadMeterProps {
  /** Overall cognitive load percentage (0 to 100) */
  totalLoad: number
  /** Flow state zone */
  zone?: 'underload' | 'optimal_flow' | 'overload'
  /** Component breakdowns (percentages summing up to totalLoad or independent) */
  intrinsicLoad?: number
  germaneLoad?: number
  extraneousLoad?: number
  /** Guidance recommendation */
  recommendation?: string
  /** Visual variant */
  variant?: 'glass' | 'standard'
  className?: string
}

const ZONE_CONFIG = {
  optimal_flow: {
    label: 'Optimal Flow Zone',
    badgeTone: 'success' as const,
    barColor: 'bg-emerald-500',
    dotColor: 'bg-emerald-500',
    description: 'Working memory bandwidth is primed for long-term schema acquisition.',
  },
  underload: {
    label: 'Low Challenge / Underload',
    badgeTone: 'cyan' as const,
    barColor: 'bg-sky-500',
    dotColor: 'bg-sky-500',
    description: 'Material lacks sufficient friction; consider escalating drill difficulty.',
  },
  overload: {
    label: 'Cognitive Overload',
    badgeTone: 'danger' as const,
    barColor: 'bg-rose-500',
    dotColor: 'bg-rose-500',
    description: 'Working memory capacity saturated; consider a 5-minute restorative interval.',
  },
}

/**
 * Real-time Cognitive Load HUD conforming to getdesign.md.
 * Grounded in John Sweller's Cognitive Load Theory (CLT).
 */
export function CognitiveLoadMeter({
  totalLoad,
  zone = 'optimal_flow',
  intrinsicLoad = 40,
  germaneLoad = 35,
  extraneousLoad = 10,
  recommendation,
  variant = 'glass',
  className,
}: CognitiveLoadMeterProps): ReactNode {
  const clampedTotal = Math.min(100, Math.max(0, Math.round(totalLoad)))
  const cfg = ZONE_CONFIG[zone] ?? ZONE_CONFIG.optimal_flow

  return (
    <div className={cx(variant === 'glass' ? 'panel-glass' : 'panel', 'p-5 space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              Cognitive Load Telemetry
              <Badge tone={cfg.badgeTone} pulse={zone === 'optimal_flow'}>
                {cfg.label}
              </Badge>
            </h3>
            <p className="text-xs text-tertiary dark:text-faint">
              Sweller working memory capacity index
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {clampedTotal}%
          </div>
          <div className="text-[11px] text-faint">Total Bandwidth</div>
        </div>
      </div>

      {/* Segmented load gauge */}
      <div className="space-y-1.5">
        <div className="h-2.5 w-full rounded-full bg-neutral-200/60 dark:bg-neutral-800/80 overflow-hidden flex">
          <div
            style={{ width: `${Math.min(100, germaneLoad)}%` }}
            className="h-full bg-emerald-500 transition-all duration-500"
            title={`Germane Load: ${germaneLoad}%`}
          />
          <div
            style={{ width: `${Math.min(100, intrinsicLoad)}%` }}
            className="h-full bg-indigo-500 transition-all duration-500"
            title={`Intrinsic Load: ${intrinsicLoad}%`}
          />
          <div
            style={{ width: `${Math.min(100, extraneousLoad)}%` }}
            className="h-full bg-rose-500 transition-all duration-500"
            title={`Extraneous Load: ${extraneousLoad}%`}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-tertiary dark:text-faint pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Germane ({germaneLoad}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            <span>Intrinsic ({intrinsicLoad}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span>Extraneous ({extraneousLoad}%)</span>
          </div>
        </div>
      </div>

      {/* Advisory hint */}
      <div className="rounded-lg bg-neutral-500/5 border border-neutral-200/50 dark:border-neutral-800/60 p-3 text-xs flex items-start gap-2.5">
        <Zap className="h-4 w-4 text-status-warning-text shrink-0 mt-0.5" />
        <div className="text-neutral-600 dark:text-secondary">
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">Advisory: </span>
          {recommendation || cfg.description}
        </div>
      </div>
    </div>
  )
}
