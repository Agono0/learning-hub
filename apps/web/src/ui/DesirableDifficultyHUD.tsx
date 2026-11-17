'use client'

/**
 * @file DesirableDifficultyHUD.tsx
 * @description Real-time Bjork Storage vs Retrieval Strength Matrix & Generative Effort HUD.
 *
 * Grounded in:
 * - Bjork & Bjork (2011) Storage Strength (SS) vs Retrieval Strength (RS) 2D State Space.
 * - Slamecka & Graf (1978) 4-Rung Generation Difficulty Ladder.
 * - Karpicke & Roediger (2008) Testing Effect & Cognitive Effort Index.
 */

import React from 'react'
import {
  BjorkMemoryState,
  BjorkQuadrant,
  GenerativeEvaluationTelemetry,
} from '@learning-hub/core/generation'
import { GenerationTier } from '@learning-hub/core/generation'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'
import { Activity, Award, Flame, Layers, Sparkles, Zap } from 'lucide-react'

export interface DesirableDifficultyHUDProps {
  memoryState: BjorkMemoryState
  lastTelemetry?: GenerativeEvaluationTelemetry | null
  activeTier: GenerationTier
  className?: string
}

const QUADRANT_CONFIG: Record<
  BjorkQuadrant,
  { label: string; tone: 'success' | 'warning' | 'cyan' | 'neutral'; description: string }
> = {
  high_ss_low_rs: {
    label: 'Desirable Difficulty Target',
    tone: 'success',
    description:
      'High storage, low accessibility. Effortful retrieval yields maximum storage gain (ΔSS).',
  },
  high_ss_high_rs: {
    label: 'Fluent Mastery',
    tone: 'cyan',
    description:
      'High storage, instant access. Overlearned item; practice yields minimal storage gain.',
  },
  low_ss_high_rs: {
    label: 'Fluency Illusion Trap',
    tone: 'warning',
    description:
      'Low storage, high access. Deceptive ease during study masks rapid future forgetting.',
  },
  low_ss_low_rs: {
    label: 'Extinct Memory Trace',
    tone: 'neutral',
    description:
      'Low storage, low access. Novice state; requires scaffolding and initial re-encoding.',
  },
}

const TIERS: { id: GenerationTier; level: number; name: string; multiplier: string }[] = [
  { id: 'stem_completion', level: 1, name: 'Stem Completion', multiplier: '1.25x' },
  { id: 'semantic_anagram', level: 2, name: 'Semantic Anagram', multiplier: '1.60x' },
  { id: 'reverse_query', level: 3, name: 'Reverse Inquiry', multiplier: '2.00x' },
  { id: 'analogy_synthesis', level: 4, name: 'Analogy Synthesis', multiplier: '2.50x' },
]

export function DesirableDifficultyHUD({
  memoryState,
  lastTelemetry,
  activeTier,
  className = '',
}: DesirableDifficultyHUDProps) {
  const {
    storageStrength,
    retrievalStrength,
    quadrant,
    projectedStorageDelta,
    estimatedHalfLifeHours,
  } = memoryState

  const quadMeta = QUADRANT_CONFIG[quadrant]

  // CEI calculation from telemetry or estimated default
  const effortIndex = lastTelemetry ? lastTelemetry.cognitiveEffortIndex : 45
  const isSweetSpot = quadrant === 'high_ss_low_rs'

  return (
    <div
      className={`rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm backdrop-blur-md ${className}`}
    >
      {/* Top Header & Quadrant Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Desirable Difficulty Matrix</h3>
            <p className="text-xs text-muted-foreground">
              Bjork & Bjork (2011) Disuse Theory • Slamecka (1978) Generative Ladder
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={quadMeta.tone}>{quadMeta.label}</Badge>
          {isSweetSpot && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-500 animate-pulse">
              <Sparkles className="h-3.5 w-3.5" /> Optimal Potentiation Zone
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: 2D Matrix Visualization & Key Telemetry */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column: 2D Bjork Matrix (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium mb-1">
            <span>Bjork 2D Memory Phase Space</span>
            <span className="font-mono text-[10px]">
              SS: {Math.round(storageStrength)} | RS: {(retrievalStrength * 100).toFixed(0)}%
            </span>
          </div>

          {/* 2D Plot Container */}
          <div className="relative aspect-square w-full rounded-md border border-border/60 bg-background/50 p-2 overflow-hidden">
            {/* Axis Labels */}
            <div className="absolute top-1 left-2 text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">
              Storage Strength (SS) ↑
            </div>
            <div className="absolute bottom-1 right-2 text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">
              Retrieval Strength (RS) →
            </div>

            {/* Quadrant Dividers */}
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50" />
            <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-border/50" />

            {/* Quadrant Labels */}
            <div className="absolute top-2 left-2 text-[8px] font-semibold text-emerald-600/80 dark:text-emerald-400/80">
              DESIRABLE TARGET
              <br />
              (High SS / Low RS)
            </div>
            <div className="absolute top-2 right-2 text-right text-[8px] font-semibold text-sky-600/80 dark:text-sky-400/80">
              FLUENT MASTERY
              <br />
              (High SS / High RS)
            </div>
            <div className="absolute bottom-3 left-2 text-[8px] font-semibold text-muted-foreground/60">
              EXTINCT TRACE
              <br />
              (Low SS / Low RS)
            </div>
            <div className="absolute bottom-3 right-2 text-right text-[8px] font-semibold text-amber-600/80 dark:text-amber-400/80">
              FLUENCY ILLUSION
              <br />
              (Low SS / High RS)
            </div>

            {/* Active Memory Trace Dot with Pulse */}
            <div
              className="absolute z-10 -translate-x-1/2 translate-y-1/2 transition-all duration-700 ease-out"
              style={{
                left: `${Math.max(8, Math.min(92, retrievalStrength * 100))}%`,
                bottom: `${Math.max(8, Math.min(92, storageStrength))}%`,
              }}
            >
              <div className="relative flex items-center justify-center">
                <span className="absolute h-5 w-5 animate-ping rounded-full bg-primary/40" />
                <span className="h-3 w-3 rounded-full bg-primary shadow-md border-2 border-background" />
              </div>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground leading-tight">
            {quadMeta.description}
          </p>
        </div>

        {/* Right Column: Storage, Retrieval, Effort & Delta Metrics (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-3">
          {/* Row of Primary Gauges */}
          <div className="grid grid-cols-2 gap-3">
            {/* Storage Strength (SS) */}
            <div className="rounded-lg border border-border/50 bg-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <Award className="h-3.5 w-3.5 text-primary" /> Storage Strength
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {Math.round(storageStrength)} / 100
                </span>
              </div>
              <ProgressBar value={storageStrength / 100} />
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Half-life: {estimatedHalfLifeHours} hrs</span>
                <span className="text-emerald-500 font-medium">Durable Trace</span>
              </div>
            </div>

            {/* Retrieval Strength (RS) */}
            <div className="rounded-lg border border-border/50 bg-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <Activity className="h-3.5 w-3.5 text-sky-500" /> Retrieval Strength
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {Math.round(retrievalStrength * 100)}%
                </span>
              </div>
              <ProgressBar value={retrievalStrength} />
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Accessibility: {retrievalStrength < 0.5 ? 'Effortful' : 'Immediate'}</span>
                <span>{retrievalStrength < 0.6 ? 'High Potentiation' : 'Low Delta'}</span>
              </div>
            </div>
          </div>

          {/* Secondary Row: Cognitive Effort Index & Projected ΔSS */}
          <div className="grid grid-cols-2 gap-3">
            {/* Cognitive Effort Index (CEI) */}
            <div className="rounded-lg border border-border/50 bg-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <Flame className="h-3.5 w-3.5 text-amber-500" /> Cognitive Effort Index
                </span>
                <span className="font-mono font-semibold text-foreground">{effortIndex} / 100</span>
              </div>
              <ProgressBar value={effortIndex / 100} />
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Friction: {effortIndex >= 70 ? 'High Generative' : 'Moderate'}</span>
                <span>Active Synthesis</span>
              </div>
            </div>

            {/* Projected Storage Delta */}
            <div className="rounded-lg border border-border/50 bg-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <Zap className="h-3.5 w-3.5 text-emerald-500" /> Storage Gain (ΔSS)
                </span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  +{projectedStorageDelta} SS
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Inverse accessibility: Lower RS multiplies long-term storage consolidation.
              </div>
            </div>
          </div>

          {/* Generative Ladder Progression Row */}
          <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5">
            <div className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center justify-between">
              <span>Slamecka (1978) Generative Ladder</span>
              <span className="text-[10px] text-primary">
                Active: Tier {TIERS.find((t) => t.id === activeTier)?.level}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TIERS.map((tier) => {
                const isActive = tier.id === activeTier
                return (
                  <div
                    key={tier.id}
                    className={`rounded border px-2 py-1.5 text-center transition-all ${
                      isActive
                        ? 'border-primary bg-primary/10 shadow-xs'
                        : 'border-border/40 bg-card/60 opacity-70'
                    }`}
                  >
                    <div className="text-[10px] font-semibold text-foreground truncate">
                      {tier.name}
                    </div>
                    <div className="text-[9px] font-mono text-primary font-bold">
                      {tier.multiplier}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
