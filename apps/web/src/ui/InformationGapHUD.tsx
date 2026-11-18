/**
 * Learning HUB — Epistemic Curiosity & Information Gap HUD
 *
 * Visualizes George Loewenstein's (1994) Information Gap Theory,
 * Daniel Berlyne's (1960) Collative Arousal Dynamics,
 * and Min Jeong Kang et al.'s (2009 Neuron) Dopaminergic Memory Facilitation.
 */

'use client'

import React from 'react'
import { type CuriosityMetrics, type CollativeVariable } from '@learning-hub/core/curiosity'
import { Badge, Panel, ProgressBar } from '@/ui'
import { Brain, HelpCircle, Sparkles, Zap, Flame, Compass } from 'lucide-react'

export interface InformationGapHUDProps {
  readonly metrics: CuriosityMetrics
  readonly collativeVariable: CollativeVariable
  readonly currentMysteryTitle: string
  readonly onKnowledgeAdjust?: (level: number) => void
}

const COLLATIVE_BADGES: Record<
  CollativeVariable,
  { label: string; tone: 'accent' | 'warning' | 'violet' | 'cyan' | 'danger' }
> = {
  novelty: { label: 'Novelty Variable', tone: 'accent' },
  complexity: { label: 'Complexity Variable', tone: 'violet' },
  ambiguity: { label: 'Ambiguity Variable', tone: 'warning' },
  surprise: { label: 'Surprise Variable', tone: 'danger' },
  incongruity: { label: 'Incongruity Variable', tone: 'cyan' },
}

const DRIVE_CONFIG: Record<
  CuriosityMetrics['epistemicDriveStatus'],
  { label: string; tone: 'neutral' | 'accent' | 'warning' | 'success'; desc: string }
> = {
  dormant: {
    label: 'Drive Dormant',
    tone: 'neutral',
    desc: 'Knowledge baseline insufficient to identify the epistemic gap',
  },
  aroused: {
    label: 'Deprivation Aroused',
    tone: 'accent',
    desc: 'Information gap recognized; dopamine circuits sensitized',
  },
  peak_tension: {
    label: 'Peak Epistemic Tension',
    tone: 'warning',
    desc: 'Optimal gap tension (~50% known); maximal dopamine priming',
  },
  satiated: {
    label: 'Epistemic Closure',
    tone: 'success',
    desc: 'Paradox resolved; high-retention schema consolidation',
  },
}

export function InformationGapHUD({
  metrics,
  collativeVariable,
  currentMysteryTitle,
  onKnowledgeAdjust,
}: InformationGapHUDProps) {
  const driveInfo = DRIVE_CONFIG[metrics.epistemicDriveStatus]
  const collativeInfo = COLLATIVE_BADGES[collativeVariable]

  // Tension percentage for visual bar
  const tensionPercent = Math.min(100, Math.round(metrics.epistemicTensionScore * 100))
  const multiplierPercent = Math.min(
    100,
    Math.round(((metrics.memoryFacilitationMultiplier - 1.0) / 0.85) * 100),
  )

  return (
    <Panel className="p-5 shadow-sm space-y-5">
      {/* Top Header & Collative Variable Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-secondary">
              Loewenstein Information Gap &amp; Epistemic Curiosity HUD
            </span>
            <Badge tone={collativeInfo.tone}>{collativeInfo.label}</Badge>
            <Badge tone={driveInfo.tone}>{driveInfo.label}</Badge>
          </div>
          <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-status-warning-text" />
            Mystery: {currentMysteryTitle}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={metrics.isResolved ? 'success' : 'neutral'}>
            {metrics.isResolved ? 'Resolved (Closure Satiated)' : 'Epistemic Gap Open'}
          </Badge>
        </div>
      </div>

      {/* 4 Core Loewenstein & Kang Metric Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* Metric 1: Epistemic Tension (Loewenstein Inverted-U) */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-3.5 space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-status-warning-text" />
              Epistemic Tension
            </span>
            <span className="font-mono text-strong">
              {metrics.epistemicTensionScore.toFixed(2)}
            </span>
          </div>
          <ProgressBar value={tensionPercent} />
          <p className="text-[11px] text-tertiary">
            Loewenstein Inverted-U peak at ~50% perceived knowledge.
          </p>
        </div>

        {/* Metric 2: Kang et al. Memory Facilitation */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-3.5 space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-ac-text" />
              Memory Multiplier
            </span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {metrics.memoryFacilitationMultiplier.toFixed(2)}x
            </span>
          </div>
          <ProgressBar value={multiplierPercent} />
          <p className="text-[11px] text-tertiary">
            Kang et al. (2009 Neuron) striatal dopamine recall boost.
          </p>
        </div>

        {/* Metric 3: Clue Salience & Gap Narrowing */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-3.5 space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-status-success-text" />
              Gap Narrowing
            </span>
            <span className="font-mono text-strong">
              {metrics.cluesRevealedCount} / {metrics.totalAvailableClues} Clues
            </span>
          </div>
          <ProgressBar value={Math.round(metrics.gapSalienceIndex * 100)} />
          <p className="text-[11px] text-tertiary">
            Progressive evidence focusing attention on the unknown.
          </p>
        </div>

        {/* Metric 4: Prior Knowledge Baseline */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-3.5 space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-status-info-text" />
              Perceived Knowledge (k)
            </span>
            <span className="font-mono text-strong">
              {Math.round(metrics.priorKnowledgeLevel * 100)}%
            </span>
          </div>
          <ProgressBar value={Math.round(metrics.priorKnowledgeLevel * 100)} />
          <p className="text-[11px] text-tertiary">
            Curiosity is lowest when k=0% or k=100%; highest in between.
          </p>
        </div>
      </div>

      {/* Dynamic Epistemic Arousal Status Banner */}
      <div className="rounded-lg border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50/60 dark:bg-(--hub-panel-2)/60 px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-secondary">
            <strong className="text-strong">{driveInfo.label}:</strong> {driveInfo.desc}
          </span>
        </div>

        {onKnowledgeAdjust && (
          <div className="flex items-center gap-2 text-[11px] shrink-0">
            <span className="text-tertiary">Simulate knowledge:</span>
            <button
              type="button"
              onClick={() => onKnowledgeAdjust(0.1)}
              className="px-2 py-0.5 rounded border border-neutral-200 dark:border-(--hub-border) hover:bg-neutral-100 dark:hover:bg-(--hub-panel) text-secondary"
            >
              10%
            </button>
            <button
              type="button"
              onClick={() => onKnowledgeAdjust(0.5)}
              className="px-2 py-0.5 rounded border border-neutral-200 dark:border-(--hub-border) hover:bg-neutral-100 dark:hover:bg-(--hub-panel) text-secondary font-medium text-status-warning-text"
            >
              50% (Peak)
            </button>
            <button
              type="button"
              onClick={() => onKnowledgeAdjust(0.9)}
              className="px-2 py-0.5 rounded border border-neutral-200 dark:border-(--hub-border) hover:bg-neutral-100 dark:hover:bg-(--hub-panel) text-secondary"
            >
              90%
            </button>
          </div>
        )}
      </div>
    </Panel>
  )
}
