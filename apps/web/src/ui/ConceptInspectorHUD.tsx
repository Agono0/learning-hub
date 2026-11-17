'use client'

import React from 'react'
import { Activity, AlertTriangle, Compass, Layers, Sparkles, Zap } from 'lucide-react'
import { cx } from './cx'

export interface ConceptPrerequisiteItem {
  id: string
  title: string
  mastery: number
  isMastered: boolean
}

export interface ConceptInspectorProps {
  conceptId?: string
  title?: string
  domain?: string
  mastery?: number // 0.0 - 1.0
  retention?: number // 0.0 - 1.0
  fsrsStabilityDays?: number
  lapses?: number
  prerequisites?: ConceptPrerequisiteItem[]
  dependentsCount?: number
  isBottleneck?: boolean
  bottleneckReason?: string
  node?: {
    id: string
    title: string
    domain?: string
    mastery?: number
    masteryProbability?: number
    retention?: number
    retentionProbability?: number
    fsrsStabilityDays?: number
    totalReviews?: number
    lastPracticedDaysAgo?: number
    isBottleneck?: boolean
    tags?: string[]
  }
  onStartRemedialDrill?: (conceptId: string) => void
  onLaunchRemedialDrill?: (conceptId: string) => void
  onSimulateLearningPath?: (conceptId: string) => void
  onExploreLearningPath?: (conceptId: string) => void
  onClose?: () => void
  className?: string
}

export function ConceptInspectorHUD({
  conceptId,
  title,
  domain,
  mastery,
  retention,
  fsrsStabilityDays,
  lapses = 0,
  prerequisites = [],
  dependentsCount = 0,
  isBottleneck,
  bottleneckReason,
  node,
  onStartRemedialDrill,
  onLaunchRemedialDrill,
  onSimulateLearningPath,
  onExploreLearningPath,
  onClose,
  className,
}: ConceptInspectorProps) {
  const activeId = conceptId ?? node?.id ?? ''
  const activeTitle = title ?? node?.title ?? ''
  const activeDomain = domain ?? node?.domain ?? 'General'
  const activeMastery = mastery ?? node?.masteryProbability ?? node?.mastery ?? 0
  const activeRetention = retention ?? node?.retentionProbability ?? node?.retention ?? 0
  const activeStability = fsrsStabilityDays ?? node?.fsrsStabilityDays
  const activeBottleneck = isBottleneck ?? node?.isBottleneck ?? false
  const drillHandler = onStartRemedialDrill ?? onLaunchRemedialDrill
  const pathHandler = onSimulateLearningPath ?? onExploreLearningPath

  const masteryPct = Math.round(activeMastery * 100)
  const retentionPct = Math.round(activeRetention * 100)

  const isMastered = activeMastery >= 0.8
  const isWeak = activeMastery < 0.6

  const tierStyles = isMastered
    ? {
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        bar: 'bg-emerald-400',
        glow: 'shadow-emerald-500/20',
        status: 'Mastered Concept',
      }
    : isWeak
      ? {
          badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          bar: 'bg-rose-500',
          glow: 'shadow-rose-500/20',
          status: 'Needs Consolidation',
        }
      : {
          badge: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
          bar: 'bg-sky-400',
          glow: 'shadow-sky-500/20',
          status: 'Learning in Progress',
        }

  const unmasteredPrereqs = prerequisites.filter((p) => !p.isMastered)

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xl transition-all',
        tierStyles.glow,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                tierStyles.badge,
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              {tierStyles.status}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
              <Layers className="h-3 w-3 text-indigo-400" />
              {activeDomain}
            </span>
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">{activeTitle}</h3>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white transition-all text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Critical Curriculum Bottleneck Banner */}
      {activeBottleneck && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Curriculum Bottleneck</span>
          </div>
          {bottleneckReason && (
            <p className="mt-1 text-[11px] text-amber-200/90 leading-relaxed">{bottleneckReason}</p>
          )}
        </div>
      )}

      {/* Mastery & Retention Dual Gauges */}
      <div className="my-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/5 p-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" /> BKT Mastery
            </span>
            <span className="font-bold text-white">{masteryPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={cx('h-full transition-all duration-700', tierStyles.bar)}
              style={{ width: `${masteryPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/5 p-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-sky-400" /> FSRS Retention
            </span>
            <span className="font-bold text-white">{retentionPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-sky-400 transition-all duration-700"
              style={{ width: `${retentionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Prerequisite Bottlenecks Alert */}
      {unmasteredPrereqs.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-rose-400 mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{unmasteredPrereqs.length} Foundational Prerequisite(s) Unmastered</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed mb-2">
            Progress on this concept will be impeded until prerequisite foundations are reinforced.
          </p>
          <div className="space-y-1">
            {unmasteredPrereqs.map((prereq) => (
              <div
                key={prereq.id}
                className="flex items-center justify-between rounded-lg bg-black/30 px-2 py-1 text-[11px]"
              >
                <span className="text-slate-200">{prereq.title}</span>
                <span className="font-mono text-rose-400">{Math.round(prereq.mastery * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta Specs */}
      <div className="mb-4 flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Lapses: <strong className="text-white">{lapses}</strong>
        </span>
        {activeStability != null && (
          <>
            <span>•</span>
            <span>
              Stability: <strong className="text-white font-mono">{activeStability}d</strong>
            </span>
          </>
        )}
        <span>•</span>
        <span>
          Dependents: <strong className="text-white">{dependentsCount} concepts</strong>
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-2">
        {pathHandler && (
          <button
            type="button"
            onClick={() => pathHandler(activeId)}
            className="flex w-full sm:flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/20 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 hover:text-white transition-all active:scale-95 shadow-sm"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Learning Trail</span>
          </button>
        )}

        {drillHandler && (
          <button
            type="button"
            onClick={() => drillHandler(activeId)}
            className="flex w-full sm:flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 hover:text-white transition-all active:scale-95 shadow-sm"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Targeted Drill</span>
          </button>
        )}
      </div>
    </div>
  )
}
