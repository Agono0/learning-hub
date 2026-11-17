'use client'

/**
 * @file MetacognitiveCalibrationHUD.tsx
 * @description Real-time Metacognitive Calibration HUD & Epistemic Shock Telemetry.
 *
 * Visualizes:
 * - Metacognitive Calibration Index (MCI: 0 to 100)
 * - Goodman-Kruskal Gamma (γ: -1.0 to +1.0) resolution gauge
 * - Brier Score & Murphy Reliability / Resolution values
 * - Absolute Overconfidence Bias gauge
 * - Hypercorrection Opportunity Rate & Attention Surge Telemetry (Butterfield & Metcalfe 2001)
 */

import React from 'react'
import {
  MetacognitiveCalibrationProfile,
  CognitiveIllusionType,
} from '@learning-hub/core/metacognition'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'
import { AlertTriangle, Brain, Sparkles, TrendingUp, Zap } from 'lucide-react'

export interface MetacognitiveCalibrationHUDProps {
  profile: MetacognitiveCalibrationProfile
  lastEpistemicSurpriseScore?: number
  isHypercorrectionTriggered?: boolean
  currentIllusion?: CognitiveIllusionType | null
}

const ILLUSION_NAMES: Record<CognitiveIllusionType, string> = {
  fluency_illusion: 'Fluency Illusion (Koriat 2005)',
  intuitive_physics_bias: 'Intuitive Physics Bias (McCloskey 1983)',
  conjunction_fallacy: 'Conjunction Fallacy (Tversky 1983)',
  lexical_familiarity: 'Lexical Familiarity Illusion (Rozenblit 2002)',
  availability_cascade: 'Availability Cascade (Kahneman 1973)',
  gambler_fallacy: 'Gambler Fallacy / Uniformity Bias',
  memory_concurrency_illusion: 'Memory Concurrency Illusion',
}

export function MetacognitiveCalibrationHUD({
  profile,
  lastEpistemicSurpriseScore = 0,
  isHypercorrectionTriggered = false,
  currentIllusion,
}: MetacognitiveCalibrationHUDProps) {
  const {
    metacognitiveCalibrationIndex,
    goodmanKruskalGamma,
    absoluteOverconfidenceBias,
    brierScore,
    hypercorrectionCount,
    status,
    overallAccuracy,
    meanConfidence,
  } = profile

  const getStatusBadge = () => {
    switch (status) {
      case 'expertly_calibrated':
        return <Badge tone="success">Expertly Calibrated</Badge>
      case 'mild_overconfidence':
        return <Badge tone="warning">Mild Overconfidence</Badge>
      case 'severe_fluency_illusion':
        return <Badge tone="danger">Severe Fluency Illusion</Badge>
      case 'underconfident_impostor':
        return <Badge tone="neutral">Underconfident Bias</Badge>
      case 'uncalibrated_guessing':
        return <Badge tone="neutral">Uncalibrated Guessing</Badge>
    }
  }

  const getBiasLabel = () => {
    if (absoluteOverconfidenceBias > 0.05) {
      return `+${Math.round(absoluteOverconfidenceBias * 100)}% (Overconfident)`
    }
    if (absoluteOverconfidenceBias < -0.05) {
      return `${Math.round(absoluteOverconfidenceBias * 100)}% (Underconfident)`
    }
    return `±${Math.round(Math.abs(absoluteOverconfidenceBias) * 100)}% (Balanced)`
  }

  const getBiasColor = () => {
    if (absoluteOverconfidenceBias > 0.2) return 'text-rose-500'
    if (absoluteOverconfidenceBias > 0.08) return 'text-amber-500'
    if (absoluteOverconfidenceBias < -0.15) return 'text-sky-500'
    return 'text-emerald-500'
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur-md">
      {/* Top Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Metacognitive Calibration HUD</h3>
            <p className="text-xs text-muted-foreground">
              Nelson-Narens Monitoring & Butterfield Hypercorrection Dynamics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {hypercorrectionCount > 0 && (
            <Badge tone="warning" className="flex items-center gap-1">
              <Zap className="h-3 w-3 fill-amber-500 text-amber-500" />
              <span>
                {hypercorrectionCount} Hypercorrection{hypercorrectionCount > 1 ? 's' : ''}
              </span>
            </Badge>
          )}
        </div>
      </div>

      {/* Epistemic Shock Alert Banner (Triggered on High-Confidence Error) */}
      {isHypercorrectionTriggered && (
        <div className="mt-3 animate-in fade-in-50 slide-in-from-top-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="text-xs">
              <span className="font-semibold">
                Epistemic Prediction Error Triggered (Shock:{' '}
                {Math.round(lastEpistemicSurpriseScore * 100)}%)!
              </span>{' '}
              High subjective confidence committed to an incorrect conceptual representation. This
              triggers maximal neurocognitive attention surge (Butterfield & Metcalfe 2001) for
              rapid long-term memory correction.
              {currentIllusion && (
                <div className="mt-1 font-medium text-amber-700 dark:text-amber-300">
                  Root Illusion: {ILLUSION_NAMES[currentIllusion] ?? currentIllusion}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metric Tiles Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Metric 1: MCI Composite Score */}
        <div className="rounded-lg border border-border/50 bg-background/50 p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Calibration (MCI)</span>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="mt-1 text-lg font-bold text-foreground">
            {metacognitiveCalibrationIndex}
            <span className="text-xs font-normal text-muted-foreground">/100</span>
          </div>
          <ProgressBar value={metacognitiveCalibrationIndex / 100} className="mt-1.5 h-1.5" />
        </div>

        {/* Metric 2: Goodman-Kruskal Gamma */}
        <div className="rounded-lg border border-border/50 bg-background/50 p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Resolution (γ)</span>
            <TrendingUp className="h-3.5 w-3.5 text-sky-500" />
          </div>
          <div className="mt-1 text-lg font-bold text-foreground">
            {goodmanKruskalGamma >= 0 ? `+${goodmanKruskalGamma}` : goodmanKruskalGamma}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {goodmanKruskalGamma >= 0.5
              ? 'High Discrimination'
              : goodmanKruskalGamma >= 0
                ? 'Moderate'
                : 'Negative (Illusory)'}
          </p>
        </div>

        {/* Metric 3: Confidence Bias */}
        <div className="rounded-lg border border-border/50 bg-background/50 p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Confidence Bias</span>
            <Brain className="h-3.5 w-3.5 text-purple-500" />
          </div>
          <div className={`mt-1 text-lg font-bold ${getBiasColor()}`}>{getBiasLabel()}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Conf {Math.round(meanConfidence * 100)}% vs Acc {Math.round(overallAccuracy * 100)}%
          </p>
        </div>

        {/* Metric 4: Glenn Brier Quadratic Score */}
        <div className="rounded-lg border border-border/50 bg-background/50 p-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Brier Quadratic</span>
            <Zap className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="mt-1 text-lg font-bold text-foreground">{brierScore.toFixed(3)}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {brierScore < 0.15
              ? 'Pinpoint Accuracy'
              : brierScore < 0.3
                ? 'Acceptable'
                : 'High Variance'}
          </p>
        </div>
      </div>
    </div>
  )
}
