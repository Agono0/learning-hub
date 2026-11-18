/**
 * Learning HUB — Claim-Evidence-Reasoning (CER) & Epistemic Argumentation HUD
 *
 * Real-time cognitive telemetry tracking:
 * - Katherine L. McNeill & Joseph Krajcik (2012) CER Framework
 * - Jonathan Osborne, Sibel Erduran, & Shirley Simon (2004) TAP 5-Level Rubric
 * - Deanna Kuhn (1991, 2010) Epistemic Argumentation & Rebuttal Skills
 * - Evidence Quality Index (EQI) & Reasoning Depth Index (RDI)
 * - Composite Epistemic Rigor Score (ERS ∈ [0, 100])
 */

import React from 'react'
import type { CEREvaluation } from '@learning-hub/core/argumentation'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import { CheckCircle2, FileCheck, Flame, Scale, ShieldAlert, Sparkles, Target } from 'lucide-react'

export interface ArgumentationHUDProps {
  evaluation: CEREvaluation
  activeDebateTitle?: string
  className?: string
}

export function ArgumentationHUD({
  evaluation,
  activeDebateTitle,
  className = '',
}: ArgumentationHUDProps) {
  const bandMeta: Record<
    CEREvaluation['masteryBand'],
    {
      label: string
      tone: 'neutral' | 'warning' | 'accent' | 'success'
      desc: string
    }
  > = {
    dialectic_mastery: {
      label: `Dialectic Mastery (Level ${evaluation.tapLevel} TAP • ERS ≥ 80)`,
      tone: 'success',
      desc: 'Extended argument with triangulated genuine evidence, mechanistic warrants, and proactive rebuttal of counter-theories (Osborne et al. 2004).',
    },
    mechanistically_reasoned: {
      label: `Mechanistic Reasoning (Level ${evaluation.tapLevel} TAP • 60 ≤ ERS < 80)`,
      tone: 'accent',
      desc: 'Coordinates empirical data with explicit scientific domain axioms and causal chains.',
    },
    empirically_grounded: {
      label: `Empirically Grounded (Level ${evaluation.tapLevel} TAP • 40 ≤ ERS < 60)`,
      tone: 'warning',
      desc: 'Claims supported by data but lacking explicit warrants or dialectic rebuttals.',
    },
    naive_assertion: {
      label: `Naive Assertion (Level ${evaluation.tapLevel} TAP • ERS < 40)`,
      tone: 'neutral',
      desc: 'Unsubstantiated claims or reliance on pseudo-evidence; elevate through empirical grounding.',
    },
  }

  const currentBand = bandMeta[evaluation.masteryBand]

  return (
    <Panel className={`space-y-4 ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--hub-primary-soft,rgba(59,130,246,0.1)) text-(--hub-primary,#2563eb)">
            <Scale className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-strong">Epistemic Argumentation Telemetry</h3>
            {activeDebateTitle && (
              <p className="text-xs text-secondary truncate max-w-md">
                Debate: {activeDebateTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={currentBand.tone}>{currentBand.label}</Badge>
          <Badge tone="accent">TAP Level {evaluation.tapLevel} / 5</Badge>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Epistemic Rigor Score (ERS) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-(--hub-primary,#2563eb)" />
              Epistemic Rigor (ERS)
            </span>
            <span className="font-semibold text-strong">{evaluation.ers}/100</span>
          </div>
          <ProgressBar value={evaluation.ers} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Composite score across CER completeness, evidence quality, and rebuttal depth.
          </p>
        </div>

        {/* 2. CER Completeness Score (CCS) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <FileCheck className="h-3.5 w-3.5 text-(--hub-accent,#8b5cf6)" />
              CER Completeness
            </span>
            <span className="font-semibold text-strong">{evaluation.ccs}/100</span>
          </div>
          <ProgressBar value={evaluation.ccs} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Claim, Evidence, Reasoning, and Rebuttal structural alignment (McNeill & Krajcik).
          </p>
        </div>

        {/* 3. Evidence Quality Index (EQI) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-(--hub-success,#10b981)" />
              Evidence Quality (EQI)
            </span>
            <span className="font-semibold text-strong">{evaluation.eqi}/100</span>
          </div>
          <ProgressBar
            value={evaluation.eqi}
            className={`h-2 ${evaluation.eqi < 50 ? 'accent-rose-500' : ''}`}
          />
          <p className="text-[11px] text-secondary leading-tight">
            Genuine empirical reliability vs pseudo-evidence/anecdote penalty.
          </p>
        </div>

        {/* 4. Reasoning Depth Index (RDI) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-(--hub-warning,#f59e0b)" />
              Reasoning Depth (RDI)
            </span>
            <span className="font-semibold text-strong">{evaluation.rdi}/100</span>
          </div>
          <ProgressBar value={evaluation.rdi} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Grounded in scientific principles and causal-mechanistic links.
          </p>
        </div>
      </div>

      {/* Toulmin Argument Pattern (TAP) Level Stepper */}
      <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3">
        <div className="text-[11px] font-medium text-secondary mb-2 flex items-center justify-between">
          <span>Erduran-Osborne Toulmin Argument Pattern (TAP) Hierarchy:</span>
          <span className="text-strong font-semibold">Level {evaluation.tapLevel} Achieved</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {[1, 2, 3, 4, 5].map((lvl) => {
            const isPassed = evaluation.tapLevel >= lvl
            return (
              <div
                key={`tap-${lvl}`}
                className={`rounded px-1.5 py-1 text-[11px] transition-all ${
                  isPassed
                    ? 'bg-(--hub-primary,#2563eb) text-white font-medium shadow-xs'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-secondary'
                }`}
              >
                L{lvl}:{' '}
                {lvl === 1
                  ? 'Claim'
                  : lvl === 2
                    ? 'Data/Warrant'
                    : lvl === 3
                      ? 'Weak Rebut'
                      : lvl === 4
                        ? 'Firm Rebut'
                        : 'Dialectic'}
              </div>
            )
          })}
        </div>
      </div>

      {/* Epistemic Strengths & Vulnerabilities */}
      {(evaluation.epistemicStrengths.length > 0 || evaluation.vulnerabilities.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
          {evaluation.epistemicStrengths.length > 0 && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-1">
              <div className="font-medium text-status-success-text dark:text-status-success-text flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Epistemic Strengths
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-secondary">
                {evaluation.epistemicStrengths.map((str, idx) => (
                  <li key={`str-${idx}`}>{str}</li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.vulnerabilities.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-1">
              <div className="font-medium text-status-warning-text dark:text-status-warning-text flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Epistemic Vulnerabilities
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-secondary">
                {evaluation.vulnerabilities.map((vuln, idx) => (
                  <li key={`vuln-${idx}`}>{vuln}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
