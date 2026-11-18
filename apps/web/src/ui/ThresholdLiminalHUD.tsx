import React from 'react'
import { Sparkles, KeyRound, AlertTriangle, CheckCircle2, Compass, Layers } from 'lucide-react'
import { Badge } from './Feedback'
import type { LiminalPhase } from '@learning-hub/core'

export interface ThresholdLiminalHUDProps {
  phase: LiminalPhase
  fluencyScore: number // 0 to 100%
  mimicryRiskScore: number // 0 to 100%
  oscillationStability: number // 0 to 100%
  unlockedDownstreamCount: number
  canCrossPortal?: boolean
  remediationSummary?: string
}

export function ThresholdLiminalHUD({
  phase,
  fluencyScore,
  mimicryRiskScore,
  oscillationStability,
  unlockedDownstreamCount,
  canCrossPortal = false,
  remediationSummary = 'Portal crossed: Troublesome knowledge transformed into irreversible intuitive schema.',
}: ThresholdLiminalHUDProps) {
  const getPhaseTone = (): 'success' | 'warning' | 'neutral' => {
    if (phase === 'POST_LIMINAL_TRANSFORMED') return 'success'
    if (phase === 'LIMINAL_OSCILLATING') return 'warning'
    return 'neutral'
  }

  const getPhaseLabel = () => {
    if (phase === 'POST_LIMINAL_TRANSFORMED') return 'PORTAL CROSSED (POST-LIMINAL)'
    if (phase === 'LIMINAL_OSCILLATING') return 'IN LIMINAL SPACE (OSCILLATING)'
    return 'PRE-LIMINAL (INTUITIVE)'
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 dark:border-(--hub-border) pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Meyer &amp; Land (2003, 2005) Pedagogical Gateways
            </div>
            <div className="text-sm font-medium text-strong">
              Threshold Concepts &amp; Liminal Space Navigation
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={getPhaseTone()}>{getPhaseLabel()}</Badge>
          <div className="flex items-baseline gap-1 bg-neutral-50 dark:bg-(--hub-sunken) px-2.5 py-1 rounded-md border border-neutral-200 dark:border-(--hub-border)">
            <span className="text-xs text-secondary">Portal Fluency:</span>
            <span className="text-base font-bold text-strong">{`${fluencyScore}%`}</span>
          </div>
        </div>
      </div>

      {/* Grid of Key Liminal Telemetry Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Metric 1: Mimicry Risk */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              Ritualized Mimicry Risk
            </span>
            <span
              className={`text-xs font-semibold ${mimicryRiskScore > 30 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}
            >
              {`${mimicryRiskScore}%`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${mimicryRiskScore > 30 ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, Math.max(0, mimicryRiskScore))}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">
            {mimicryRiskScore > 0
              ? 'Vulnerable to surface formula reproduction without insight'
              : 'Authentic ontological transformation'}
          </div>
        </div>

        {/* Metric 2: Oscillation Stability */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Compass className="h-3.5 w-3.5 text-blue-500" />
              Liminal Stability
            </span>
            <span className="text-xs font-semibold text-strong">{`${oscillationStability}%`}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, oscillationStability))}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">
            Equilibrium between intuitive doubt and formal schema
          </div>
        </div>

        {/* Metric 3: Downstream Unlocked Knowledge */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Layers className="h-3.5 w-3.5 text-indigo-500" />
              Gateway Multiplier
            </span>
            <span className="text-xs font-semibold text-strong">
              {`${unlockedDownstreamCount} Unlocked`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${Math.min(100, unlockedDownstreamCount * 25)}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">
            Downstream competencies unblocked in curriculum graph
          </div>
        </div>
      </div>

      {/* Trajectory Status Banner */}
      <div className="flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-2.5 border border-neutral-200 dark:border-(--hub-border) text-xs">
        <div className="flex items-center gap-2 truncate">
          {canCrossPortal ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <div className="truncate">
            <div className="font-medium text-strong truncate">Liminal Navigation Guidance</div>
            <div className="text-[11px] text-secondary truncate">{remediationSummary}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
