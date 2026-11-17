'use client'

import React from 'react'
import { AlertTriangle, CheckCircle2, Gauge, Layers, Shuffle, TrendingUp } from 'lucide-react'
import type { DifficultyAuditReport } from '@learning-hub/core'
import { cx } from './cx'

export interface TechniqueAuditHUDProps {
  report: DifficultyAuditReport
  className?: string
}

const VERDICT_TONE: Record<string, string> = {
  no_data: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
  massed: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
  blocked: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
  fluency_trap: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
  mostly_blocked: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  mixed: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  daily_grind: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
  spaced: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
  interleaved: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
  moderate: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  elevated: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  difficulty_healthy: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  well_spaced: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  well_interleaved: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  low: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  high: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
}

function tone(level: string): string {
  return VERDICT_TONE[level] ?? VERDICT_TONE.no_data
}

function badge(level: string, labelOverride?: string): string {
  return labelOverride ?? level.replace(/_/g, ' ')
}

/**
 * Technique-audit telemetry HUD (getdesign dark-glass style): difficulty
 * dividend gauge, fluency-illusion risk, spacing + interleaving verdicts, and
 * the substitution plan's expected dividend delta. Renders the pure core
 * report — never fabricated numbers.
 */
export function TechniqueAuditHUD({ report, className }: TechniqueAuditHUDProps) {
  const { mix, risk, spacing, interleaving, compositeIndex, nextBestAction } = report

  const indexTone =
    compositeIndex >= 70
      ? 'text-emerald-300'
      : compositeIndex >= 50
        ? 'text-sky-300'
        : compositeIndex >= 30
          ? 'text-amber-300'
          : 'text-rose-300'

  const dividendPct = Math.round(mix.difficultyDividend)

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-2xl border bg-slate-900/90 shadow-2xl backdrop-blur-xl transition-all',
        compositeIndex >= 50
          ? 'border-emerald-500/30 shadow-emerald-950/20'
          : 'border-amber-500/40 shadow-amber-950/20',
        className,
      )}
      data-testid="technique-audit-hud"
    >
      {/* Top banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/50 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/20 text-emerald-400">
            <Gauge className="h-4 w-4" />
          </span>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Dunlosky et al. (2013) Technique Audit
            </span>
            <span className="text-xs font-bold text-white">
              Difficulty Dividend • {mix.totalMinutes} min self-reported
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {mix.status === 'fluency_trap' ? (
            <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-extrabold text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Fluency trap
            </span>
          ) : mix.status === 'difficulty_healthy' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Difficulty-healthy
            </span>
          ) : null}
          <div className="flex items-center gap-1.5">
            <span className={cx('font-mono text-lg font-black', indexTone)}>
              {Math.round(compositeIndex)}
            </span>
            <span className="text-[10px] font-mono text-slate-400">/100</span>
          </div>
        </div>
      </div>

      {/* Telemetry grid */}
      <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5 bg-slate-900/50 text-center text-xs sm:grid-cols-4">
        <div className="p-3">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-400">
            Difficulty Dividend
          </span>
          <span
            className={cx(
              'font-mono text-base font-black',
              dividendPct >= 70
                ? 'text-emerald-300'
                : dividendPct >= 45
                  ? 'text-sky-300'
                  : 'text-amber-300',
            )}
          >
            {mix.totalMinutes > 0 ? dividendPct : '—'}
          </span>
          <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="bg-emerald-400"
              style={{
                width: `${mix.totalMinutes > 0 ? (mix.highUtilityMinutes / mix.totalMinutes) * 100 : 0}%`,
              }}
            />
            <div
              className="bg-slate-500"
              style={{
                width: `${mix.totalMinutes > 0 ? ((mix.totalMinutes - mix.highUtilityMinutes - mix.lowUtilityMinutes) / mix.totalMinutes) * 100 : 0}%`,
              }}
            />
            <div
              className="bg-rose-400"
              style={{
                width: `${mix.totalMinutes > 0 ? (mix.lowUtilityMinutes / mix.totalMinutes) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            green = high-utility minutes
          </span>
        </div>

        <div className="p-3">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-400">
            Fluency-Illusion Risk
          </span>
          <span
            className={cx(
              'font-mono text-base font-black',
              risk.risk >= 0.65
                ? 'text-rose-300'
                : risk.risk >= 0.45
                  ? 'text-amber-300'
                  : 'text-emerald-300',
            )}
          >
            {Math.round(risk.risk * 100)}%
          </span>
          <span
            className={cx(
              'mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold',
              tone(risk.label),
            )}
          >
            {badge(risk.label)}
          </span>
        </div>

        <div className="p-3">
          <span className="mb-0.5 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-slate-400">
            <TrendingUp className="h-3 w-3" /> Spacing
          </span>
          <span
            className={cx(
              'mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold',
              tone(spacing.verdict),
            )}
          >
            {badge(spacing.verdict)}
          </span>
          <span className="mt-1 block text-[10px] text-slate-500">
            {spacing.totalMinutes} min · {Math.round(spacing.activeDayRatio * 100)}% days active
          </span>
        </div>

        <div className="p-3">
          <span className="mb-0.5 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase text-slate-400">
            <Shuffle className="h-3 w-3" /> Interleaving
          </span>
          <span
            className={cx(
              'mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold',
              tone(interleaving.verdict),
            )}
          >
            {badge(interleaving.verdict)}
          </span>
          <span className="mt-1 block text-[10px] text-slate-500">
            {Math.round(interleaving.switchRate * 100)}% deck switches
          </span>
        </div>
      </div>

      {/* Substitution footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 px-5 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Layers className="h-3.5 w-3.5 text-emerald-400" />
          <span>
            Next: <strong className="text-white">{nextBestAction}</strong>
          </span>
        </div>
        {report.substitutions.length > 0 && (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
            +{report.substitutions.reduce((a, s) => a + s.dividendDelta, 0).toFixed(0)} dividend
            points available
          </span>
        )}
      </div>
    </div>
  )
}
