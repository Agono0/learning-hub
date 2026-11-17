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
      className={`rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm backdrop-blur-md ${className}`}
    >
      {/* Top Header & Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Self-Explanation &amp; Schema Inversion HUD
            </h3>
            <p className="text-xs text-muted-foreground">
              Chi et al. (1989) Justification Depth • Aleven &amp; Koedinger (2002) Rule Naming
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={config.tone}>{config.label}</Badge>
          <span className="font-mono text-xs font-semibold text-muted-foreground">
            Step {currentStepNumber} of {totalSteps}
          </span>
        </div>
      </div>

      {/* Main Grid Telemetry */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column: Justification Depth Score & Potentiation Multiplier (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-lg border border-border/50 bg-muted/20 p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" /> Justification Depth Index (JDI)
            </span>
            <span className="font-mono text-primary font-bold">{depthScore} / 100</span>
          </div>

          <ProgressBar value={depthScore / 100} />

          {/* Retention Multiplier Display */}
          <div className="rounded-lg border border-border/60 bg-card p-2.5 flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground">
              <span className="block font-medium text-foreground">FSRS Retention Multiplier:</span>
              <span>Chi (1989) Additive Potentiation</span>
            </div>
            <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
              {telemetry ? `${telemetry.retentionPotentiationMultiplier}x` : '1.00x'}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-tight">{config.description}</p>
        </div>

        {/* Right Column: Rule-Naming & Schema Inversion Verification (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-lg border border-border/50 bg-card p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Award className="h-4 w-4 text-emerald-500" /> Cognitive Dual-Check Verifications
            </span>
            <span className="text-[10px] text-muted-foreground">Aleven (2002) • Renkl (2002)</span>
          </div>

          {/* Dual Check Cards: Rule Naming & Schema Inversion */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Rule Naming Verification */}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 font-medium">
                  <Target className="h-3.5 w-3.5 text-primary" /> Rule Naming
                </span>
                {telemetry ? (
                  telemetry.ruleNamingAccuracy ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-amber-500" />
                  )
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="text-[11px] font-semibold text-foreground truncate">
                {activeRuleName ?? 'Select Governing Rule'}
              </div>
              <span className="text-[10px] text-muted-foreground block">
                {telemetry?.ruleNamingAccuracy
                  ? 'Axiom accurately articulated'
                  : 'Requires governing theorem'}
              </span>
            </div>

            {/* Schema Inversion Verification */}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 font-medium">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Schema Inversion
                </span>
                {telemetry ? (
                  telemetry.inversionMastery ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                  )
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="text-[11px] font-semibold text-foreground truncate">
                {telemetry?.inversionMastery
                  ? 'Boundary Invariant Verified'
                  : 'Counterfactual Pending'}
              </div>
              <span className="text-[10px] text-muted-foreground block">
                {telemetry?.inversionMastery
                  ? 'Diagnosed failure consequence'
                  : 'Test boundary conditions'}
              </span>
            </div>
          </div>

          {/* Keyword Coverage Meter */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Mechanistic Keyword Alignment:</span>
              <span className="font-mono font-semibold text-foreground">
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
