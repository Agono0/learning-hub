'use client'

/**
 * @file InterleavingHUD.tsx
 * @description Real-time Head-Up Display telemetry component for Interleaved Problem Solving & Structural Invariance.
 *
 * Visualizes:
 * - Rohrer & Taylor (2007) Discrimination Metric (RDM: 0 to 100)
 * - Surface Feature Decoy Immunity Rate (%)
 * - Category Confusion Matrix & Error Vectors
 * - FSRS Spaced Repetition Interleaved Stability Bonus (1.20x to 2.45x)
 */

import React from 'react'
import {
  InterleavingSessionMetrics,
  ProblemCategory,
} from '@learning-hub/core/interleaving/structural-invariance-engine'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Flame,
  Gauge,
  HelpCircle,
  Shuffle,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'

export interface InterleavingHUDProps {
  metrics: InterleavingSessionMetrics
  currentProblemIndex: number
  totalProblems: number
  activeCategoryName?: ProblemCategory | null
  activeMode: 'blocked' | 'interleaved' | 'adaptive_contrast'
  className?: string
}

export function InterleavingHUD({
  metrics,
  currentProblemIndex,
  totalProblems,
  activeCategoryName,
  activeMode,
  className = '',
}: InterleavingHUDProps) {
  const rdi = metrics.rohrerDiscriminationIndex
  const immunityPct = Math.round(metrics.surfaceFeatureImmunityRate * 100)

  // Status badges based on RDI
  const getRDIBadge = () => {
    if (rdi >= 80) {
      return (
        <Badge tone="success" className="gap-1.5 px-2.5 py-0.5">
          <Sparkles className="h-3 w-3 text-emerald-400" />
          <span>Expert Schema Invariance ({rdi}/100)</span>
        </Badge>
      )
    }
    if (rdi >= 50) {
      return (
        <Badge tone="warning" className="gap-1.5 px-2.5 py-0.5">
          <Brain className="h-3 w-3 text-amber-400" />
          <span>Intermediate Discrimination ({rdi}/100)</span>
        </Badge>
      )
    }
    return (
      <Badge tone="neutral" className="gap-1.5 px-2.5 py-0.5">
        <AlertTriangle className="h-3 w-3 text-rose-400" />
        <span>Surface-Feature Vulnerable ({rdi}/100)</span>
      </Badge>
    )
  }

  const getModeLabel = () => {
    switch (activeMode) {
      case 'adaptive_contrast':
        return {
          label: 'Adaptive Contrast Juxtaposition',
          color: 'text-violet-400',
          badgeTone: 'violet' as const,
        }
      case 'interleaved':
        return {
          label: 'Shuffled Interleaving (Rohrer 2007)',
          color: 'text-cyan-400',
          badgeTone: 'cyan' as const,
        }
      case 'blocked':
        return {
          label: 'Blocked Practice (AAA-BBB)',
          color: 'text-amber-400',
          badgeTone: 'warning' as const,
        }
    }
  }

  const modeInfo = getModeLabel()

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md transition-all ${className}`}
    >
      {/* Top Bar: Sequence Progress & Mode */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/25">
            <Shuffle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Problem {currentProblemIndex + 1} of {totalProblems}
              </span>
              <Badge tone={modeInfo.badgeTone} className="text-[10px]">
                {modeInfo.label}
              </Badge>
            </div>
            <h3 className="text-sm font-bold text-slate-100">
              {activeCategoryName
                ? activeCategoryName.replace(/_/g, ' ').toUpperCase()
                : 'Selecting Strategy'}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">{getRDIBadge()}</div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Metric 1: Rohrer Discrimination Index */}
        <div className="flex flex-col rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Rohrer Index (RDI)</span>
            <Gauge className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-100">{rdi}</span>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={rdi / 100} />
          </div>
        </div>

        {/* Metric 2: Surface Decoy Immunity */}
        <div className="flex flex-col rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Decoy Immunity</span>
            <Target className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-100">{immunityPct}%</span>
            <span className="text-xs text-slate-500">resisted</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={immunityPct / 100} />
          </div>
        </div>

        {/* Metric 3: Category Accuracy */}
        <div className="flex flex-col rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Accuracy</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-100">
              {metrics.correctCategories}
            </span>
            <span className="text-xs text-slate-500">/ {metrics.totalAttempts || 0}</span>
          </div>
          <div className="mt-2">
            <ProgressBar
              value={
                metrics.totalAttempts > 0 ? metrics.correctCategories / metrics.totalAttempts : 0
              }
            />
          </div>
        </div>

        {/* Metric 4: Decoys Trapped */}
        <div className="flex flex-col rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Traps Sprung</span>
            <Flame className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-slate-100">
              {metrics.decoyTrapsFellInto}
            </span>
            <span className="text-xs text-slate-500">surface traps</span>
          </div>
          <div className="mt-2">
            <span className="text-[11px] text-slate-400">
              {metrics.decoyTrapsFellInto === 0
                ? 'Zero traps triggered'
                : `${metrics.decoyTrapsFellInto} novice surface errors`}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Banner: FSRS Retention & Inductive Learning Guidance */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-900/30 bg-violet-950/20 px-3.5 py-2.5 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-400" />
          <span>
            <strong>FSRS Interleaved Multiplier:</strong> Mastery under interleaved conditions
            grants{' '}
            <span className="font-semibold text-emerald-400">
              +{Math.round((rdi / 100) * 110)}%
            </span>{' '}
            memory stability bonus over blocked drill.
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
          <span>Kornell & Bjork (2008) Inductive Juxtaposition</span>
        </div>
      </div>
    </div>
  )
}
