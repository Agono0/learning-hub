'use client'

/**
 * Desirable-Difficulty Audit Studio (Dunlosky et al. 2013).
 *
 * The studio pairs the MEASURED telemetry stream (retrieval minutes, spacing,
 * interleaving — computed server-side from revlog) with a self-reported
 * technique-minute log, because rereading and highlighting are invisible to
 * telemetry and pretending otherwise would fabricate the audit's most
 * important input. Tabs: technique log, mix breakdown, scheduling audits,
 * substitution plan.
 */
import React, { useMemo, useState } from 'react'
import {
  BookOpen,
  Clock3,
  FlaskConical,
  Highlighter,
  Layers,
  ListChecks,
  NotebookPen,
  PenLine,
  Repeat2,
  Shuffle,
  Sparkles,
  ArrowRightLeft,
  Timer,
} from 'lucide-react'
import {
  SELF_REPORT_PROMPTS,
  TECHNIQUE_PROFILES,
  type DifficultyAuditReport,
  type TechniqueUtility,
} from '@learning-hub/core'
import { TechniqueAuditHUD } from '../ui/TechniqueAuditHUD'
import { cx } from '../ui/cx'

export type DifficultyStudioTab = 'log' | 'mix' | 'scheduling' | 'substitutions'

export interface MeasuredPayload {
  retrievalMinutes: number
  sessionCount: number
  retrievalMinutesByDay: number[]
  consecutiveSameDeckReviews: number
  totalReviews: number
  distinctDecks: number
}

export interface DifficultyAuditStudioProps {
  measured: MeasuredPayload
  /** Server-side spacing verdict for the measured stream */
  spacingVerdict: string
  spacingGuidance: string
  /** Server-side interleaving verdict for the measured stream */
  interleavingVerdict: string
  interleavingGuidance: string
  /** Fired when the learner submits their technique minutes */
  onSubmitReport: (
    minutesByTechnique: Record<string, number>,
  ) => Promise<DifficultyAuditReport | null>
  /** Already-computed report (from a prior POST), if any */
  initialReport?: DifficultyAuditReport | null
  className?: string
}

const UTILITY_BADGE: Record<TechniqueUtility, string> = {
  high: 'border-emerald-500/40 bg-emerald-500/10 text-status-success-text',
  moderate: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  low: 'border-rose-500/40 bg-rose-500/10 text-danger-text',
}

const PROMPT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  practice_testing: Repeat2,
  distributed_practice: Clock3,
  interleaved_practice: Shuffle,
  self_explanation: NotebookPen,
  elaborative_interrogation: FlaskConical,
  rereading: BookOpen,
  highlighting: Highlighter,
  summarization: PenLine,
  keyword_mnemonic: Sparkles,
  imagery_for_text: Timer,
}

/**
 * Builds the weekly technique-minute log: one numeric input per technique,
 * ordered by the SELF_REPORT_PROMPTS catalog (high-utility techniques first so
 * the default visual order nudges toward them).
 */
export function DifficultyAuditStudio({
  measured,
  spacingVerdict,
  spacingGuidance,
  interleavingVerdict,
  interleavingGuidance,
  onSubmitReport,
  initialReport = null,
  className,
}: DifficultyAuditStudioProps) {
  void className // layout is data-testid driven; callers may pass classes for spacing
  const [activeTab, setActiveTab] = useState<DifficultyStudioTab>('log')
  const [minutes, setMinutes] = useState<Record<string, number>>({})
  const [report, setReport] = useState<DifficultyAuditReport | null>(initialReport)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const totalLogged = useMemo(
    () => Object.values(minutes).reduce((a, m) => a + (Number(m) || 0), 0),
    [minutes],
  )

  const submit = async () => {
    if (totalLogged <= 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const cleaned: Record<string, number> = {}
      for (const [id, m] of Object.entries(minutes)) {
        const v = Number(m) || 0
        if (v > 0) cleaned[id] = v
      }
      const result = await onSubmitReport(cleaned)
      if (result) {
        setReport(result)
        setActiveTab('mix')
      } else {
        setSubmitError('The audit service did not return a report — try again.')
      }
    } catch {
      setSubmitError('Could not run the audit — check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const tabs: {
    id: DifficultyStudioTab
    label: string
    icon: React.ComponentType<{ className?: string }>
    disabled?: boolean
  }[] = [
    { id: 'log', label: 'Technique Log', icon: NotebookPen },
    { id: 'mix', label: 'Mix Breakdown', icon: Layers, disabled: !report },
    { id: 'scheduling', label: 'Scheduling', icon: Shuffle },
    {
      id: 'substitutions',
      label: 'Substitutions',
      icon: ArrowRightLeft,
      disabled: !report || report.substitutions.length === 0,
    },
  ]

  return (
    <div className="space-y-4" data-testid="difficulty-audit-studio">
      {report && <TechniqueAuditHUD report={report} />}

      {/* Tabs */}
      <div className="scroll-x flex gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              disabled={t.disabled}
              onClick={() => setActiveTab(t.id)}
              aria-pressed={activeTab === t.id}
              className={cx(
                'inline-flex min-w-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors',
                t.disabled && 'cursor-not-allowed opacity-40',
                activeTab === t.id
                  ? 'bg-indigo-500/25 text-indigo-200'
                  : 'text-faint hover:bg-slate-800 hover:text-slate-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Technique log ── */}
      {activeTab === 'log' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h3 className="text-sm font-bold text-white">How did you actually study this week?</h3>
            <p className="mt-1 text-xs leading-relaxed text-faint">
              Log honest minutes per technique. Rereading and highlighting are invisible to the
              app's telemetry — only you can see them, which is exactly why the evidence table
              judges them so harshly.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {SELF_REPORT_PROMPTS.map((p) => {
                const Icon = PROMPT_ICONS[p.techniqueId] ?? NotebookPen
                const profile = TECHNIQUE_PROFILES.find((t) => t.id === p.techniqueId)!
                return (
                  <label
                    key={p.techniqueId}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">{p.question}</span>
                        <span
                          className={cx(
                            'rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase',
                            UTILITY_BADGE[profile.utility],
                          )}
                        >
                          {profile.utility}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-tertiary">
                        {p.helper}
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={2000}
                          step={5}
                          value={minutes[p.techniqueId] ?? ''}
                          onChange={(e) =>
                            setMinutes((m) => ({ ...m, [p.techniqueId]: Number(e.target.value) }))
                          }
                          placeholder="0"
                          aria-label={`Minutes of ${p.question}`}
                          className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-mono text-white"
                        />
                        <span className="text-[10px] text-tertiary">min / week</span>
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-faint">
                Logged <strong className="font-mono text-white">{totalLogged}</strong> min this
                window
              </span>
              <button
                type="button"
                disabled={totalLogged <= 0 || submitting}
                onClick={() => void submit()}
                className={cx(
                  'inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors',
                  totalLogged > 0 && !submitting
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                    : 'cursor-not-allowed bg-slate-800 text-tertiary',
                )}
              >
                <ListChecks className="h-4 w-4" />
                {submitting ? 'Auditing…' : 'Run the audit'}
              </button>
            </div>
            {submitError && <p className="mt-2 text-xs text-danger-text">{submitError}</p>}
          </div>
        </div>
      )}

      {/* ── Mix breakdown ── */}
      {activeTab === 'mix' && report && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h3 className="text-sm font-bold text-white">Your technique mix</h3>
            <p className="mt-1 text-xs text-faint">{report.mix.guidance}</p>
            <ul className="mt-3 space-y-2">
              {report.mix.shares.map((s) => (
                <li key={s.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200">{s.label}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span
                        className={cx(
                          'rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase',
                          UTILITY_BADGE[s.utility],
                        )}
                      >
                        {s.utility} · {s.utilityScore}
                      </span>
                      <span className="font-mono font-bold text-white">
                        {s.minutes} min · {Math.round(s.share * 100)}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={cx(
                        'h-full',
                        s.utility === 'high'
                          ? 'bg-emerald-400'
                          : s.utility === 'moderate'
                            ? 'bg-indigo-400'
                            : 'bg-rose-400',
                      )}
                      style={{ width: `${s.share * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2.5 text-[11px] leading-relaxed text-secondary">
              <strong className="text-white">
                Difficulty Dividend {report.mix.difficultyDividend}:
              </strong>{' '}
              utility-weighted mean over your logged minutes (Dunlosky table: high 90+, moderate
              ~60, low ≤ 30). Every point is a reallocation away, not a grade.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h3 className="text-sm font-bold text-white">Fluency-illusion risk drivers</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-secondary">
              {report.risk.drivers.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  {d}
                </li>
              ))}
              {report.risk.drivers.length === 0 && (
                <li className="text-tertiary">No risk drivers detected this window.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ── Scheduling audits (measured telemetry) ── */}
      {activeTab === 'scheduling' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Clock3 className="h-4 w-4 text-indigo-400" /> Spacing (measured)
              </h3>
              <span
                className={cx(
                  'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                  VERDICT_PILL(spacingVerdict),
                )}
              >
                {spacingVerdict.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-faint">{spacingGuidance}</p>
            <div className="mt-3 flex items-end gap-1" aria-hidden>
              {measured.retrievalMinutesByDay.map((m, i) => (
                <div key={i} className="flex-1">
                  <div
                    className={cx('w-full rounded-t bg-indigo-400/70', m === 0 && 'bg-slate-800')}
                    style={{
                      height: `${Math.max(3, Math.min(48, (m / Math.max(1, Math.max(...measured.retrievalMinutesByDay))) * 48))}px`,
                    }}
                  />
                  <span className="mt-1 block text-center text-[9px] text-tertiary">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][i]}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-tertiary">
              {measured.retrievalMinutes} retrieval minutes · {measured.sessionCount} day-deck
              sessions (from your review log)
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Shuffle className="h-4 w-4 text-status-info-text" /> Interleaving (measured)
              </h3>
              <span
                className={cx(
                  'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                  VERDICT_PILL(interleavingVerdict),
                )}
              >
                {interleavingVerdict.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-faint">{interleavingGuidance}</p>
            <p className="mt-2 text-[11px] text-tertiary">
              {measured.totalReviews} reviews across {measured.distinctDecks} decks
            </p>
          </div>
        </div>
      )}

      {/* ── Substitution plan ── */}
      {activeTab === 'substitutions' && report && report.substitutions.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
            <h3 className="text-sm font-bold text-white">
              Substitution plan — same hours, higher utility
            </h3>
            <p className="mt-1 text-xs text-faint">
              Swaps move up to 80% of each low-utility block into evidence-backed techniques;
              dividends are exact arithmetic on your logged mix, not vibes.
            </p>
          </div>
          {report.substitutions.map((s, i) => (
            <div
              key={`${s.fromId}-${i}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 font-semibold text-slate-200">
                  <span className={cx('rounded-full border px-2 py-0.5', UTILITY_BADGE.low)}>
                    {s.fromLabel}
                  </span>
                  <ArrowRightLeft className="h-3.5 w-3.5 text-status-success-text" />
                  <span className={cx('rounded-full border px-2 py-0.5', UTILITY_BADGE.high)}>
                    {s.toLabel}
                  </span>
                </span>
                <span className="font-mono font-bold text-status-success-text">
                  +{s.dividendDelta} pts
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-secondary">{s.how}</p>
              <p className="mt-1 text-[10px] text-tertiary">
                {s.minutesToMove} min/week reallocated
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Verdict pill tone shared by the scheduling cards. */
function VERDICT_PILL(verdict: string): string {
  if (['well_spaced', 'well_interleaved', 'daily_grind'].includes(verdict)) {
    return 'border-emerald-500/40 bg-emerald-500/10 text-status-success-text'
  }
  if (['spaced', 'interleaved'].includes(verdict)) {
    return 'border-sky-500/40 bg-sky-500/10 text-status-info-text'
  }
  if (verdict === 'no_data') {
    return 'border-slate-500/30 bg-slate-500/10 text-faint'
  }
  if (['mostly_blocked'].includes(verdict)) {
    return 'border-amber-500/40 bg-amber-500/10 text-status-warning-text'
  }
  return 'border-rose-500/40 bg-rose-500/10 text-danger-text'
}
