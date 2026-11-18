'use client'

/**
 * @file apps/web/src/ui/SkillsHUD.tsx
 * @description Real-time Agent Skills & Autonomous Engineering Execution HUD.
 *
 * Visualizes:
 * - Skill identity & category (Engineering, Pedagogy, Metacognition, Review, Architecture).
 * - Socratic clarity index & engineering rigor gauges.
 * - Multi-phase execution progress (Discovery -> Edge Cases -> Invariants -> Resolution).
 * - Active tool requirements & suggested next workflow handoff.
 */

import React from 'react'
import type { SkillDefinition, SkillExecutionResult } from '@learning-hub/core/skills'
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  Code2,
  Cpu,
  Layers,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
} from 'lucide-react'
import { Badge } from './Feedback'
import { ProgressBar } from './Progress'

export interface SkillsHUDProps {
  skill: SkillDefinition
  currentPhaseIndex?: number
  lastResult?: SkillExecutionResult | null
  onSelectNextSkill?: (skillId: string) => void
  className?: string
}

const CATEGORY_CONFIG: Record<
  string,
  {
    label: string
    tone: 'violet' | 'accent' | 'neutral' | 'success' | 'warning' | 'danger'
    icon: React.ReactNode
  }
> = {
  engineering: { label: 'Engineering', tone: 'accent', icon: <Terminal className="h-3 w-3" /> },
  pedagogy: { label: 'Pedagogy', tone: 'success', icon: <Brain className="h-3 w-3" /> },
  metacognition: { label: 'Metacognition', tone: 'violet', icon: <Sparkles className="h-3 w-3" /> },
  review: { label: 'Code Review', tone: 'warning', icon: <ShieldCheck className="h-3 w-3" /> },
  architecture: { label: 'Architecture', tone: 'accent', icon: <Code2 className="h-3 w-3" /> },
}

export function SkillsHUD({
  skill,
  currentPhaseIndex = 0,
  lastResult,
  onSelectNextSkill,
  className = '',
}: SkillsHUDProps) {
  const cat = CATEGORY_CONFIG[skill.meta.category] ?? {
    label: skill.meta.category,
    tone: 'neutral' as const,
    icon: <Cpu className="h-3 w-3" />,
  }

  const clarity = lastResult?.clarityIndex ?? 85
  const rigor = lastResult?.rigorScore ?? 90
  const phases = skill.phases

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 backdrop-blur-md space-y-4 ${className}`}
    >
      {/* Header bar: Identity, Author, Version */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">{skill.meta.title}</h3>
              <Badge tone={cat.tone}>
                <span className="flex items-center gap-1">
                  {cat.icon}
                  {cat.label}
                </span>
              </Badge>
            </div>
            <p className="text-[11px] text-neutral-400">
              v{skill.meta.version} · Author: {skill.meta.author}
            </p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          {skill.meta.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-mono text-neutral-400 border border-white/5"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Real-time Telemetry Gauges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Clarity Index */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-neutral-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-400" /> Socratic Clarity
          </span>
          <div className="text-xl font-bold font-mono text-amber-300">{clarity}%</div>
          <ProgressBar value={clarity / 100} label="Socratic clarity index" />
          <p className="text-[9px] text-neutral-500">Ambiguity reduction index</p>
        </div>

        {/* Rigor Score */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-neutral-400 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-emerald-400" /> Invariant Rigor
          </span>
          <div className="text-xl font-bold font-mono text-emerald-300">{rigor}%</div>
          <ProgressBar value={rigor / 100} label="Invariant rigor score" />
          <p className="text-[9px] text-neutral-500">Rules & edge-case coverage</p>
        </div>

        {/* Phases Completed */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-neutral-400 flex items-center gap-1">
            <Layers className="h-3 w-3 text-indigo-400" /> Pipeline Stage
          </span>
          <div className="text-xl font-bold font-mono text-white">
            {phases.length > 0 ? `${currentPhaseIndex + 1}/${phases.length}` : 'Direct'}
          </div>
          <ProgressBar
            value={phases.length > 0 ? (currentPhaseIndex + 1) / phases.length : 1}
            label="Pipeline stage progression"
          />
          <p className="text-[9px] text-neutral-500">
            {phases[currentPhaseIndex]?.name ?? 'Complete'}
          </p>
        </div>

        {/* Required Tools */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1">
          <span className="text-[10px] font-semibold uppercase text-neutral-400 flex items-center gap-1">
            <Wrench className="h-3 w-3 text-sky-400" /> Active Capabilities
          </span>
          <div className="text-xl font-bold font-mono text-sky-300">
            {skill.meta.requiredTools.length > 0 ? skill.meta.requiredTools.length : 'Zero I/O'}
          </div>
          <div className="flex flex-wrap gap-1 pt-0.5">
            {skill.meta.requiredTools.length > 0 ? (
              skill.meta.requiredTools.map((t) => (
                <span
                  key={t}
                  className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-mono text-sky-300"
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-neutral-500">Pure cognitive logic</span>
            )}
          </div>
        </div>
      </div>

      {/* Phase Progression Stepper */}
      {phases.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-semibold uppercase text-neutral-400">
            Phase Continuum
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {phases.map((p, idx) => {
              const isPast = idx < currentPhaseIndex
              const isCurrent = idx === currentPhaseIndex
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-2 text-xs transition ${
                    isCurrent
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                      : isPast
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-neutral-300'
                        : 'border-white/5 bg-black/10 text-neutral-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    {isPast ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Activity
                        className={`h-3.5 w-3.5 ${isCurrent ? 'text-indigo-400' : 'text-neutral-600'} shrink-0`}
                      />
                    )}
                    <span className="truncate">{p.name}</span>
                  </div>
                  <p className="mt-1 text-[9px] text-neutral-400 line-clamp-1">{p.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Suggested Next Skill Handoff */}
      {lastResult?.suggestedNextSkill && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span>
              Recommended Next Workflow Skill: <strong>/{lastResult.suggestedNextSkill}</strong>
            </span>
          </div>
          {onSelectNextSkill && (
            <button
              type="button"
              onClick={() => onSelectNextSkill(lastResult.suggestedNextSkill!)}
              className="flex items-center gap-1 text-[11px] font-semibold hover:text-white"
            >
              Activate <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
