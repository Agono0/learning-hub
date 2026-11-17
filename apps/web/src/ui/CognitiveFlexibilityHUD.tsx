'use client'

/**
 * @file apps/web/src/ui/CognitiveFlexibilityHUD.tsx
 * @description Telemetry HUD for Cognitive Flexibility & Multi-Perspective Shifting.
 *
 * Visualizes:
 * - Rand J. Spiro (1988) Landscape Criss-Crossing Coverage Density
 * - Shannon Entropy Perspective Dispersion Index (PDI)
 * - Edward de Bono (1985) Six Thinking Hats Coverage
 * - Feltovich, Spiro & Coulson (1989) Reductive Trap Immunity
 */

import React from 'react'
import {
  AlertTriangle,
  Brain,
  Compass,
  Cpu,
  Eye,
  Flame,
  Globe,
  HelpCircle,
  Layers,
  Lightbulb,
  Scale,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import {
  CognitiveFlexibilityEvaluation,
  PerspectiveLens,
  ThinkingHatType,
} from '@learning-hub/core/flexibility/cognitive-flexibility-engine'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'

export interface CognitiveFlexibilityHUDProps {
  evaluation: CognitiveFlexibilityEvaluation
  activeHat: ThinkingHatType
  activeLens: PerspectiveLens
  onSelectHat?: (hat: ThinkingHatType) => void
  onSelectLens?: (lens: PerspectiveLens) => void
}

const HAT_CONFIG: Record<
  ThinkingHatType,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string }
> = {
  white_hat: {
    label: 'White: Facts & Data',
    icon: HelpCircle,
    color: 'text-slate-100',
    bg: 'bg-slate-700/50',
    border: 'border-slate-500/40',
  },
  red_hat: {
    label: 'Red: Gut & Emotion',
    icon: Flame,
    color: 'text-rose-400',
    bg: 'bg-rose-950/40',
    border: 'border-rose-500/40',
  },
  black_hat: {
    label: 'Black: Risk & Traps',
    icon: ShieldAlert,
    color: 'text-amber-400',
    bg: 'bg-amber-950/40',
    border: 'border-amber-500/40',
  },
  yellow_hat: {
    label: 'Yellow: Upsides & Value',
    icon: Sparkles,
    color: 'text-yellow-400',
    bg: 'bg-yellow-950/40',
    border: 'border-yellow-500/40',
  },
  green_hat: {
    label: 'Green: Lateral Moves',
    icon: Lightbulb,
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-500/40',
  },
  blue_hat: {
    label: 'Blue: Orchestration',
    icon: Compass,
    color: 'text-sky-400',
    bg: 'bg-sky-950/40',
    border: 'border-sky-500/40',
  },
}

const LENS_CONFIG: Record<
  PerspectiveLens,
  { label: string; icon: React.ElementType; desc: string }
> = {
  mechanistic_technical: {
    label: 'Mechanistic',
    icon: Cpu,
    desc: 'Throughput, algorithms & physical architectures',
  },
  socio_economic: {
    label: 'Socio-Economic',
    icon: Scale,
    desc: 'Market incentives, costs, human coordination',
  },
  ecological_systemic: {
    label: 'Ecological',
    icon: Globe,
    desc: 'Feedback loops, environmental resilience',
  },
  teleological_ethical: {
    label: 'Ethical',
    icon: Eye,
    desc: 'Stakeholder equity, purpose, moral alignment',
  },
}

export function CognitiveFlexibilityHUD({
  evaluation,
  activeHat,
  activeLens,
  onSelectHat,
  onSelectLens,
}: CognitiveFlexibilityHUDProps) {
  const pdiPercentage = Math.round(evaluation.perspectiveDispersionIndex * 100)
  const crissCrossPercentage = Math.round(evaluation.crissCrossDensity * 100)

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md">
      {/* Top Telemetry Metric Ribbons */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Metric 1: Perspective Dispersion Index (Shannon Entropy) */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-cyan-400" />
              Entropy (PDI)
            </span>
            <span className="font-mono text-cyan-300">{pdiPercentage}%</span>
          </div>
          <ProgressBar value={evaluation.perspectiveDispersionIndex} />
          <span className="text-[10px] text-slate-500">
            H(P) = {evaluation.perspectiveDispersionIndex.toFixed(2)} / 1.00
          </span>
        </div>

        {/* Metric 2: Landscape Criss-Cross Density */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-violet-400" />
              Criss-Cross
            </span>
            <span className="font-mono text-violet-300">{crissCrossPercentage}%</span>
          </div>
          <ProgressBar value={evaluation.crissCrossDensity} />
          <span className="text-[10px] text-slate-500">Thematic node coverage across cases</span>
        </div>

        {/* Metric 3: Reductive Bias Immunity */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              Trap Immunity
            </span>
            <span className="font-mono text-amber-300">{evaluation.reductiveBiasMastery}%</span>
          </div>
          <ProgressBar value={evaluation.reductiveBiasMastery / 100} />
          <span className="text-[10px] text-slate-500">Oversimplification traps disproven</span>
        </div>

        {/* Metric 4: Composite Flexibility Score */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              CFT Score
            </span>
            <span className="font-mono text-emerald-300">
              {evaluation.cognitiveFlexibilityScore}/100
            </span>
          </div>
          <ProgressBar value={evaluation.cognitiveFlexibilityScore / 100} />
          <span className="text-[10px] text-slate-500">
            {evaluation.hatCoverageCount}/6 Hats · {evaluation.lensCoverageCount}/4 Lenses
          </span>
        </div>
      </div>

      {/* Cognitive Rigidity Alert Banner */}
      {evaluation.cognitiveRigidityWarning && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs leading-relaxed text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <div>
            <span className="font-bold uppercase tracking-wider text-rose-300">
              Cognitive Rigidity Warning:
            </span>{' '}
            You are analyzing this ill-structured problem primarily through a single mode. Activate
            opposing hats (Yellow/Green or Black/Red) to break out of this cognitive rut.
          </div>
        </div>
      )}

      {/* Six Thinking Hats Parallel Selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            De Bono Parallel Thinking Modalities (Six Hats)
          </span>
          <Badge tone="neutral" className="text-[10px]">
            Active Hat Mode
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {(Object.keys(HAT_CONFIG) as ThinkingHatType[]).map((hat) => {
            const config = HAT_CONFIG[hat]
            const isSelected = activeHat === hat
            const Icon = config.icon

            return (
              <button
                key={hat}
                type="button"
                onClick={() => onSelectHat?.(hat)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                  isSelected
                    ? `${config.bg} ${config.border} ring-2 ring-cyan-400/50 shadow-md`
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
                <span
                  className={`text-xs font-medium truncate ${isSelected ? config.color : 'text-slate-300'}`}
                >
                  {config.label.split(':')[0]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Four Systemic Perspective Lenses Selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Spiro CFT Interpretive Lenses
          </span>
          <Badge tone="neutral" className="text-[10px]">
            Re-Representation Lenses
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(LENS_CONFIG) as PerspectiveLens[]).map((lens) => {
            const config = LENS_CONFIG[lens]
            const isSelected = activeLens === lens
            const Icon = config.icon

            return (
              <button
                key={lens}
                type="button"
                onClick={() => onSelectLens?.(lens)}
                className={`flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-cyan-500/50 bg-cyan-950/30 ring-1 ring-cyan-400/40 shadow'
                    : 'border-slate-800 bg-slate-950/30 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon
                    className={`h-3.5 w-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`}
                  />
                  <span
                    className={`text-xs font-bold ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}
                  >
                    {config.label}
                  </span>
                </div>
                <span className="text-[10px] leading-tight text-slate-400 truncate">
                  {config.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
