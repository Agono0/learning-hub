/**
 * @file apps/web/src/ui/AnchoredInstructionHUD.tsx
 * @description Telemetry HUD for Anchored Instruction & Situated Macrocontext Problem Solving.
 *
 * Visualizes:
 * - IKRS: Inert Knowledge Resistance Score (0–100)
 * - SGAI: Sub-Goal Alignment Index (0–100, Catrambone 1998)
 * - EIER: Embedded Information Extraction Ratio (0–100, signal vs distractor)
 * - CPR: Constraint Propagation Rigor (0–100)
 * - Situated Problem Solving Maturity Badges (CTGV 1990)
 *
 * Adheres strictly to UI Signature: mode-aware tokens, zero ghost classes.
 */

import React from 'react'
import type { AnchoredEvaluation } from '@learning-hub/core/anchored'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  Anchor,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Activity,
  Sparkles,
} from 'lucide-react'

export interface AnchoredInstructionHUDProps {
  evaluation: AnchoredEvaluation
  activeCaseTitle?: string
  className?: string
}

const MATURITY_CONFIG = {
  inert_knower: {
    label: 'Inert Knower (Fragmented Knowledge)',
    tone: 'danger' as const,
    description:
      'Knowledge remains bound to abstract formulas without situational trigger recognition.',
  },
  procedural_solver: {
    label: 'Procedural Solver (Sequential Execution)',
    tone: 'warning' as const,
    description: 'Executes mathematical steps but vulnerable to embedded narrative distractors.',
  },
  contextual_strategist: {
    label: 'Contextual Strategist (Sub-Goal Coordinated)',
    tone: 'accent' as const,
    description: 'Decomposes authentic dilemmas into coordinated sub-goals with strong extraction.',
  },
  macrocontext_master: {
    label: 'Macrocontext Master (Generative Transfer)',
    tone: 'success' as const,
    description:
      'Seamlessly overcomes inert knowledge by coordinating constraints, signals, and goals.',
  },
}

export function AnchoredInstructionHUD({
  evaluation,
  activeCaseTitle,
  className = '',
}: AnchoredInstructionHUDProps) {
  const currentMaturity = MATURITY_CONFIG[evaluation.maturityBand]

  return (
    <Panel className={`space-y-4 ${className}`}>
      {/* Header telemetry summary */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--hub-primary-soft,rgba(59,130,246,0.1)) text-(--hub-primary,#2563eb)">
            <Anchor className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-strong">
              Anchored Problem-Solving Telemetry
            </h3>
            {activeCaseTitle && (
              <p className="text-xs text-secondary truncate max-w-md">
                Macrocontext: {activeCaseTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={currentMaturity.tone}>{currentMaturity.label}</Badge>
          <Badge tone={evaluation.decisionApproved ? 'success' : 'warning'}>
            {evaluation.decisionApproved ? 'Mission Decision Approved' : 'Decision Under Review'}
          </Badge>
        </div>
      </div>

      {/* Primary Metrics 4-Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Inert Knowledge Resistance Score (IKRS) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-(--hub-primary,#2563eb)" />
              Inert Knowledge Resistance (IKRS)
            </span>
            <span className="font-semibold text-strong">{evaluation.ikrs}/100</span>
          </div>
          <ProgressBar value={evaluation.ikrs} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Composite situated mastery overcoming abstract formula inertia (CTGV 1990).
          </p>
        </div>

        {/* 2. Sub-Goal Alignment Index (SGAI) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-(--hub-accent,#8b5cf6)" />
              Sub-Goal Alignment (SGAI)
            </span>
            <span className="font-semibold text-strong">{evaluation.sgai}/100</span>
          </div>
          <ProgressBar value={evaluation.sgai} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Prerequisite dependency DAG sequencing and mathematical chunking (Catrambone 1998).
          </p>
        </div>

        {/* 3. Embedded Information Extraction Ratio (EIER) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Compass className="h-3.5 w-3.5 text-(--hub-success,#10b981)" />
              Information Extraction (EIER)
            </span>
            <span className="font-semibold text-strong">{evaluation.eier}/100</span>
          </div>
          <ProgressBar
            value={evaluation.eier}
            className={`h-2 ${evaluation.eier < 50 ? 'accent-rose-500' : ''}`}
          />
          <p className="text-[11px] text-secondary leading-tight">
            Signal discrimination vs narrative distractor rejection from story anchor.
          </p>
        </div>

        {/* 4. Constraint Propagation Rigor (CPR) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-(--hub-warning,#f59e0b)" />
              Constraint Rigor (CPR)
            </span>
            <span className="font-semibold text-strong">{evaluation.cpr}/100</span>
          </div>
          <ProgressBar value={evaluation.cpr} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Boundary condition adherence, safety reserves, and trade-off calculation.
          </p>
        </div>
      </div>

      {/* Sub-Goal Feedback Stepper & Extraction Telemetry */}
      {evaluation.subGoalFeedback.length > 0 && (
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="text-xs font-semibold text-strong flex items-center justify-between">
            <span>Sub-Goal Execution Status &amp; Dependency Verification:</span>
            <span className="text-[11px] text-secondary">
              {evaluation.subGoalFeedback.filter((f) => f.status === 'optimal').length} /{' '}
              {evaluation.subGoalFeedback.length} Optimal
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {evaluation.subGoalFeedback.map((fb) => (
              <div
                key={fb.subGoalId}
                className="flex items-start gap-2 rounded border border-neutral-200 dark:border-(--hub-border) p-2 text-xs bg-surface-elevated"
              >
                {fb.status === 'optimal' ? (
                  <CheckCircle2 className="h-4 w-4 text-status-success-text shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-status-warning-text shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-strong">{fb.subGoalId}</span>
                    <Badge
                      tone={
                        fb.status === 'optimal'
                          ? 'success'
                          : fb.status === 'dependency_violated'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {fb.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-secondary leading-snug">{fb.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths & Diagnostic Vulnerabilities */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {evaluation.strengths.length > 0 && (
          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-1.5">
            <h4 className="text-xs font-semibold text-status-success-text dark:text-status-success-text flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Situated Strengths
            </h4>
            <ul className="text-xs text-secondary space-y-1 list-disc list-inside">
              {evaluation.strengths.map((str, idx) => (
                <li key={idx} className="leading-snug">
                  {str}
                </li>
              ))}
            </ul>
          </div>
        )}

        {evaluation.vulnerabilities.length > 0 && (
          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-1.5">
            <h4 className="text-xs font-semibold text-status-warning-text dark:text-status-warning-text flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Inert Knowledge Vulnerabilities
            </h4>
            <ul className="text-xs text-secondary space-y-1 list-disc list-inside">
              {evaluation.vulnerabilities.map((vuln, idx) => (
                <li key={idx} className="leading-snug">
                  {vuln}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pedagogical Guidance */}
      {evaluation.pedagogicalFeedback.length > 0 && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 text-xs text-secondary leading-relaxed">
          <span className="font-semibold text-indigo-900 dark:text-indigo-200 block mb-1">
            Vanderbilt Cognition &amp; Technology Group Pedagogical Synthesis:
          </span>
          {evaluation.pedagogicalFeedback.join(' ')}
        </div>
      )}
    </Panel>
  )
}
