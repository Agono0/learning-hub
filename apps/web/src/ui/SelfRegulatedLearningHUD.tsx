import React from 'react'
import { Target, Activity, Compass, Flame, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Badge } from './Feedback'

export interface SelfRegulatedLearningHUDProps {
  forethoughtScore: number
  volitionalScore: number
  selfReflectionScore: number
  compositeIndex: number
  maturityLevel: 'novice' | 'competent' | 'proficient' | 'expert_self_regulated'
  controllableAttributionRatio: number
  topStrength?: string
  criticalBottleneck?: string
  activePhase?: 'forethought' | 'volition' | 'self_reflection'
}

export function SelfRegulatedLearningHUD({
  forethoughtScore,
  volitionalScore,
  selfReflectionScore,
  compositeIndex,
  maturityLevel,
  controllableAttributionRatio,
  topStrength,
  criticalBottleneck,
  activePhase = 'forethought',
}: SelfRegulatedLearningHUDProps) {
  const getMaturityColor = (): 'success' | 'accent' | 'warning' | 'neutral' => {
    switch (maturityLevel) {
      case 'expert_self_regulated':
        return 'success'
      case 'proficient':
        return 'accent'
      case 'competent':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  const formatMaturityLabel = (lvl: string) => {
    return lvl.replace(/_/g, ' ').toUpperCase()
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 dark:border-(--hub-border) pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Compass className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Zimmerman Metacognitive Matrix
            </div>
            <div className="text-sm font-medium text-strong">
              Cyclical Self-Regulation Engine (SRL)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={getMaturityColor()}>{formatMaturityLabel(maturityLevel)}</Badge>
          <div className="flex items-baseline gap-1 bg-neutral-50 dark:bg-(--hub-sunken) px-2.5 py-1 rounded-md border border-neutral-200 dark:border-(--hub-border)">
            <span className="text-xs text-secondary">SRL Index:</span>
            <span className="text-base font-bold text-strong">{compositeIndex}%</span>
          </div>
        </div>
      </div>

      {/* Zimmerman 3-Phase Cyclical Arc */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Phase 1: Forethought */}
        <div
          className={`rounded-lg p-3 border transition-colors ${
            activePhase === 'forethought'
              ? 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20'
              : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Target className="h-3.5 w-3.5 text-blue-500" />
              1. Forethought
            </span>
            <span className="text-xs font-semibold text-strong">{forethoughtScore}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, forethoughtScore))}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">Task analysis & efficacy</div>
        </div>

        {/* Phase 2: Volitional Performance */}
        <div
          className={`rounded-lg p-3 border transition-colors ${
            activePhase === 'volition'
              ? 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              2. Volition & Focus
            </span>
            <span className="text-xs font-semibold text-strong">{volitionalScore}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, volitionalScore))}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">Self-control & attention</div>
        </div>

        {/* Phase 3: Self-Reflection */}
        <div
          className={`rounded-lg p-3 border transition-colors ${
            activePhase === 'self_reflection'
              ? 'border-violet-500/50 bg-violet-50/50 dark:bg-violet-950/20'
              : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken)'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <Flame className="h-3.5 w-3.5 text-violet-500" />
              3. Self-Reflection
            </span>
            <span className="text-xs font-semibold text-strong">{selfReflectionScore}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, selfReflectionScore))}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary">Weiner causal attribution</div>
        </div>
      </div>

      {/* Telemetry sub-row: Weiner Attribution & MSLQ Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
        {/* Attributional Balance */}
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-2.5 border border-neutral-200 dark:border-(--hub-border)">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <div>
              <div className="font-medium text-strong">Adaptive Causal Attributions</div>
              <div className="text-[11px] text-secondary">
                Effort & Strategy locus (Weiner 1985)
              </div>
            </div>
          </div>
          <span className="font-bold text-strong text-sm">{controllableAttributionRatio}%</span>
        </div>

        {/* Diagnostic Highlight */}
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-2.5 border border-neutral-200 dark:border-(--hub-border)">
          <div className="flex items-center gap-2">
            {criticalBottleneck ? (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
            )}
            <div className="truncate">
              <div className="font-medium text-strong truncate">
                {criticalBottleneck
                  ? `Bottleneck: ${criticalBottleneck}`
                  : 'MSLQ Diagnostic Profile'}
              </div>
              <div className="text-[11px] text-secondary truncate">
                {topStrength
                  ? `Top Strength: ${topStrength}`
                  : 'Pintrich (1991) 15-scale benchmark'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
