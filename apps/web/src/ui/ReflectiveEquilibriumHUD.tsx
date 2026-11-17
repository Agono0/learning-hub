'use client'

/**
 * @file apps/web/src/ui/ReflectiveEquilibriumHUD.tsx
 * @description Telemetry HUD for Reflective Equilibrium & Epistemic Probability Calibration.
 *
 * Implements:
 * - John Rawls (1971) & Nelson Goodman (1955) Wide Reflective Equilibrium Coherence Metric
 * - Glenn W. Brier (1950) & Philip Tetlock (2005) Probability Calibration Index (BCI)
 * - Overconfidence Bias & Epistemic Rigidity Detection
 */

import React from 'react'
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  GitBranch,
  Network,
  Scale,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react'
import {
  EpistemicTierType,
  ReflectiveEquilibriumEvaluation,
} from '@learning-hub/core/equilibrium/reflective-equilibrium-engine'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'

export interface ReflectiveEquilibriumHUDProps {
  evaluation: ReflectiveEquilibriumEvaluation
  activeTier: EpistemicTierType
  onSelectTier?: (tier: EpistemicTierType) => void
}

const TIER_CONFIG: Record<
  EpistemicTierType,
  { label: string; icon: React.ElementType; color: string; desc: string }
> = {
  considered_judgment: {
    label: 'Considered Judgments (C)',
    icon: Scale,
    color: 'text-amber-400',
    desc: 'Concrete case intuitions & settled moral/practical observations',
  },
  general_principle: {
    label: 'General Principles (P)',
    icon: GitBranch,
    color: 'text-cyan-400',
    desc: 'Abstract normative rules, systemic axioms & algorithmic invariants',
  },
  background_theory: {
    label: 'Background Theories (B)',
    icon: Brain,
    color: 'text-violet-400',
    desc: 'Broad scientific, mathematical, and explanatory frameworks (e.g. CAP, Bayes)',
  },
}

export function ReflectiveEquilibriumHUD({
  evaluation,
  activeTier,
  onSelectTier,
}: ReflectiveEquilibriumHUDProps) {
  const brierPercent = Math.round(evaluation.brierMetrics.brierCalibrationIndex * 100)
  const isOverconfident = evaluation.brierMetrics.overconfidenceGap > 0.12

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md">
      {/* Top Epistemic Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Metric 1: Coherence Index */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-cyan-400" />
              Coherence (H)
            </span>
            <span className="font-mono text-cyan-300">{evaluation.coherenceIndex}%</span>
          </div>
          <ProgressBar value={evaluation.coherenceIndex / 100} />
          <span className="text-[10px] text-slate-500">
            {evaluation.unresolvedContradictionCount} unresolved contradiction(s)
          </span>
        </div>

        {/* Metric 2: Brier Calibration Index (BCI) */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-violet-400" />
              Brier Index (BCI)
            </span>
            <span className="font-mono text-violet-300">{brierPercent}%</span>
          </div>
          <ProgressBar value={evaluation.brierMetrics.brierCalibrationIndex} />
          <span className="text-[10px] text-slate-500">
            Score: {evaluation.brierMetrics.brierScore.toFixed(3)} (0=perfect)
          </span>
        </div>

        {/* Metric 3: Calibration Gap & Overconfidence */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              Confidence Gap
            </span>
            <span className={`font-mono ${isOverconfident ? 'text-rose-400' : 'text-emerald-300'}`}>
              {(evaluation.brierMetrics.overconfidenceGap * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar
            value={Math.max(0, Math.min(1, 1 - evaluation.brierMetrics.overconfidenceGap))}
          />
          <span className="text-[10px] text-slate-500 truncate">
            {evaluation.brierMetrics.calibrationGrade}
          </span>
        </div>

        {/* Metric 4: Composite Epistemic Mastery */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              Epistemic Score
            </span>
            <span className="font-mono text-emerald-300">
              {evaluation.compositeEpistemicScore}/100
            </span>
          </div>
          <ProgressBar value={evaluation.compositeEpistemicScore / 100} />
          <span className="text-[10px] text-slate-500">
            {evaluation.isEquilibriumAchieved
              ? 'Equilibrium Achieved'
              : 'Reconciliation in progress'}
          </span>
        </div>
      </div>

      {/* Equilibrium Status Banner */}
      {evaluation.isEquilibriumAchieved ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs leading-relaxed text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div>
            <span className="font-bold uppercase tracking-wider text-emerald-300">
              Wide Reflective Equilibrium Attained:
            </span>{' '}
            Your considered judgments, general principles, and background theories mutually
            reinforce each other without active structural contradictions.
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="font-bold uppercase tracking-wider text-amber-300">
              Active Triad Conflict:
            </span>{' '}
            {evaluation.feedbackSummary}
          </div>
        </div>
      )}

      {/* Epistemic Tier Selector Buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Rawls Epistemic Tiers (Wide Reflective Equilibrium)
          </span>
          <Badge tone="neutral" className="text-[10px]">
            Active Epistemic Tier
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(Object.keys(TIER_CONFIG) as EpistemicTierType[]).map((tier) => {
            const config = TIER_CONFIG[tier]
            const isSelected = activeTier === tier
            const Icon = config.icon

            return (
              <button
                key={tier}
                type="button"
                onClick={() => onSelectTier?.(tier)}
                className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-cyan-500/50 bg-cyan-950/30 ring-2 ring-cyan-400/40 shadow-md'
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
                  <span
                    className={`text-xs font-bold truncate ${
                      isSelected ? 'text-cyan-300' : 'text-slate-200'
                    }`}
                  >
                    {config.label}
                  </span>
                </div>
                <span className="text-[11px] leading-tight text-slate-400">{config.desc}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
