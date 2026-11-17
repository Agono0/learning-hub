'use client'

import React, { useMemo } from 'react'
import { Activity, Heart, ShieldAlert, Sparkles, Wind } from 'lucide-react'
import { calculateHrvMetrics, type HrvMetrics } from '@learning-hub/core/coherence'
import { cx } from './cx'

export interface CardiacCoherenceHUDProps {
  /** Inter-beat intervals stream (IBI in ms) */
  interBeatIntervals?: number[]
  /** Override metrics if pre-computed */
  metricsOverride?: Partial<HrvMetrics>
  /** Active protocol name */
  protocolName?: string
  /** Whether a breathing session is currently active */
  isBreathingActive?: boolean
  /** Trigger to open full breathing studio modal */
  onOpenStudio?: () => void
  /** Class name */
  className?: string
}

export function CardiacCoherenceHUD({
  interBeatIntervals = [],
  metricsOverride,
  protocolName = '0.1 Hz Baroreflex Resonance',
  isBreathingActive = false,
  onOpenStudio,
  className,
}: CardiacCoherenceHUDProps) {
  const metrics = useMemo(() => {
    if (metricsOverride && metricsOverride.coherenceRatio !== undefined) {
      return {
        ...calculateHrvMetrics(interBeatIntervals),
        ...metricsOverride,
      } as HrvMetrics
    }
    return calculateHrvMetrics(interBeatIntervals)
  }, [interBeatIntervals, metricsOverride])

  const {
    heartRateBpm,
    rmssd,
    coherenceRatio,
    coherenceTier,
    autonomicState,
    cognitiveReadinessScore,
  } = metrics

  // Visual meter styling based on coherence tier
  const tierColors = {
    high: {
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      ring: 'stroke-emerald-400',
      fill: 'fill-emerald-500/20',
      glow: 'shadow-emerald-500/20',
      label: 'High Coherence',
    },
    moderate: {
      badge: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
      ring: 'stroke-sky-400',
      fill: 'fill-sky-500/20',
      glow: 'shadow-sky-500/20',
      label: 'Moderate Coherence',
    },
    low: {
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      ring: 'stroke-amber-400',
      fill: 'fill-amber-500/20',
      glow: 'shadow-amber-500/20',
      label: 'Sub-Optimal Coherence',
    },
  }[coherenceTier]

  const autonomicLabels = {
    sympathetic_stress: { label: 'Sympathetic Stress', color: 'text-rose-400', icon: ShieldAlert },
    balanced_readiness: { label: 'Balanced Readiness', color: 'text-emerald-400', icon: Activity },
    deep_parasympathetic: { label: 'Deep Parasympathetic', color: 'text-teal-400', icon: Sparkles },
    fatigued: { label: 'Autonomic Fatigue', color: 'text-amber-400', icon: Heart },
  }[autonomicState]

  const StateIcon = autonomicLabels.icon

  // SVG circular arc parameters (radius 36, circumference ~226.2)
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - coherenceRatio * circumference

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md transition-all',
        tierColors.glow,
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Coherence Gauge Orb */}
        <div className="flex items-center gap-4">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 88 88">
              {/* Background track */}
              <circle
                cx="44"
                cy="44"
                r={radius}
                className="stroke-slate-800"
                strokeWidth="6"
                fill="transparent"
              />
              {/* Coherence progress arc */}
              <circle
                cx="44"
                cy="44"
                r={radius}
                className={cx('transition-all duration-700 ease-out', tierColors.ring)}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-bold text-white tracking-tight">
                {Math.round(coherenceRatio * 100)}%
              </span>
              <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                Coherence
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  tierColors.badge,
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {tierColors.label}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                <StateIcon className={cx('h-3.5 w-3.5', autonomicLabels.color)} />
                {autonomicLabels.label}
              </span>
            </div>

            <p className="text-sm font-medium text-slate-200">
              {isBreathingActive ? (
                <span className="text-emerald-300">Pacer Active: {protocolName}</span>
              ) : (
                <span>
                  Cognitive Readiness Score:{' '}
                  <strong className="text-white">{cognitiveReadinessScore}/100</strong>
                </span>
              )}
            </p>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>
                BPM: <strong className="text-slate-200">{heartRateBpm}</strong>
              </span>
              <span>•</span>
              <span>
                RMSSD: <strong className="text-slate-200">{rmssd} ms</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right Action: Open Studio / Start Coherence Reset */}
        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600/20 border border-indigo-500/40 px-4 py-2.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 hover:text-white transition-all active:scale-95 shadow-sm"
          >
            <Wind className="h-4 w-4" />
            <span>{isBreathingActive ? 'Adjust Pacer' : 'Prime Focus (2 min)'}</span>
          </button>
        )}
      </div>

      {/* Recommendation footer */}
      {metrics.recommendation && (
        <div className="mt-4 border-t border-white/5 pt-3 text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">Autonomic Insight:</span>{' '}
          {metrics.recommendation}
        </div>
      )}
    </div>
  )
}
