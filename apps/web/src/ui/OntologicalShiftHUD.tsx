/**
 * Learning HUB — Ontological Category Shift & Conceptual Change HUD
 *
 * Real-time cognitive telemetry display tracking:
 * - Michelene Chi (2013) Ontological Discrepancy Gap (Direct vs Emergent attributes)
 * - Posner, Strike, Hewson & Gertzog (1982) Accommodation Index (D, I, P, F)
 * - Stella Vosniadou (1994) Synthetic Compromise Model risk radar
 * - Andrea diSessa (1993) Dominant Phenomenological Primitive (p-prim) interference
 */

import React from 'react'
import type {
  OntologicalDiagnosisResult,
  PosnerConditions,
} from '@learning-hub/core/conceptual-change'
import {
  CANONICAL_PPRIM_CATALOG,
  evaluateOntologicalMaturityTier,
} from '@learning-hub/core/conceptual-change'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  GitBranch,
  Layers,
  Sparkles,
} from 'lucide-react'

export interface OntologicalShiftHUDProps {
  diagnosis: OntologicalDiagnosisResult
  posnerConditions: PosnerConditions
  scenarioTitle: string
  className?: string
}

export function OntologicalShiftHUD({
  diagnosis,
  posnerConditions,
  scenarioTitle,
  className = '',
}: OntologicalShiftHUDProps) {
  const tier = evaluateOntologicalMaturityTier(diagnosis.conceptualShiftReadiness)
  const pprim = CANONICAL_PPRIM_CATALOG[diagnosis.detectedPPrim]

  const tierMeta: Record<
    typeof tier,
    { label: string; tone: 'danger' | 'warning' | 'accent' | 'success'; desc: string }
  > = {
    naive_direct_realist: {
      label: 'Naive Direct Realist',
      tone: 'danger',
      desc: 'Entrenched in matter/direct process with high teleological p-prim reliance.',
    },
    synthetic_hybridizer: {
      label: 'Synthetic Hybridizer (Vosniadou)',
      tone: 'warning',
      desc: 'Assimilates scientific jargon into flawed direct-agent mental models.',
    },
    transitional_accommodator: {
      label: 'Transitional Accommodator',
      tone: 'accent',
      desc: 'High cognitive dissatisfaction; developing decentralized emergent schemas.',
    },
    emergent_ontologist: {
      label: 'Emergent Ontologist (Chi Target)',
      tone: 'success',
      desc: 'Fully restructured ontological schema; understands decentralized emergence.',
    },
  }

  const currentTier = tierMeta[tier]

  return (
    <Panel
      className={`p-4 sm:p-5 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4 ${className}`}
    >
      {/* Header telemetry summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 text-ac-text dark:text-ac-text flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-strong tracking-tight">
                Ontological Category Shift HUD
              </h3>
              <Badge tone="accent">Chi 2013 · Vosniadou · diSessa</Badge>
            </div>
            <p className="text-xs text-secondary truncate max-w-md">
              Target Phenomenon: {scenarioTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={currentTier.tone} dot>
            {currentTier.label}
          </Badge>
        </div>
      </div>

      {/* 4 Core Quantitative Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Conceptual Shift Readiness */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-ac-text" />
              Shift Readiness
            </span>
            <span className="text-xs font-bold text-strong">
              {(diagnosis.conceptualShiftReadiness * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={diagnosis.conceptualShiftReadiness} />
          <p className="text-[10px] text-tertiary">Ontological branch reassignment probability</p>
        </div>

        {/* Metric 2: Posner Accommodation Index */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-ac-text" />
              Posner Accommodation
            </span>
            <span className="text-xs font-bold text-strong">
              {(diagnosis.posnerAccommodationIndex * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={diagnosis.posnerAccommodationIndex} />
          <p className="text-[10px] text-tertiary">
            Dissatisfaction, Intelligibility &amp; Plausibility
          </p>
        </div>

        {/* Metric 3: Ontological Discrepancy Gap */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-status-warning-text" />
              Discrepancy Gap
            </span>
            <span className="text-xs font-bold text-strong">
              {(diagnosis.discrepancyGap * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={diagnosis.discrepancyGap} />
          <p className="text-[10px] text-tertiary">Fraction of direct vs emergent attributes</p>
        </div>

        {/* Metric 4: Synthetic Model Compromise Risk */}
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-danger-text" />
              Synthetic Model Risk
            </span>
            <span className="text-xs font-bold text-strong">
              {(diagnosis.syntheticCompromiseRisk * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={diagnosis.syntheticCompromiseRisk} />
          <p className="text-[10px] text-tertiary">Vosniadou hybrid compromise vulnerability</p>
        </div>
      </div>

      {/* Cognitive Heuristics Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Dominant P-Prim */}
        <div className="p-3 rounded-xl bg-neutral-50/70 dark:bg-(--hub-panel-2)/60 border border-neutral-200 dark:border-(--hub-border) space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-strong flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-status-warning-text" />
              Active Phenomenological Primitive (diSessa)
            </span>
            <Badge tone="warning">Intuitive Heuristic</Badge>
          </div>
          <p className="text-xs font-semibold text-strong">{pprim.name}</p>
          <p className="text-[11px] text-secondary">{pprim.heuristicRule}</p>
        </div>

        {/* 4 Posner Conditions Breakdown */}
        <div className="p-3 rounded-xl bg-neutral-50/70 dark:bg-(--hub-panel-2)/60 border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-strong flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success-text" />
              Posner Accommodation Sub-Scores
            </span>
            <span className="text-[10px] text-tertiary">D · I · P · F</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-1.5 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
              <span className="block text-[10px] text-tertiary">Dissatisfaction</span>
              <span className="text-xs font-bold text-strong">
                {(posnerConditions.dissatisfaction * 100).toFixed(0)}%
              </span>
            </div>
            <div className="p-1.5 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
              <span className="block text-[10px] text-tertiary">Intelligibility</span>
              <span className="text-xs font-bold text-strong">
                {(posnerConditions.intelligibility * 100).toFixed(0)}%
              </span>
            </div>
            <div className="p-1.5 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
              <span className="block text-[10px] text-tertiary">Plausibility</span>
              <span className="text-xs font-bold text-strong">
                {(posnerConditions.plausibility * 100).toFixed(0)}%
              </span>
            </div>
            <div className="p-1.5 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
              <span className="block text-[10px] text-tertiary">Fruitfulness</span>
              <span className="text-xs font-bold text-strong">
                {(posnerConditions.fruitfulness * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
