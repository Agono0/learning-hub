'use client'

/**
 * DeckDoctorSheet — linter-driven deck health diagnostic and one-click fixes.
 * Surfaced via the Deck Doctor button on Decks & Cards.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, RefreshCw, Stethoscope, Trash2, Zap } from 'lucide-react'
import type { DeckDiagnosis, DoctorAction } from '@learning-hub/core/doctor'
import { apiGet, apiSend } from '@/lib/transport'
import { Sheet } from '@/ui'

export interface DeckDoctorSheetProps {
  deckId: number | null
  deckName?: string
  open: boolean
  onClose: () => void
  onApplied?: () => void
}

export function DeckDoctorSheet({
  deckId,
  deckName,
  open,
  onClose,
  onApplied,
}: DeckDoctorSheetProps) {
  const qc = useQueryClient()
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [lastSummary, setLastSummary] = useState<string | null>(null)

  const diagnosisQuery = useQuery({
    queryKey: ['deck-doctor', deckId],
    queryFn: () => apiGet<DeckDiagnosis>(`/api/decks/doctor?deckId=${deckId}`),
    enabled: open && deckId !== null,
  })

  const applyActionsMutation = useMutation({
    mutationFn: (actions: DoctorAction[]) =>
      apiSend<{ ok: boolean; appliedCount: number }>('/api/decks/doctor', 'POST', {
        deckId,
        actions,
      }),
    onSuccess: (data) => {
      setLastSummary(`Applied ${data.appliedCount} fix(es) successfully.`)
      setConfirmDeleteId(null)
      void qc.invalidateQueries({ queryKey: ['deck-doctor', deckId] })
      void qc.invalidateQueries({ queryKey: ['cards'] })
      void qc.invalidateQueries({ queryKey: ['decks'] })
      onApplied?.()
    },
  })

  const diagnosis = diagnosisQuery.data

  const mechanicalActions = (diagnosis?.actions ?? []).filter(
    (a): a is Exclude<DoctorAction, { kind: 'manual' }> => a.kind !== 'manual',
  )
  const manualActions = (diagnosis?.actions ?? []).filter(
    (a): a is Extract<DoctorAction, { kind: 'manual' }> => a.kind === 'manual',
  )

  const scoreTone =
    (diagnosis?.healthScore ?? 100) >= 90
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : (diagnosis?.healthScore ?? 100) >= 70
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-400'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-indigo-400" />
          <span>Deck Doctor — {deckName ?? 'Health Check'}</span>
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button
            className="btn-ghost flex items-center gap-1.5 text-xs text-neutral-400"
            onClick={() => void diagnosisQuery.refetch()}
            disabled={diagnosisQuery.isFetching}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${diagnosisQuery.isFetching ? 'animate-spin' : ''}`}
            />
            Re-check
          </button>
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {diagnosisQuery.isLoading ? (
          <div className="py-8 text-center text-neutral-500">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Analyzing formulation hygiene & interference risks…
          </div>
        ) : diagnosisQuery.isError ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-400">
            Failed to load deck health diagnosis.
          </div>
        ) : diagnosis ? (
          <>
            {/* Health Score Overview */}
            <div className={`rounded-xl border p-4 ${scoreTone}`}>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-2xl font-bold tracking-tight">
                    {diagnosis.healthScore}
                    <span className="text-xs font-normal opacity-70"> / 100</span>
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wider opacity-80">
                    {diagnosis.healthScore >= 90
                      ? 'Optimal Retention Health'
                      : diagnosis.healthScore >= 70
                        ? 'Formulation Issues Detected'
                        : 'High Interference Risk'}
                  </div>
                </div>
                <div className="text-right text-xs opacity-75">
                  <div>{diagnosis.stats.totalCards} total cards</div>
                  <div>{diagnosis.stats.cleanCards} clean cards</div>
                </div>
              </div>

              {/* Stats pills */}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {diagnosis.stats.leechCount > 0 && (
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 font-medium text-rose-300">
                    {diagnosis.stats.leechCount} leech(es)
                  </span>
                )}
                {diagnosis.stats.errorCount > 0 && (
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 font-medium text-rose-300">
                    {diagnosis.stats.errorCount} error(s)
                  </span>
                )}
                {diagnosis.stats.warnCount > 0 && (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-300">
                    {diagnosis.stats.warnCount} warning(s)
                  </span>
                )}
                {diagnosis.stats.infoCount > 0 && (
                  <span className="rounded bg-neutral-500/20 px-2 py-0.5 text-neutral-300">
                    {diagnosis.stats.infoCount} tip(s)
                  </span>
                )}
              </div>
            </div>

            {lastSummary && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{lastSummary}</span>
              </div>
            )}

            {/* Section 1: Mechanical One-Click Fixes */}
            {mechanicalActions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-neutral-200">
                    One-Click Fixes ({mechanicalActions.length})
                  </h3>
                  {mechanicalActions.some((a) => a.kind !== 'delete-card') && (
                    <button
                      className="btn-ghost flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                      onClick={() => {
                        const safeActions = mechanicalActions.filter(
                          (a) => a.kind !== 'delete-card',
                        )
                        applyActionsMutation.mutate(safeActions)
                      }}
                      disabled={applyActionsMutation.isPending}
                    >
                      <Zap className="h-3 w-3" /> Apply Safe Fixes
                    </button>
                  )}
                </div>

                <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-neutral-50/50 dark:divide-(--hub-border) dark:border-(--hub-border) dark:bg-neutral-900/50">
                  {mechanicalActions.map((action, idx) => (
                    <div
                      key={`${action.kind}-${idx}`}
                      className="flex items-center justify-between gap-3 p-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium text-neutral-300">
                          {action.kind === 'suspend-card' && (
                            <span className="text-amber-400">
                              Suspend Leech (Card #{action.cardId})
                            </span>
                          )}
                          {action.kind === 'delete-card' && (
                            <span className="text-rose-400">
                              Delete Duplicate (Card #{action.cardId})
                            </span>
                          )}
                          {action.kind === 'regenerate-cloze' && (
                            <span className="text-indigo-400">
                              Convert to Cloze (Card #{action.cardId})
                            </span>
                          )}
                          {action.kind === 'rename-deck' && (
                            <span className="text-emerald-400">Rename Generic Deck</span>
                          )}
                        </div>
                        <div className="text-neutral-500">
                          {action.kind === 'suspend-card' &&
                            'Consecutive lapses defeat recall. Suspending halts forgetting cycles.'}
                          {action.kind === 'delete-card' && action.reason}
                          {action.kind === 'regenerate-cloze' &&
                            'Sentence-length basic answer tests more efficiently as a fill-in cloze.'}
                          {action.kind === 'rename-deck' && `Rename to "${action.to}"`}
                        </div>
                      </div>

                      <div>
                        {action.kind === 'delete-card' ? (
                          confirmDeleteId === action.cardId ? (
                            <div className="flex items-center gap-1">
                              <button
                                className="rounded bg-rose-600 px-2 py-1 text-white hover:bg-rose-500"
                                onClick={() => applyActionsMutation.mutate([action])}
                                disabled={applyActionsMutation.isPending}
                              >
                                Confirm
                              </button>
                              <button
                                className="btn-ghost px-1.5 py-1"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn-ghost flex items-center gap-1 text-rose-400 hover:text-rose-300"
                              onClick={() => setConfirmDeleteId(action.cardId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          )
                        ) : (
                          <button
                            className="btn-ghost text-indigo-400 hover:text-indigo-300"
                            onClick={() => applyActionsMutation.mutate([action])}
                            disabled={applyActionsMutation.isPending}
                          >
                            Fix
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: Cognitive Formulation Guidelines */}
            {manualActions.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-neutral-200">
                  Formulation Recommendations ({manualActions.length})
                </h3>
                <div className="space-y-2">
                  {manualActions.map((manual) => (
                    <div
                      key={manual.rule}
                      className="rounded-lg border border-neutral-200 p-3 text-xs dark:border-(--hub-border) dark:bg-neutral-900/30"
                    >
                      <div className="flex items-center gap-1.5 font-medium text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>{manual.rule}</span>
                        <span className="text-neutral-500">
                          ({manual.cardIds.length} card{manual.cardIds.length === 1 ? '' : 's'})
                        </span>
                      </div>
                      <p className="mt-1 text-neutral-400">{manual.hint}</p>
                      <div className="mt-2 text-[11px] text-neutral-500">
                        Affected cards: #{manual.cardIds.slice(0, 10).join(', #')}
                        {manual.cardIds.length > 10 && ` and ${manual.cardIds.length - 10} more`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diagnosis.actions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-center text-neutral-400">
                <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />
                <div className="font-semibold text-neutral-200">Deck in pristine health!</div>
                <div className="text-xs text-neutral-500">
                  No interference risks, leeches, or formulation violations found.
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Sheet>
  )
}
