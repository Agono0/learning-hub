/**
 * Learning HUB — Cognitive Load Theory (CLT) & Flow State HUD
 *
 * Grounded in peer-reviewed cognitive psychometrics:
 * 1. Sweller (1988, 2011) Tripartite Cognitive Load (Intrinsic, Extraneous, Germane vs Cowan 4-chunk limit)
 * 2. Paas & Van Merriënboer (1993) 2D Instructional Cognitive Efficiency (E-score)
 * 3. Csikszentmihalyi (1990) Flow Channel & Yerkes-Dodson (1908) Inverted-U Arousal
 * 4. FSRS-6 Dynamic Spaced Repetition Modulation
 */

import React from 'react'
import type { ComprehensiveCognitiveLoadEvaluation } from '@learning-hub/core/cognitive-load'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  Activity,
  AlertTriangle,
  Award,
  Brain,
  CheckCircle2,
  Cpu,
  Flame,
  Layers,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

export interface CognitiveLoadFlowHUDProps {
  evaluation: ComprehensiveCognitiveLoadEvaluation
  activeScenarioTitle?: string
  className?: string
}

export function CognitiveLoadFlowHUD({
  evaluation,
  activeScenarioTitle,
  className = '',
}: CognitiveLoadFlowHUDProps) {
  const {
    cli,
    tripartiteLoad,
    paasEfficiency,
    flowEvaluation,
    recommendedIntervention,
    fsrsModulation,
  } = evaluation

  const flowZoneMeta: Record<
    typeof flowEvaluation.flowZone,
    { label: string; tone: 'neutral' | 'warning' | 'accent' | 'success' | 'danger'; desc: string }
  > = {
    flow: {
      label: 'Optimal Flow Corridor',
      tone: 'success',
      desc: 'Balanced challenge and mastery (Csikszentmihalyi 1990). High schema consolidation.',
    },
    arousal: {
      label: 'Productive Arousal (Stretch)',
      tone: 'accent',
      desc: 'Challenge slightly exceeds mastery. Optimal for rapid schema acquisition.',
    },
    relaxation: {
      label: 'Relaxation Zone',
      tone: 'neutral',
      desc: 'Comfortable mastery. Ready for retrieval generation or challenge escalation.',
    },
    boredom: {
      label: 'Underload / Boredom',
      tone: 'warning',
      desc: 'Trivial task relative to mastery. Accelerate spacing or interleave novel domains.',
    },
    anxiety: {
      label: 'Heightened Anxiety',
      tone: 'warning',
      desc: 'Challenge exceeds working memory capacity. Needs scaffolded subgoals.',
    },
    cognitive_collapse: {
      label: 'Cognitive Overload / Thrashing',
      tone: 'danger',
      desc: 'Working memory overloaded. Immediate worked example step-down required.',
    },
  }

  const currentZone = flowZoneMeta[flowEvaluation.flowZone]

  const quadrantMeta: Record<
    typeof paasEfficiency.quadrant,
    { label: string; tone: 'neutral' | 'warning' | 'accent' | 'success' | 'danger' }
  > = {
    high_efficiency: { label: 'High Efficiency (Schema Automated)', tone: 'success' },
    medium_efficiency: { label: 'Balanced Efficiency', tone: 'accent' },
    low_efficiency: { label: 'Low Efficiency (Friction Strain)', tone: 'warning' },
    critical_thrashing: { label: 'Critical Cognitive Thrashing', tone: 'danger' },
  }

  const currentQuadrant = quadrantMeta[paasEfficiency.quadrant]

  return (
    <Panel
      className={`p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4 ${className}`}
    >
      {/* Header telemetry bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Cognitive Load & Flow State Telemetry
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary font-mono">
                Sweller-Paas-Csikszentmihalyi Engine
              </span>
            </div>
            <h3 className="text-sm font-bold text-strong">
              {activeScenarioTitle || 'Real-Time Working Memory & Flow Diagnostics'}
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={currentZone.tone} className="text-xs font-medium">
            <Flame className="w-3.5 h-3.5 mr-1" />
            {currentZone.label}
          </Badge>
          <Badge tone={currentQuadrant.tone} className="text-xs font-medium">
            <Award className="w-3.5 h-3.5 mr-1" />
            {currentQuadrant.label}
          </Badge>
        </div>
      </div>

      {/* Main 4-metric diagnostic grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Cognitive Load Index (CLI) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Cognitive Load Index</span>
            <Brain className="w-3.5 h-3.5 text-secondary" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">{cli.toFixed(2)}</span>
            <span className="text-xs text-secondary">/ 1.00</span>
          </div>
          <div className="pt-1">
            <ProgressBar value={cli} label="Cognitive Load Index" />
          </div>
        </div>

        {/* Metric 2: Cowan Working Memory Chunks */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>WM Chunk Load</span>
            <Layers className="w-3.5 h-3.5 text-secondary" />
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-xl font-bold font-mono ${tripartiteLoad.isOverloaded ? 'text-danger' : 'text-strong'}`}
            >
              {tripartiteLoad.totalLoadChunks.toFixed(1)}
            </span>
            <span className="text-xs text-secondary">
              / {tripartiteLoad.capacityLimit.toFixed(1)} ch
            </span>
          </div>
          <div className="pt-1">
            <ProgressBar
              value={Math.min(1, tripartiteLoad.totalLoadChunks / tripartiteLoad.capacityLimit)}
              label="Working Memory Chunk Load"
            />
          </div>
        </div>

        {/* Metric 3: Paas Instructional Efficiency (E) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Paas 2D Efficiency</span>
            {paasEfficiency.cognitiveEfficiencyIndex >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-success" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-danger" />
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-xl font-bold font-mono ${
                paasEfficiency.cognitiveEfficiencyIndex >= 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {paasEfficiency.cognitiveEfficiencyIndex > 0 ? '+' : ''}
              {paasEfficiency.cognitiveEfficiencyIndex.toFixed(2)}
            </span>
            <span className="text-xs text-secondary">E score</span>
          </div>
          <p className="text-[10px] text-secondary truncate">
            z(P)={paasEfficiency.performanceZ.toFixed(1)} | z(R)=
            {paasEfficiency.mentalEffortZ.toFixed(1)}
          </p>
        </div>

        {/* Metric 4: Challenge-to-Skill Balance Ratio */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Challenge / Skill</span>
            <Activity className="w-3.5 h-3.5 text-secondary" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {flowEvaluation.challengeToSkillRatio.toFixed(2)}
            </span>
            <span className="text-xs text-secondary">
              ({Math.round(flowEvaluation.flowChannelCoherence * 100)}% match)
            </span>
          </div>
          <div className="pt-1">
            <ProgressBar
              value={flowEvaluation.flowChannelCoherence}
              label="Flow Channel Coherence"
            />
          </div>
        </div>
      </div>

      {/* Tripartite Breakdown & FSRS Modulation Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Tripartite Breakdown Card */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/40 dark:bg-(--hub-panel-2)/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-strong">
              Sweller Tripartite Load Decomposition (Cowan 4-Chunk Limit)
            </span>
            {tripartiteLoad.isOverloaded ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-danger">
                <AlertTriangle className="w-3 h-3" />
                Overload (-{Math.abs(tripartiteLoad.freeWorkingMemoryHeadroom).toFixed(1)} ch)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-success">
                <CheckCircle2 className="w-3 h-3" />+
                {tripartiteLoad.freeWorkingMemoryHeadroom.toFixed(1)} ch headroom
              </span>
            )}
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                Intrinsic Load (Element Interactivity):
              </span>
              <span className="font-mono font-medium text-strong">
                {tripartiteLoad.intrinsicChunks.toFixed(1)} chunks
              </span>
            </div>
            <div className="flex items-center justify-between text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                Extraneous Friction (Format/Noise):
              </span>
              <span className="font-mono font-medium text-strong">
                {tripartiteLoad.extraneousChunks.toFixed(1)} chunks
              </span>
            </div>
            <div className="flex items-center justify-between text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Germane Effort (Schema Abstraction):
              </span>
              <span className="font-mono font-medium text-strong">
                {tripartiteLoad.germaneChunks.toFixed(1)} chunks
              </span>
            </div>
          </div>
        </div>

        {/* FSRS Dynamic Modulation & Micro-Intervention */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/40 dark:bg-(--hub-panel-2)/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-strong">
              FSRS-6 Dynamic Spaced Repetition Calibration
            </span>
            <Badge
              tone={
                recommendedIntervention === 'none'
                  ? 'success'
                  : recommendedIntervention === 'worked_example'
                    ? 'danger'
                    : 'warning'
              }
              className="text-[10px]"
            >
              Intervention: {recommendedIntervention.replace('_', ' ')}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="p-2 rounded bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-center">
              <span className="block text-[10px] text-secondary">Stability</span>
              <span className="text-xs font-bold font-mono text-strong">
                {fsrsModulation.stabilityMultiplier.toFixed(2)}x
              </span>
            </div>
            <div className="p-2 rounded bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-center">
              <span className="block text-[10px] text-secondary">Difficulty Δ</span>
              <span className="text-xs font-bold font-mono text-strong">
                {fsrsModulation.difficultyDelta > 0 ? '+' : ''}
                {fsrsModulation.difficultyDelta.toFixed(1)}
              </span>
            </div>
            <div className="p-2 rounded bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-center">
              <span className="block text-[10px] text-secondary">Interval Mult</span>
              <span className="text-xs font-bold font-mono text-strong">
                {fsrsModulation.recommendedIntervalFactor.toFixed(2)}x
              </span>
            </div>
          </div>

          <p className="text-[11px] text-secondary leading-tight line-clamp-1">
            {evaluation.recommendedScaffoldStage.instruction}
          </p>
        </div>
      </div>
    </Panel>
  )
}
