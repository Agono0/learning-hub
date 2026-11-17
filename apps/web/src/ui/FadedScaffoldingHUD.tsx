'use client'

import React from 'react'
import { AlertTriangle, Brain, CheckCircle2, Layers, Sparkles, Zap } from 'lucide-react'
import {
  type CognitiveLoadBreakdown,
  type ScaffoldingStage,
  type FadingStrategy,
} from '@learning-hub/core/scaffolding'
import { cx } from './cx'

export interface FadedScaffoldingHUDProps {
  stage: ScaffoldingStage
  strategy: FadingStrategy
  cognitiveLoad: CognitiveLoadBreakdown
  elementInteractivity: number
  domain: string
  problemTitle: string
  activeStepIndex: number
  totalSteps: number
  onStageChange?: (newStage: ScaffoldingStage) => void
  onStrategyChange?: (newStrategy: FadingStrategy) => void
  className?: string
}

export function FadedScaffoldingHUD({
  stage,
  strategy,
  cognitiveLoad,
  elementInteractivity,
  domain,
  problemTitle,
  activeStepIndex,
  totalSteps,
  onStageChange,
  onStrategyChange,
  className,
}: FadedScaffoldingHUDProps) {
  const {
    intrinsicLoad,
    extraneousLoad,
    germaneLoad,
    totalLoad,
    workingMemoryCapacity,
    overloadProbability,
    isOverloaded,
    recommendedIntervention,
  } = cognitiveLoad

  // Cognitive load distribution percentages
  const wmCap = workingMemoryCapacity || 4.0
  const intrinsicPercent = Math.min(100, Math.round((intrinsicLoad / wmCap) * 100))
  const extraneousPercent = Math.min(100, Math.round((extraneousLoad / wmCap) * 100))
  const germanePercent = Math.min(100, Math.round((germaneLoad / wmCap) * 100))

  const stages: { stage: ScaffoldingStage; label: string; desc: string }[] = [
    { stage: 1, label: 'Stage 1: Expert Model', desc: 'Full Worked Example (Read & Study)' },
    { stage: 2, label: 'Stage 2: Backward Faded', desc: 'Complete Final Step (Atkinson Chaining)' },
    { stage: 3, label: 'Stage 3: Forward Faded', desc: 'Bridge Intermediate Lemmas' },
    { stage: 4, label: 'Stage 4: Independent', desc: 'Full Generation with Scaffolding' },
  ]

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl backdrop-blur-xl transition-all',
        isOverloaded ? 'border-amber-500/40 shadow-amber-950/20' : 'border-white/10',
        className,
      )}
    >
      {/* Top Banner: Context and Intervention */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Brain className="h-4 w-4" />
          </span>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Cognitive Load Theory (Renkl-Atkinson Fading)
            </span>
            <span className="text-xs font-bold text-white">
              {domain.replace('_', ' ').toUpperCase()} • {problemTitle}
            </span>
          </div>
        </div>

        {/* Dynamic Cognitive Health Badge */}
        <div className="flex items-center gap-3">
          {isOverloaded ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-300 animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              Cognitive Overload Risk ({Math.round(overloadProbability * 100)}%)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-300">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              Optimal Flow State
            </span>
          )}

          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono font-bold text-slate-200">
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              Step {activeStepIndex} of {totalSteps}
            </span>
          </div>
        </div>
      </div>

      {/* Cognitive Load Telemetry Bar */}
      <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5 sm:grid-cols-4 bg-slate-900/50 text-center text-xs">
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
            Intrinsic Load (IL)
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-base font-black text-sky-300">{intrinsicLoad}</span>
            <span className="text-[10px] text-slate-400 font-mono">/ {wmCap}</span>
          </div>
          <span className="text-[10px] text-slate-500">
            Interactivity: {elementInteractivity}/5
          </span>
        </div>

        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
            Extraneous Load (EL)
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-base font-black text-rose-300">{extraneousLoad}</span>
            <span className="text-[10px] text-slate-400 font-mono">/ {wmCap}</span>
          </div>
          <span className="text-[10px] text-slate-500">
            {extraneousLoad > 1.2 ? 'Split Attention High' : 'Minimal Noise'}
          </span>
        </div>

        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
            Germane Load (GL)
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-base font-black text-emerald-300">{germaneLoad}</span>
            <span className="text-[10px] text-slate-400 font-mono">/ {wmCap}</span>
          </div>
          <span className="text-[10px] text-slate-500">Schema Construction</span>
        </div>

        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
            Working Memory Budget
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span
              className={cx(
                'font-mono text-base font-black',
                totalLoad > wmCap ? 'text-amber-400' : 'text-indigo-300',
              )}
            >
              {totalLoad}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">/ {wmCap} Chunks</span>
          </div>
          <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="bg-sky-500 transition-all duration-300"
              style={{ width: `${Math.min(100, intrinsicPercent)}%` }}
              title="Intrinsic Load"
            />
            <div
              className="bg-rose-500 transition-all duration-300"
              style={{ width: `${Math.min(100, extraneousPercent)}%` }}
              title="Extraneous Load"
            />
            <div
              className="bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, germanePercent)}%` }}
              title="Germane Load"
            />
          </div>
        </div>
      </div>

      {/* Stage Selector Bar: Renkl-Atkinson 4-Stage Continuum */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-slate-950/60 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {stages.map((s) => {
            const isActive = stage === s.stage
            return (
              <button
                key={s.stage}
                onClick={() => onStageChange?.(s.stage)}
                className={cx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all text-xs',
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white',
                )}
                title={s.desc}
              >
                {isActive ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-indigo-200" />
                ) : (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold">
                    {s.stage}
                  </span>
                )}
                <span>{s.label}</span>
              </button>
            )
          })}
        </div>

        {/* Fading Strategy Switcher */}
        {stage === 2 || stage === 3 ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400">Strategy:</span>
            <div className="inline-flex rounded-lg bg-slate-800 p-0.5 text-xs">
              <button
                onClick={() => onStrategyChange?.('backward')}
                className={cx(
                  'rounded-md px-2.5 py-1 text-[11px] font-bold transition-all',
                  strategy === 'backward'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white',
                )}
              >
                Backward (Atkinson)
              </button>
              <button
                onClick={() => onStrategyChange?.('forward')}
                className={cx(
                  'rounded-md px-2.5 py-1 text-[11px] font-bold transition-all',
                  strategy === 'forward'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white',
                )}
              >
                Forward / Lemma
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Recommended Intervention Banner when needed */}
      {recommendedIntervention !== 'optimal_flow' && (
        <div className="border-t border-white/5 bg-indigo-950/30 px-5 py-2 text-xs text-indigo-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              Adaptive Scaffolding Recommendation:{' '}
              <strong className="text-white">
                {recommendedIntervention === 'fade_faster'
                  ? 'Expertise Reversal Detected — advance to Stage 3 or 4 to eliminate redundant explanations.'
                  : recommendedIntervention === 'add_worked_example'
                    ? 'High Search Friction Detected — step down to Stage 1 Worked Example.'
                    : 'Integrate sub-goal representations to eliminate split-attention.'}
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
