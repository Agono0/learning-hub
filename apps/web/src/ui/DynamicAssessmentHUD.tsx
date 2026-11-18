/**
 * Learning HUB — Dynamic Assessment & Zone of Proximal Development HUD
 *
 * Real-time cognitive telemetry tracking:
 * - Lev Vygotsky (1978) Actual (ADL) vs Potential (PDL) Developmental Levels & ZPD Bandwidth
 * - Milton Budoff (1987) Learning Potential Score (LPS) gain ratio
 * - Reuven Feuerstein (1979) Structural Cognitive Modifiability Index (CMI)
 * - Campione & Brown (1987) Graduated Prompt Efficiency & Scaffolding Decay
 */

import React from 'react'
import type { ZpdMetrics } from '@learning-hub/core/dynamic-assessment'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import { Activity, Award, Compass, Layers, Sparkles, TrendingUp, Zap } from 'lucide-react'

export interface DynamicAssessmentHUDProps {
  metrics: ZpdMetrics
  activeScenarioTitle?: string
  className?: string
}

export function DynamicAssessmentHUD({
  metrics,
  activeScenarioTitle,
  className = '',
}: DynamicAssessmentHUDProps) {
  const typologyMeta: Record<
    ZpdMetrics['typology'],
    { label: string; tone: 'neutral' | 'warning' | 'accent' | 'success'; desc: string }
  > = {
    high_achiever: {
      label: 'Autonomous High Achiever',
      tone: 'success',
      desc: 'High baseline mastery; rapid autonomous transfer with minimal scaffolding',
    },
    high_potential_gainer: {
      label: 'High Potential Gainer (Feuerstein LPAD)',
      tone: 'accent',
      desc: 'High latent cognitive modifiability; steep developmental leap with mediation',
    },
    moderate_gainer: {
      label: 'Steady Progressive Gainer',
      tone: 'neutral',
      desc: 'Responsive to graduated prompting; steadily internalizes problem-solving schemas',
    },
    emerging_learner: {
      label: 'Emerging Foundation Learner',
      tone: 'warning',
      desc: 'Requires prerequisite structural schema reinforcement before multi-step transfer',
    },
  }

  const currentTypology = typologyMeta[metrics.typology]

  return (
    <Panel
      className={`p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4 ${className}`}
    >
      {/* Header telemetry bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Dynamic Assessment Telemetry
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary font-mono">
                Vygotsky-Feuerstein Engine
              </span>
            </div>
            <h3 className="text-sm font-bold text-strong">
              {activeScenarioTitle || 'Zone of Proximal Development Diagnostic'}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={currentTypology.tone} className="text-xs font-medium">
            <Award className="w-3.5 h-3.5 mr-1" />
            {currentTypology.label}
          </Badge>
        </div>
      </div>

      {/* Main 4-metric diagnostic grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Actual Developmental Level (ADL) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Actual Level (ADL)</span>
            <Activity className="w-3.5 h-3.5 text-secondary" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {`${metrics.actualDevelopmentalLevel}%`}
            </span>
            <span className="text-[11px] text-secondary">pre-test</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Independent baseline capacity</p>
        </div>

        {/* Potential Developmental Level (PDL) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Potential Level (PDL)</span>
            <TrendingUp className="w-3.5 h-3.5 text-status-success-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-status-success-text">
              {`${metrics.potentialDevelopmentalLevel}%`}
            </span>
            <span className="text-[11px] text-secondary">assisted</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Mediated capacity ceiling</p>
        </div>

        {/* ZPD Bandwidth */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>ZPD Bandwidth</span>
            <Layers className="w-3.5 h-3.5 text-ac-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              {`+${metrics.zpdBandwidth}%`}
            </span>
            <span className="text-[11px] text-secondary">span</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Target zone for accelerated growth</p>
        </div>

        {/* Learning Potential Score (LPS) */}
        <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Learning Potential</span>
            <Zap className="w-3.5 h-3.5 text-status-warning-text" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-strong">
              {`${(metrics.learningPotentialScore * 100).toFixed(0)}%`}
            </span>
            <span className="text-[11px] text-secondary">Budoff gain</span>
          </div>
          <p className="text-[10px] text-tertiary truncate">Modifiability gain ratio</p>
        </div>
      </div>

      {/* Secondary Progress bars: Cognitive Modifiability & Prompt Efficiency */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <div className="space-y-1.5 p-2.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/30 dark:bg-(--hub-panel-2)/20">
          <div className="flex justify-between items-center text-xs">
            <span className="text-secondary font-medium">Cognitive Modifiability (CMI)</span>
            <span className="font-mono font-bold text-strong">
              {`${(metrics.cognitiveModifiabilityIndex * 100).toFixed(0)}%`}
            </span>
          </div>
          <ProgressBar
            value={metrics.cognitiveModifiabilityIndex}
            label="Cognitive Modifiability"
          />
        </div>

        <div className="space-y-1.5 p-2.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/30 dark:bg-(--hub-panel-2)/20">
          <div className="flex justify-between items-center text-xs">
            <span className="text-secondary font-medium">Prompt Autonomy</span>
            <span className="font-mono font-bold text-strong">
              {`${(metrics.promptEfficiencyScore * 100).toFixed(0)}% (${metrics.promptsConsumedCount}/5 hints)`}
            </span>
          </div>
          <ProgressBar value={metrics.promptEfficiencyScore} label="Prompt Autonomy" />
        </div>

        <div className="space-y-1.5 p-2.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/30 dark:bg-(--hub-panel-2)/20">
          <div className="flex justify-between items-center text-xs">
            <span className="text-secondary font-medium">Transfer Autonomy (TAS)</span>
            <span className="font-mono font-bold text-strong">
              {`${(metrics.transferAutonomyScore * 100).toFixed(0)}%`}
            </span>
          </div>
          <ProgressBar value={metrics.transferAutonomyScore} label="Transfer Autonomy" />
        </div>
      </div>

      {/* Typology description callout */}
      <div className="text-xs text-secondary p-2.5 rounded-lg bg-neutral-100/70 dark:bg-(--hub-panel-2)/60 border border-neutral-200 dark:border-(--hub-border) flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-ac-text shrink-0" />
          <span>{currentTypology.desc}</span>
        </div>
        <div className="text-[11px] font-mono text-tertiary shrink-0">
          Frustration Horizon: ~{metrics.frustrationHorizon}%
        </div>
      </div>
    </Panel>
  )
}
