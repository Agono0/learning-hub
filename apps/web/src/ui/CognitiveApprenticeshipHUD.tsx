'use client'

/**
 * @file apps/web/src/ui/CognitiveApprenticeshipHUD.tsx
 * @description High-density HUD visualizing Cognitive Apprenticeship stages (Collins et al., 1989)
 * and Legitimate Peripheral Participation trajectory (Lave & Wenger, 1991).
 */

import React from 'react'
import {
  type ApprenticeshipMetrics,
  type ApprenticeshipStage,
  type ParticipationLevel,
} from '@learning-hub/core/apprenticeship'
import { Badge, Panel, ProgressBar } from '@/ui'
import { Brain, CheckCircle2, Compass, Eye, Layers, Sparkles, Users } from 'lucide-react'

export interface CognitiveApprenticeshipHUDProps {
  readonly currentStage: ApprenticeshipStage
  readonly metrics: ApprenticeshipMetrics
  readonly onSelectStage?: (stage: ApprenticeshipStage) => void
  readonly className?: string
}

const STAGE_LABELS: Record<ApprenticeshipStage, { name: string; desc: string }> = {
  modeling: { name: '1. Modeling', desc: 'Observe expert think-aloud traces' },
  coaching: { name: '2. Coaching', desc: 'Guided hints and diagnostic prompts' },
  scaffolding: { name: '3. Scaffolding', desc: 'Structured problem decompositions' },
  articulation: { name: '4. Articulation', desc: 'Extract & verbalize tacit heuristics' },
  reflection: { name: '5. Reflection', desc: 'Contrast novice vs expert models' },
  exploration: { name: '6. Exploration', desc: 'Autonomous problem formulation' },
}

const PARTICIPATION_TITLES: Record<
  ParticipationLevel,
  { title: string; color: string; desc: string }
> = {
  peripheral_observer: {
    title: 'Peripheral Observer',
    color:
      'bg-neutral-100 text-tertiary border-neutral-200 dark:bg-neutral-800 dark:border-hub-border',
    desc: 'Observing expert work artifacts from the legitimate periphery',
  },
  guided_contributor: {
    title: 'Guided Contributor',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    desc: 'Executing sub-tasks with active scaffolds and hints',
  },
  autonomous_practitioner: {
    title: 'Autonomous Practitioner',
    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    desc: 'Operating independently with faded cognitive scaffolds',
  },
  master_modeler: {
    title: 'Master Modeler',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
    desc: 'Modeling tacit heuristics and coaching future apprentices',
  },
}

export function CognitiveApprenticeshipHUD({
  currentStage,
  metrics,
  onSelectStage,
  className = '',
}: CognitiveApprenticeshipHUDProps) {
  const participation = PARTICIPATION_TITLES[metrics.participationLevel]
  const stages: ApprenticeshipStage[] = [
    'modeling',
    'coaching',
    'scaffolding',
    'articulation',
    'reflection',
    'exploration',
  ]

  return (
    <Panel className={`space-y-4 p-4 sm:p-5 ${className}`}>
      {/* Top Banner: LPP Status & Key Metrics */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-200/60 dark:border-(--hub-border)/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-strong">
                Cognitive Apprenticeship Status
              </span>
              <Badge className={`text-[10px] font-medium border ${participation.color}`}>
                <Users className="mr-1 h-3 w-3 inline" />
                {participation.title}
              </Badge>
            </div>
            <p className="text-xs text-tertiary mt-0.5">{participation.desc}</p>
          </div>
        </div>

        {/* Numeric Stat Badges */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1.5 shadow-sm">
            <Brain className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-tertiary">Tacit Extraction:</span>
            <span className="font-bold text-strong">
              {Math.round(metrics.tacitExtractionRate * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1.5 shadow-sm">
            <Layers className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-tertiary">Fading Index:</span>
            <span className="font-bold text-strong">{Math.round(metrics.fadingIndex * 100)}%</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2.5 py-1.5 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-tertiary">Principles:</span>
            <span className="font-bold text-strong">
              {metrics.extractedPrincipleCount}/{metrics.totalAvailablePrinciples}
            </span>
          </div>
        </div>
      </div>

      {/* Apprenticeship Stages Pipeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-tertiary">
          <span className="font-medium text-strong flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            Collins-Brown Pedagogical Progression
          </span>
          <span>
            Stage Readiness: {Object.values(metrics.stageReadiness).filter(Boolean).length}/6
            Unlocked
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {stages.map((st) => {
            const isCurrent = currentStage === st
            const isUnlocked = metrics.stageReadiness[st]
            const info = STAGE_LABELS[st]

            return (
              <button
                key={st}
                type="button"
                onClick={() => onSelectStage?.(st)}
                className={`flex flex-col text-left rounded-lg p-2.5 border transition-all text-xs ${
                  isCurrent
                    ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-500/10 shadow-sm ring-1 ring-indigo-500/40'
                    : isUnlocked
                      ? 'border-neutral-200 dark:border-(--hub-border) bg-neutral-100/40 dark:bg-(--hub-panel-2)/40 hover:bg-white dark:hover:bg-(--hub-panel)'
                      : 'border-neutral-200/40 dark:border-(--hub-border)/40 bg-neutral-100/20 dark:bg-(--hub-panel-2)/20 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-strong'
                    }`}
                  >
                    {info.name}
                  </span>
                  {isUnlocked && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                </div>
                <span className="text-[10px] text-tertiary mt-1 line-clamp-1">{info.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Progress Bars: Extraction and Fading */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-tertiary">Tacit Heuristic Mastery</span>
            <span className="font-medium text-strong">
              {metrics.extractedPrincipleCount} of {metrics.totalAvailablePrinciples} Maxims
            </span>
          </div>
          <ProgressBar value={metrics.tacitExtractionRate * 100} />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-tertiary">Pedagogical Fading (Scaffold Removal)</span>
            <span className="font-medium text-strong">
              {Math.round(metrics.fadingIndex * 100)}% Autonomy
            </span>
          </div>
          <ProgressBar value={metrics.fadingIndex * 100} />
        </div>
      </div>
    </Panel>
  )
}
