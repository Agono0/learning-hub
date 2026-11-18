import React from 'react'
import { GitFork, ShieldCheck, Zap, AlertTriangle, Compass, Layers } from 'lucide-react'
import { Badge } from './Feedback'
import type { CausalLadderLevel } from '@learning-hub/core'

export interface CounterfactualHUDProps {
  ladderLevel: CausalLadderLevel
  masteryScore: number // 0 to 100
  activeInterventionsCount: number
  lastCausalLift?: number
  isBackdoorAdmissible?: boolean
  confounderRisk?: 'LOW' | 'MODERATE' | 'HIGH'
  interventionSummary?: string
}

export function CounterfactualHUD({
  ladderLevel,
  masteryScore,
  activeInterventionsCount,
  lastCausalLift,
  isBackdoorAdmissible = true,
  confounderRisk = 'LOW',
  interventionSummary = 'Graph surgery do(X=x) active with unconfounded backdoor closure.',
}: CounterfactualHUDProps) {
  const getLadderTone = (): 'success' | 'accent' | 'warning' | 'neutral' => {
    if (ladderLevel === 'L3_COUNTERFACTUAL') return 'success'
    if (ladderLevel === 'L2_INTERVENTIONAL') return 'accent'
    return 'warning'
  }

  const getLadderLabel = () => {
    if (ladderLevel === 'L3_COUNTERFACTUAL') return 'LEVEL 3: COUNTERFACTUAL IMAGINING'
    if (ladderLevel === 'L2_INTERVENTIONAL') return 'LEVEL 2: INTERVENTIONAL DO-CALCULUS'
    return 'LEVEL 1: ASSOCIATIONAL OBSERVATION'
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 dark:border-(--hub-border) pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-status-success-text dark:text-status-success-text">
            <GitFork className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Pearl’s Ladder of Causation (2000, 2009)
            </div>
            <div className="text-sm font-medium text-strong">
              Structural Causal Inference & Counterfactual Engine
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={getLadderTone()}>{getLadderLabel()}</Badge>
          <div className="flex items-baseline gap-1 bg-neutral-50 dark:bg-(--hub-sunken) px-2.5 py-1 rounded-md border border-neutral-200 dark:border-(--hub-border)">
            <span className="text-xs text-secondary">Causal Fluency:</span>
            <span className="text-base font-bold text-strong">{`${masteryScore}%`}</span>
          </div>
        </div>
      </div>

      {/* Grid of Key Causal Telemetry Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Metric 1: Causal Lift */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Zap className="h-3.5 w-3.5 text-status-warning-text" />
              Counterfactual Lift
            </span>
            <span className="text-xs font-semibold text-strong">
              {lastCausalLift !== undefined
                ? `${lastCausalLift > 0 ? '+' : ''}${lastCausalLift} pts`
                : 'Baseline'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(15, (lastCausalLift ?? 0) * 4 + 20))}%`,
              }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">
            Difference from factual baseline holding U invariant
          </div>
        </div>

        {/* Metric 2: Interventions & Graph Surgery */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Layers className="h-3.5 w-3.5 text-blue-500" />
              Graph Surgery do(X)
            </span>
            <span className="text-xs font-semibold text-strong">
              {`${activeInterventionsCount} Active`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, activeInterventionsCount * 33)}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">
            Incoming parent arrows severed in mutilated DAG
          </div>
        </div>

        {/* Metric 3: Backdoor Criterion Status */}
        <div className="rounded-lg p-3 border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <ShieldCheck className="h-3.5 w-3.5 text-status-success-text" />
              Backdoor Admissibility
            </span>
            <span
              className={`text-xs font-semibold ${isBackdoorAdmissible ? 'text-status-success-text dark:text-status-success-text' : 'text-danger-text dark:text-danger-text'}`}
            >
              {isBackdoorAdmissible ? 'Admissible' : 'Confounded'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className={`h-full rounded-full ${isBackdoorAdmissible ? 'bg-emerald-500' : 'bg-rose-500'} w-full`}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">
            {isBackdoorAdmissible
              ? 'All backdoor paths blocked by conditioning set'
              : 'Confounded by unblocked backdoors or descendant conditioning'}
          </div>
        </div>
      </div>

      {/* Summary Narrative Banner */}
      <div className="flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-2.5 border border-neutral-200 dark:border-(--hub-border) text-xs">
        <div className="flex items-center gap-2 truncate">
          {confounderRisk === 'HIGH' ? (
            <AlertTriangle className="h-4 w-4 text-danger-text shrink-0" />
          ) : (
            <Compass className="h-4 w-4 text-status-success-text shrink-0" />
          )}
          <div className="truncate">
            <div className="font-medium text-strong truncate">Causal Invariance Status</div>
            <div className="text-[11px] text-secondary truncate">{interventionSummary}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
