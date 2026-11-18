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
    color: 'bg-muted text-muted-foreground border-border',
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                Cognitive Apprenticeship Status
              </span>
              <Badge className={`text-[10px] font-medium border ${participation.color}`}>
                <Users className="mr-1 h-3 w-3 inline" />
                {participation.title}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{participation.desc}</p>
          </div>
        </div>

        {/* Numeric Stat Badges */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Tacit Extraction:</span>
            <span className="font-bold text-foreground">
              {Math.round(metrics.tacitExtractionRate * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm">
            <Layers className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-muted-foreground">Fading Index:</span>
            <span className="font-bold text-foreground">
              {Math.round(metrics.fadingIndex * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-muted-foreground">Principles:</span>
            <span className="font-bold text-foreground">
              {metrics.extractedPrincipleCount}/{metrics.totalAvailablePrinciples}
            </span>
          </div>
        </div>
      </div>

      {/* Apprenticeship Stages Pipeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-primary" />
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
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40'
                    : isUnlocked
                      ? 'border-border bg-card/60 hover:bg-card hover:border-border/80'
                      : 'border-border/40 bg-muted/40 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${isCurrent ? 'text-primary' : 'text-foreground'}`}
                  >
                    {info.name}
                  </span>
                  {isUnlocked && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                  {info.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Progress Bars: Extraction and Fading */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Tacit Heuristic Mastery</span>
            <span className="font-medium text-foreground">
              {metrics.extractedPrincipleCount} of {metrics.totalAvailablePrinciples} Maxims
            </span>
          </div>
          <ProgressBar value={metrics.tacitExtractionRate * 100} />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Pedagogical Fading (Scaffold Removal)</span>
            <span className="font-medium text-foreground">
              {Math.round(metrics.fadingIndex * 100)}% Autonomy
            </span>
          </div>
          <ProgressBar value={metrics.fadingIndex * 100} />
        </div>
      </div>
    </Panel>
  )
}
