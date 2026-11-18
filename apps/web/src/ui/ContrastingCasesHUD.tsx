/**
 * @file apps/web/src/ui/ContrastingCasesHUD.tsx
 * @description Telemetry HUD for Contrasting Cases & Preparation for Future Learning (PFL).
 *
 * Grounded in Schwartz & Bransford (1998, 2004) "A Time for Telling".
 * Visualizes:
 * - CDTS: Contrasting Differentiation & Transfer Score (0–100)
 * - FDRS: Feature Discrimination Rigor Score (0–100)
 * - IMI: Invented Metric Invariance (0–100)
 * - PFRI: Preparation for Future Readiness Index (0–100)
 * - Maturity Badges: Superficial Observer, Proto-Inventor, Differentiating Theorist, Canonical Synthesizer
 *
 * Mode-aware tokens, zero ghost classes, kit-first design.
 */

import React from 'react'
import type { ContrastingEvaluation } from '@learning-hub/core/contrasting'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  GitCompare,
  Sparkles,
  Sliders,
  Target,
  Eye,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

export interface ContrastingCasesHUDProps {
  evaluation: ContrastingEvaluation
  activeSetTitle?: string
  className?: string
}

const MATURITY_CONFIG = {
  superficial_observer: {
    label: 'Superficial Observer (Surface Focus)',
    tone: 'danger' as const,
    description:
      'Evaluates cases by absolute magnitudes or visual shape rather than intensive ratios.',
  },
  proto_inventor: {
    label: 'Proto-Inventor (Intuitive Model)',
    tone: 'warning' as const,
    description:
      'Notices contrast gradients across variants, but confounded by superficial features.',
  },
  differentiating_theorist: {
    label: 'Differentiating Theorist (Structural Attunement)',
    tone: 'accent' as const,
    description:
      'Perceptually differentiates deep invariant dimensions, priming schema for formal telling.',
  },
  canonical_synthesizer: {
    label: 'Canonical Synthesizer (Generative Transfer)',
    tone: 'success' as const,
    description:
      'Masterfully coordinates contrasting variants with canonical equations for far transfer.',
  },
}

export function ContrastingCasesHUD({
  evaluation,
  activeSetTitle,
  className = '',
}: ContrastingCasesHUDProps) {
  const currentMaturity = MATURITY_CONFIG[evaluation.maturityBand]

  return (
    <Panel className={`space-y-4 ${className}`}>
      {/* Header telemetry summary */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--hub-primary-soft,rgba(59,130,246,0.1)) text-(--hub-primary,#2563eb)">
            <GitCompare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-strong">
              Contrasting Differentiation Telemetry
            </h3>
            {activeSetTitle && (
              <p className="text-xs text-secondary truncate max-w-md">Case Set: {activeSetTitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={currentMaturity.tone}>{currentMaturity.label}</Badge>
          <Badge tone={evaluation.impasseProductive ? 'success' : 'neutral'}>
            {evaluation.impasseProductive ? 'Productive Impasse Primed' : 'Exploration Phase'}
          </Badge>
        </div>
      </div>

      {/* Primary Metrics 4-Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. CDTS Composite Score */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-(--hub-primary,#2563eb)" />
              Differentiation &amp; Transfer (CDTS)
            </span>
            <span className="font-semibold text-strong">{evaluation.cdts}/100</span>
          </div>
          <ProgressBar value={evaluation.cdts} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Composite index of perceptual differentiation, invariance, and lecture readiness.
          </p>
        </div>

        {/* 2. FDRS Score */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Eye className="h-3.5 w-3.5 text-(--hub-success,#10b981)" />
              Feature Discrimination (FDRS)
            </span>
            <span className="font-semibold text-strong">{evaluation.fdrs}/100</span>
          </div>
          <ProgressBar
            value={evaluation.fdrs}
            className={`h-2 ${evaluation.fdrs < 50 ? 'accent-rose-500' : ''}`}
          />
          <p className="text-[11px] text-secondary leading-tight">
            Discrimination of deep structural dimensions vs superficial distractors (PFL).
          </p>
        </div>

        {/* 3. IMI Score */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Sliders className="h-3.5 w-3.5 text-(--hub-warning,#f59e0b)" />
              Metric Invariance (IMI)
            </span>
            <span className="font-semibold text-strong">{evaluation.imi}/100</span>
          </div>
          <ProgressBar value={evaluation.imi} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Mathematical ranking consistency of invented rule across all case variants.
          </p>
        </div>

        {/* 4. PFRI Score */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-ac-text" />
              Future Readiness (PFRI)
            </span>
            <span className="font-semibold text-strong">{evaluation.pfri}/100</span>
          </div>
          <ProgressBar value={evaluation.pfri} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Curiosity tension and impasse depth prior to expert canonical explanation reveal.
          </p>
        </div>
      </div>

      {/* Identified Dimensions & Distractors */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <h4 className="text-xs font-semibold text-status-success-text dark:text-status-success-text flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Discriminated Deep Invariants ({evaluation.identifiedDeepDimensions.length})
          </h4>
          {evaluation.identifiedDeepDimensions.length === 0 ? (
            <p className="text-xs text-secondary italic">No deep invariants identified yet.</p>
          ) : (
            <ul className="text-xs text-secondary space-y-1 list-disc list-inside">
              {evaluation.identifiedDeepDimensions.map((id) => (
                <li key={id} className="leading-snug">
                  {id}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <h4 className="text-xs font-semibold text-status-warning-text dark:text-status-warning-text flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Superficial Distractors Flagged ({evaluation.superficialDistractorsChosen.length})
          </h4>
          {evaluation.superficialDistractorsChosen.length === 0 ? (
            <p className="text-xs text-secondary italic">
              Clean discrimination: zero superficial distractors chosen!
            </p>
          ) : (
            <ul className="text-xs text-secondary space-y-1 list-disc list-inside">
              {evaluation.superficialDistractorsChosen.map((name, i) => (
                <li key={i} className="leading-snug">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Strengths & Vulnerabilities */}
      {(evaluation.strengths.length > 0 || evaluation.vulnerabilities.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {evaluation.strengths.length > 0 && (
            <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-1.5">
              <h4 className="text-xs font-semibold text-status-success-text dark:text-status-success-text flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Differentiated Strengths
              </h4>
              <ul className="text-xs text-secondary space-y-1 list-disc list-inside">
                {evaluation.strengths.map((str, i) => (
                  <li key={i} className="leading-snug">
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
                Perceptual Vulnerabilities
              </h4>
              <ul className="text-xs text-secondary space-y-1 list-disc list-inside">
                {evaluation.vulnerabilities.map((v, i) => (
                  <li key={i} className="leading-snug">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Schwartz & Bransford Pedagogical Synthesis */}
      {evaluation.pedagogicalFeedback.length > 0 && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 text-xs text-secondary leading-relaxed">
          <span className="font-semibold text-indigo-900 dark:text-indigo-200 block mb-1">
            Preparation for Future Learning (PFL) Synthesis:
          </span>
          {evaluation.pedagogicalFeedback.join(' ')}
        </div>
      )}
    </Panel>
  )
}
