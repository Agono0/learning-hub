/**
 * Learning HUB — Self-Regulated Learning (SRL) & Metacognitive Matrix HUD
 *
 * Visualizes Barry J. Zimmerman's (2000, 2002) Tripartite Cyclical Model,
 * Paul Pintrich's (2004) SRL Domains, and Bernard Weiner's (1986) Causal Attribution.
 */

'use client'

import React from 'react'
import { type SRLCyclicalPhase, type SRLSessionMetrics } from '@learning-hub/core/srl'
import { Badge, Panel, ProgressBar } from '@/ui'
import { CheckCircle2, Compass, Flame, Gauge, Shield, Target } from 'lucide-react'

export interface SelfRegulatedLearningHUDProps {
  readonly activePhase: SRLCyclicalPhase
  readonly metrics: SRLSessionMetrics
  readonly challengeTitle: string
  readonly onPhaseSelect?: (phase: SRLCyclicalPhase) => void
}

const PHASE_CONFIG: Record<
  SRLCyclicalPhase,
  { label: string; desc: string; tone: 'accent' | 'warning' | 'violet' }
> = {
  forethought: {
    label: '1. Forethought & Task Analysis',
    desc: 'Goal setting, strategic planning, and self-efficacy calibration',
    tone: 'accent',
  },
  performance_control: {
    label: '2. Performance & Volitional Control',
    desc: 'Self-instruction, attention focusing, and strategy monitoring',
    tone: 'warning',
  },
  self_reflection: {
    label: '3. Self-Reflection & Attribution',
    desc: 'Self-evaluation against standards and Weiner causal attribution',
    tone: 'violet',
  },
}

const TIER_CONFIG: Record<
  SRLSessionMetrics['currentMaturityTier'],
  { label: string; tone: 'neutral' | 'accent' | 'warning' | 'success'; desc: string }
> = {
  naive_regulator: {
    label: 'Naive Regulator',
    tone: 'neutral',
    desc: 'Passive or reactive study habits with low strategic forethought',
  },
  emerging_regulator: {
    label: 'Emerging Regulator',
    tone: 'accent',
    desc: 'Sets proximal goals but susceptible to volitional distraction',
  },
  strategic_regulator: {
    label: 'Strategic Regulator',
    tone: 'warning',
    desc: 'Active volitional control and adaptive internal attribution',
  },
  autonomous_master: {
    label: 'Autonomous Master',
    tone: 'success',
    desc: 'Flawless closed-loop self-regulation with resilient causal framing',
  },
}

export function SelfRegulatedLearningHUD({
  activePhase,
  metrics,
  challengeTitle,
  onPhaseSelect,
}: SelfRegulatedLearningHUDProps) {
  const phaseInfo = PHASE_CONFIG[activePhase]
  const tierInfo = TIER_CONFIG[metrics.currentMaturityTier]

  const maturityPercent = Math.min(100, Math.round(metrics.cyclicalMaturityIndex * 100))
  const forethoughtPercent = Math.min(100, Math.round(metrics.forethoughtPlanningQuality * 100))
  const volitionalPercent = Math.min(100, Math.round(metrics.volitionalControlEfficiency * 100))
  const attributionPercent = Math.min(100, Math.round(metrics.attributionalResilienceScore * 100))

  return (
    <Panel className="p-5 shadow-sm space-y-5">
      {/* Top Header & Zimmerman Cycle Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-secondary">
              Zimmerman &amp; Pintrich Self-Regulated Learning HUD
            </span>
            <Badge tone={phaseInfo.tone}>{phaseInfo.label}</Badge>
            <Badge tone={tierInfo.tone}>{tierInfo.label}</Badge>
          </div>
          <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
            <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Task: {challengeTitle}
          </h3>
        </div>

        {/* GAS Goal Attainment Scale Badge */}
        <div className="flex items-center gap-2">
          <Badge
            tone={
              metrics.goalAttainmentScale >= 1
                ? 'success'
                : metrics.goalAttainmentScale === 0
                  ? 'accent'
                  : 'danger'
            }
          >
            GAS Attainment:{' '}
            {metrics.goalAttainmentScale > 0
              ? `+${metrics.goalAttainmentScale}`
              : metrics.goalAttainmentScale}
          </Badge>
        </div>
      </div>

      {/* Tripartite Cyclical Progress Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['forethought', 'performance_control', 'self_reflection'] as const).map((phase, idx) => {
          const isCurrent = activePhase === phase
          const isCompleted =
            phase === 'forethought'
              ? metrics.isForethoughtComplete
              : phase === 'performance_control'
                ? metrics.isPerformanceComplete
                : metrics.isReflectionComplete

          return (
            <button
              key={phase}
              type="button"
              onClick={() => onPhaseSelect?.(phase)}
              className={`text-left rounded-xl border p-3 text-xs transition-all ${
                isCurrent
                  ? 'border-indigo-500/50 bg-indigo-500/10 shadow-sm'
                  : 'border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50/60 dark:bg-(--hub-panel-2)/60 hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'
              }`}
            >
              <div className="flex items-center justify-between pb-1">
                <span className="font-bold text-strong flex items-center gap-1.5">
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px] font-mono">
                      {idx + 1}
                    </span>
                  )}
                  {PHASE_CONFIG[phase].label}
                </span>
                {isCurrent && <Badge tone="accent">Current</Badge>}
              </div>
              <p className="text-[11px] text-secondary line-clamp-1">{PHASE_CONFIG[phase].desc}</p>
            </button>
          )
        })}
      </div>

      {/* 4 Core Quantitative Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* Metric 1: Cyclical Maturity Index */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-3.5 space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-indigo-500" />
              SRL Maturity Index
            </span>
            <span className="font-mono text-strong">
              {metrics.cyclicalMaturityIndex.toFixed(2)}
            </span>
          </div>
          <ProgressBar value={maturityPercent} />
          <p className="text-[11px] text-tertiary">
            Zimmerman (2000) tripartite cyclical regulatory index.
          </p>
        </div>

        {/* Metric 2: Forethought Quality */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-3.5 space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-cyan-500" />
              Forethought Quality
            </span>
            <span className="font-mono text-strong">
              {Math.round(metrics.forethoughtPlanningQuality * 100)}%
            </span>
          </div>
          <ProgressBar value={forethoughtPercent} />
          <p className="text-[11px] text-tertiary">
            Winne &amp; Hadwin COPES goal specificity and planning.
          </p>
        </div>

        {/* Metric 3: Volitional Control Efficiency */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-3.5 space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-amber-500" />
              Volitional Control
            </span>
            <span className="font-mono text-strong">
              {Math.round(metrics.volitionalControlEfficiency * 100)}%
            </span>
          </div>
          <ProgressBar value={volitionalPercent} />
          <p className="text-[11px] text-tertiary">
            Corno (1993) strategy adherence against distraction.
          </p>
        </div>

        {/* Metric 4: Attributional Resilience */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-3.5 space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              Attribution Resilience
            </span>
            <span className="font-mono text-strong">
              {Math.round(metrics.attributionalResilienceScore * 100)}%
            </span>
          </div>
          <ProgressBar value={attributionPercent} />
          <p className="text-[11px] text-tertiary">
            Weiner (1986) internal-controllable adaptive causal style.
          </p>
        </div>
      </div>
    </Panel>
  )
}
