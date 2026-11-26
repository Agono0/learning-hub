'use client'

/**
 * @file SelfExplanationHUD.tsx
 * @description Real-time Justification Depth Index (JDS), Rule Naming, and Schema Inversion Telemetry HUD.
 *
 * Grounded in:
 * - Michelene T. H. Chi et al. (1989) Principle-Based Self-Explanation vs Paraphrasing.
 * - Vincent Aleven & Kenneth R. Koedinger (2002) Cognitive Tutor Rule-Naming Accuracy.
 * - Alexander Renkl (2002) Schema Inversion & Boundary Counterfactual Testing.
 */

import React from 'react'
import {
  ExplanationEvaluationTelemetry,
  JustificationType,
} from '@learning-hub/core/explanation/self-explanation-engine'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'
import {
  Award,
  Brain,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Target,
  XCircle,
  Zap,
} from 'lucide-react'

export interface SelfExplanationHUDProps {
  telemetry: ExplanationEvaluationTelemetry | null
  currentStepNumber: number
  totalSteps: number
  activeRuleName?: string | null
  className?: string
}

const JUSTIFICATION_CONFIG: Record<
  JustificationType,
  { label: string; tone: 'success' | 'cyan' | 'violet' | 'warning'; description: string }
> = {
  principle_based: {
    label: 'Principle-Based Grounding',
    tone: 'success',
    description:
      'Deep mechanistic justification explicitly connecting derivation to formal domain axioms/invariants.',
  },
  goal_operator: {
    label: 'Goal-Operator Purpose',
    tone: 'cyan',
    description:
      'Intermediate explanation articulating immediate sub-goal operational transformation.',
  },
  coherence_building: {
    label: 'Coherence-Building Link',
    tone: 'violet',
    description: 'Inference connecting step to antecedent lemmas and global conceptual context.',
  },
  superficial_paraphrase: {
    label: 'Superficial Paraphrase',
    tone: 'warning',
    description: 'Surface textual restatement lacking causal rationale or principle grounding.',
  },
}

export function SelfExplanationHUD({
  telemetry,
  currentStepNumber,
  totalSteps,
  activeRuleName,
  className = '',
}: SelfExplanationHUDProps) {
  const depthScore = telemetry ? telemetry.justificationDepthScore : 0
  const justType: JustificationType = telemetry
    ? telemetry.justificationType
    : 'superficial_paraphrase'
  const config = JUSTIFICATION_CONFIG[justType]

  return (
    <div
      className={`rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-white/70 dark:bg-(--hub-panel)/70 p-4 shadow-sm backdrop-blur-md ${className}`}
    >
      {/* Top Header & Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/40 dark:border-(--hub-border)/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/10 text-ac-text">
            <Brain className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-strong">
              Self-Explanation &amp; Schema Inversion HUD
            </h3>
            <p className="text-xs text-tertiary">
              Chi et al. (1989) Justification Depth • Aleven &amp; Koedinger (2002) Rule Naming
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={config.tone}>{config.label}</Badge>
          <span className="font-mono text-xs font-semibold text-tertiary">
            Step {currentStepNumber} of {totalSteps}
          </span>
        </div>
      </div>

      {/* Main Grid Telemetry */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column: Justification Depth Score & Potentiation Multiplier (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-lg border border-neutral-200/50 dark:border-(--hub-border)/50 bg-neutral-100/20 dark:bg-(--hub-panel-2)/20 p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-strong">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-ac-text" /> Justification Depth Index (JDI)
            </span>
            <span className="font-mono text-ac-text font-bold">{depthScore} / 100</span>
          </div>

          <ProgressBar value={depthScore / 100} />

          {/* Retention Multiplier Display */}
          <div className="rounded-lg border border-neutral-200/60 dark:border-(--hub-border)/60 bg-white dark:bg-(--hub-panel) p-2.5 flex items-center justify-between">
            <div className="text-[11px] text-tertiary">
              <span className="block font-medium text-strong">FSRS Retention Multiplier:</span>
              <span>Chi (1989) Additive Potentiation</span>
            </div>
            <span className="font-mono text-base font-bold text-status-success-text dark:text-status-success-text">
              {telemetry ? `${telemetry.retentionPotentiationMultiplier}x` : '1.00x'}
            </span>
          </div>

          <p className="text-[11px] text-tertiary leading-tight">{config.description}</p>
        </div>

        {/* Right Column: Rule-Naming & Schema Inversion Verification (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-lg border border-neutral-200/50 dark:border-(--hub-border)/50 bg-white dark:bg-(--hub-panel) p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-strong">
            <span className="flex items-center gap-1.5">
              <Award className="h-4 w-4 text-status-success-text" /> Cognitive Dual-Check
              Verifications
            </span>
            <span className="text-[10px] text-tertiary">Aleven (2002) • Renkl (2002)</span>
          </div>

          {/* Dual Check Cards: Rule Naming & Schema Inversion */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Rule Naming Verification */}
            <div className="rounded-lg border border-neutral-200/40 dark:border-(--hub-border)/40 bg-neutral-100/20 dark:bg-(--hub-panel-2)/20 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-tertiary">
                <span className="flex items-center gap-1 font-medium">
                  <Target className="h-3.5 w-3.5 text-ac-text" /> Rule Naming
                </span>
                {telemetry ? (
                  telemetry.ruleNamingAccuracy ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success-text" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-status-warning-text" />
                  )
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-tertiary" />
                )}
              </div>
              <div className="text-[11px] font-semibold text-strong truncate">
                {activeRuleName ?? 'Select Governing Rule'}
              </div>
              <span className="text-[10px] text-tertiary block">
                {telemetry?.ruleNamingAccuracy
                  ? 'Axiom accurately articulated'
                  : 'Requires governing theorem'}
              </span>
            </div>

            {/* Schema Inversion Verification */}
            <div className="rounded-lg border border-neutral-200/40 dark:border-(--hub-border)/40 bg-neutral-100/20 dark:bg-(--hub-panel-2)/20 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-tertiary">
                <span className="flex items-center gap-1 font-medium">
                  <Zap className="h-3.5 w-3.5 text-status-warning-text" /> Schema Inversion
                </span>
                {telemetry ? (
                  telemetry.inversionMastery ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success-text" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-danger-text" />
                  )
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-tertiary" />
                )}
              </div>
              <div className="text-[11px] font-semibold text-strong truncate">
                {telemetry?.inversionMastery
                  ? 'Boundary Invariant Verified'
                  : 'Counterfactual Pending'}
              </div>
              <span className="text-[10px] text-tertiary block">
                {telemetry?.inversionMastery
                  ? 'Diagnosed failure consequence'
                  : 'Test boundary conditions'}
              </span>
            </div>
          </div>

          {/* Keyword Coverage Meter */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-tertiary mb-1">
              <span>Mechanistic Keyword Alignment:</span>
              <span className="font-mono font-semibold text-strong">
                {telemetry ? `${Math.round(telemetry.mechanisticKeywordCoverage * 100)}%` : '0%'}
              </span>
            </div>
            <ProgressBar value={telemetry ? telemetry.mechanisticKeywordCoverage : 0} />
          </div>
        </div>
      </div>
    </div>
  )
}
