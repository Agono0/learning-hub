/**
 * Learning HUB — Reciprocal Teaching & Dialogic Questioning HUD
 *
 * Real-time cognitive telemetry tracking:
 * - Ann L. Brown & Annemarie Palincsar (1984) Reciprocal Teaching
 * - Michelene T. H. Chi & Ruth Wylie (2014) The ICAP Engagement Framework
 * - Alison King (1990, 1999) Guided Reciprocal Peer Questioning
 * - Shannon Entropy Reciprocal Strategy Balance Score (RSBS)
 * - Elaboration Depth Index (EDI) & Metacognitive Repair Ratio (MRR)
 * - Composite Reciprocal Dialogue Maturity Score (RDMS)
 */

import React from 'react'
import type { ReciprocalEvaluation } from '@learning-hub/core/reciprocal-teaching'
import { Badge } from './Feedback'
import { Panel } from './Panel'
import { ProgressBar } from './Progress'
import {
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Layers,
  Lightbulb,
  MessageCircleQuestion,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react'

export interface ReciprocalTeachingHUDProps {
  evaluation: ReciprocalEvaluation
  activePassageTitle?: string
  className?: string
}

export function ReciprocalTeachingHUD({
  evaluation,
  activePassageTitle,
  className = '',
}: ReciprocalTeachingHUDProps) {
  const bandMeta: Record<
    ReciprocalEvaluation['masteryBand'],
    {
      label: string
      tone: 'neutral' | 'warning' | 'accent' | 'success'
      desc: string
    }
  > = {
    mastery_interactive: {
      label: 'Mastery Interactive (RDMS ≥ 80)',
      tone: 'success',
      desc: 'Deep dialogic co-construction, multi-perspective synthesis, and balanced reciprocal role monitoring (Palincsar & Brown 1984).',
    },
    proficient_constructive: {
      label: 'Proficient Constructive (60 ≤ RDMS < 80)',
      tone: 'accent',
      desc: 'Generates novel causal explanations and actively detects domain misconceptions.',
    },
    developing_active: {
      label: 'Developing Active (40 ≤ RDMS < 60)',
      tone: 'warning',
      desc: 'Manipulates and restates text materials; developing causal depth and role variety.',
    },
    novice_passive: {
      label: 'Novice Passive (RDMS < 40)',
      tone: 'neutral',
      desc: 'Receptive engagement; elevate through King thought-provoking question stems and clarification.',
    },
  }

  const currentBand = bandMeta[evaluation.masteryBand]

  return (
    <Panel className={`space-y-4 ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--hub-primary-soft,rgba(59,130,246,0.1)) text-(--hub-primary,#2563eb)">
            <MessageCircleQuestion className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-strong">Reciprocal Dialogic Telemetry</h3>
            {activePassageTitle && (
              <p className="text-xs text-secondary truncate max-w-md">
                Passage: {activePassageTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={currentBand.tone}>{currentBand.label}</Badge>
          <Badge tone="neutral">
            {evaluation.userTurnsCount} User Turns / {evaluation.totalTurns} Total
          </Badge>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. RDMS Master Score */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-(--hub-primary,#2563eb)" />
              RDMS Maturity
            </span>
            <span className="font-semibold text-strong">{evaluation.rdms}/100</span>
          </div>
          <ProgressBar value={evaluation.rdms} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight">
            Composite dialogue score across ICAP, role balance, and causal repair.
          </p>
        </div>

        {/* 2. ICAP Composite (ICS) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-(--hub-accent,#8b5cf6)" />
              ICAP Composite
            </span>
            <span className="font-semibold text-strong">{evaluation.icap.ics}/100</span>
          </div>
          <ProgressBar value={evaluation.icap.ics} className="h-2" />
          <div className="flex items-center justify-between text-[10px] text-secondary">
            <span>Inter: {Math.round(evaluation.icap.interactiveRatio * 100)}%</span>
            <span>Const: {Math.round(evaluation.icap.constructiveRatio * 100)}%</span>
            <span>Act: {Math.round(evaluation.icap.activeRatio * 100)}%</span>
          </div>
        </div>

        {/* 3. Strategy Balance Score (RSBS) */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-(--hub-success,#10b981)" />
              Strategy Balance
            </span>
            <span className="font-semibold text-strong">{evaluation.strategy.rsbs}/100</span>
          </div>
          <ProgressBar value={evaluation.strategy.rsbs} className="h-2" />
          <p className="text-[11px] text-secondary leading-tight truncate">
            Dominant:{' '}
            <span className="font-medium capitalize">{evaluation.strategy.dominantRole}</span>
          </p>
        </div>

        {/* 4. Elaboration & Metacognitive Repair */}
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="font-medium flex items-center gap-1">
              <Wrench className="h-3.5 w-3.5 text-(--hub-warning,#f59e0b)" />
              Elaboration & Repair
            </span>
            <span className="font-semibold text-strong">EDI: {evaluation.elaboration.edi}</span>
          </div>
          <ProgressBar value={evaluation.elaboration.edi} className="h-2" />
          <div className="flex items-center justify-between text-[10px] text-secondary">
            <span>Connectors: {evaluation.elaboration.causalConnectorsCount}</span>
            <span>MRR: {Math.round(evaluation.repair.mrr * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Reciprocal 4-Role Mini Strip */}
      <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5">
        <div className="text-[11px] font-medium text-secondary mb-2 flex items-center justify-between">
          <span>Palincsar 4-Role Engagement Profile:</span>
          {evaluation.strategy.neglectedRoles.length > 0 && (
            <span className="text-status-warning-text dark:text-status-warning-text">
              Neglected: {evaluation.strategy.neglectedRoles.join(', ')}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex items-center justify-between rounded bg-neutral-100 dark:bg-neutral-800/50 px-2 py-1 text-xs">
            <span className="text-secondary flex items-center gap-1">
              <HelpCircle className="h-3 w-3 text-blue-500" /> Questioner
            </span>
            <span className="font-semibold text-strong">
              {evaluation.strategy.roleFrequencies.questioner}
            </span>
          </div>
          <div className="flex items-center justify-between rounded bg-neutral-100 dark:bg-neutral-800/50 px-2 py-1 text-xs">
            <span className="text-secondary flex items-center gap-1">
              <Wrench className="h-3 w-3 text-status-success-text" /> Clarifier
            </span>
            <span className="font-semibold text-strong">
              {evaluation.strategy.roleFrequencies.clarifier}
            </span>
          </div>
          <div className="flex items-center justify-between rounded bg-neutral-100 dark:bg-neutral-800/50 px-2 py-1 text-xs">
            <span className="text-secondary flex items-center gap-1">
              <BookOpen className="h-3 w-3 text-ac-text" /> Summarizer
            </span>
            <span className="font-semibold text-strong">
              {evaluation.strategy.roleFrequencies.summarizer}
            </span>
          </div>
          <div className="flex items-center justify-between rounded bg-neutral-100 dark:bg-neutral-800/50 px-2 py-1 text-xs">
            <span className="text-secondary flex items-center gap-1">
              <Lightbulb className="h-3 w-3 text-status-warning-text" /> Predictor
            </span>
            <span className="font-semibold text-strong">
              {evaluation.strategy.roleFrequencies.predictor}
            </span>
          </div>
        </div>
      </div>

      {/* Feedback & Recommendations */}
      {evaluation.feedback.length > 0 && (
        <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface/50 p-3 space-y-1 text-xs">
          <div className="font-medium text-strong flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-(--hub-success,#10b981)" />
            Formative Cognitive Feedback
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-secondary">
            {evaluation.feedback.map((item, idx) => (
              <li key={`fb-${idx}`}>{item}</li>
            ))}
            {evaluation.recommendations.map((rec, idx) => (
              <li key={`rec-${idx}`} className="text-(--hub-primary,#2563eb)">
                Tip: {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
