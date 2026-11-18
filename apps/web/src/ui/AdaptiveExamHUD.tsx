'use client'

import React from 'react'
import { Activity, AlertTriangle, Award, Clock, Target } from 'lucide-react'
import {
  calculateProbability3PL,
  thetaToPercentileRank,
  type AdaptiveQuestionItem,
  type MasteryDecision,
} from '@learning-hub/core/practice'
import { cx } from './cx'

export interface AdaptiveExamHUDProps {
  currentTheta: number
  currentSem: number
  targetSem: number
  questionNumber: number
  totalQuestionsLimit: number
  timeRemainingSeconds?: number
  sprtDecision?: MasteryDecision
  currentItem?: AdaptiveQuestionItem | null
  className?: string
}

export function AdaptiveExamHUD({
  currentTheta,
  currentSem,
  targetSem = 0.28,
  questionNumber,
  totalQuestionsLimit,
  timeRemainingSeconds,
  sprtDecision = 'continue',
  currentItem,
  className,
}: AdaptiveExamHUDProps) {
  const percentile = thetaToPercentileRank(currentTheta)

  // Format time remaining mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // SEM convergence ratio (1.0 = fully uncertain, 0.0 = converged to target)
  const initialSem = 1.0
  const semProgress = Math.min(
    100,
    Math.max(0, Math.round(((initialSem - currentSem) / (initialSem - targetSem)) * 100)),
  )

  // Predicted success probability on current item
  const predictedProbability = currentItem
    ? Math.round(
        calculateProbability3PL(
          currentTheta,
          currentItem.discrimination,
          currentItem.difficulty,
          currentItem.guessing,
        ) * 100,
      )
    : null

  const abilityColor =
    currentTheta >= 1.0
      ? 'border-emerald-500/30 bg-emerald-500/10 text-status-success-text'
      : currentTheta >= 0.0
        ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
        : 'border-amber-500/30 bg-amber-500/10 text-status-warning-text'

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl backdrop-blur-xl transition-all',
        className,
      )}
    >
      {/* Top Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Target className="h-4 w-4" />
          </span>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
              Item Response Theory (CAT 3PL)
            </span>
            <span className="text-xs font-bold text-white">
              Question {questionNumber} of {totalQuestionsLimit} (Adaptive Route)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* SPRT Decision Badge */}
          {sprtDecision === 'pass' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-status-success-text animate-pulse">
              <Award className="h-3.5 w-3.5 text-status-success-text" />
              Mastery Verified (SPRT Pass)
            </span>
          ) : sprtDecision === 'fail' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-extrabold text-danger-text">
              <AlertTriangle className="h-3.5 w-3.5 text-danger-text" />
              Remediation Needed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-secondary">
              <Activity className="h-3.5 w-3.5 text-status-info-text" />
              Converging Trajectory
            </span>
          )}

          {/* Timer Pill */}
          {timeRemainingSeconds !== undefined && (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono font-bold text-slate-200">
              <Clock className="h-3.5 w-3.5 text-indigo-400" />
              <span>{formatTime(timeRemainingSeconds)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Real-Time IRT Measurement Gauges */}
      <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5 sm:grid-cols-4 bg-slate-900/50 text-center text-xs">
        {/* Latent Ability (Theta) */}
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-faint block mb-0.5">
            Latent Ability (θ)
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-base font-black text-white">
              {currentTheta > 0 ? `+${currentTheta.toFixed(2)}` : currentTheta.toFixed(2)}
            </span>
            <span
              className={cx('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', abilityColor)}
            >
              {percentile}th %ile
            </span>
          </div>
        </div>

        {/* Standard Error (SEM) */}
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-faint block mb-0.5">
            Measurement Precision (SEM)
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-base font-black text-white">
              ±{currentSem.toFixed(2)}
            </span>
            <span className="text-[10px] text-faint font-mono">
              (target ≤ {targetSem.toFixed(2)})
            </span>
          </div>
        </div>

        {/* Confidence Convergence */}
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-faint block mb-0.5">
            Confidence Convergence
          </span>
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-xs font-bold text-slate-200">
              {semProgress}% Converged
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${semProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Item Difficulty Alignment */}
        <div className="p-3">
          <span className="text-[10px] uppercase font-semibold text-faint block mb-0.5">
            Item Difficulty (b)
          </span>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-mono text-base font-black text-white">
              {currentItem
                ? currentItem.difficulty > 0
                  ? `+${currentItem.difficulty.toFixed(2)}`
                  : currentItem.difficulty.toFixed(2)
                : '0.00'}
            </span>
            {predictedProbability !== null && (
              <span className="text-[10px] text-faint font-mono">(~{predictedProbability}% P)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
