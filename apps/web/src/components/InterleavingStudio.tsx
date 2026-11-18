'use client'

/**
 * @file InterleavingStudio.tsx
 * @description Interleaved Problem Solving & Structural Invariance Studio.
 *
 * Implements:
 * - Rohrer & Taylor (2007) shuffled mixed-category practice vs blocked comparator
 * - Kornell & Bjork (2008) inductive category discrimination drill (the illusion-aware crucible)
 * - Gick & Holyoak (1983) surface vs deep structural invariant matching
 * - Category confusion matrix telemetry & surface-bias detection
 * - FSRS interleaving deck exporter (identify-the-invariant cards)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  CALIBRATED_INVARIANCE_CATEGORIES,
  CALIBRATED_INVARIANCE_PROBLEMS,
  computeCategoryContrastMatrix,
  computeDiscriminationTelemetry,
  computeSequenceMetrics,
  exportFSRSInterleavingDeck,
  FSRSInterleavingCard,
  ProblemCategory,
  StructuralInvarianceSession,
} from '@learning-hub/core/interleaving/structural-invariance-engine'
import { Badge, Button, InterleavingHUD, Markdown, Panel, ProgressBar } from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Grid3X3,
  Lightbulb,
  RotateCcw,
  Save,
  Shuffle,
  XCircle,
  Zap,
} from 'lucide-react'

export interface InterleavingStudioProps {
  initialCategories?: ProblemCategory[]
  onExportCards?: (cards: FSRSInterleavingCard[]) => void
  /** Target deck for the save-to-deck action (falls back to the first deck). */
  deckId?: number
  /** Called after the identify-the-invariant deck is persisted via the bulk card path. */
  onCardsSaved?: (count: number) => void
}

type StudioTab = 'drill' | 'contrast' | 'deck'
type PracticeMode = 'interleaved' | 'blocked'

function cloneSession(session: StructuralInvarianceSession): StructuralInvarianceSession {
  return Object.assign(Object.create(Object.getPrototypeOf(session)), session)
}

function playStudioTone(freq: number, duration = 0.14, type: OscillatorType = 'sine') {
  void getSharedAudioContext()
    .then((ctx) => {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + duration)
    })
    .catch(() => {
      // Audio playback silent fallback
    })
}

interface AnswerFeedback {
  problemId: string
  chosenCategoryId: string
  correct: boolean
}

export function InterleavingStudio({
  initialCategories = CALIBRATED_INVARIANCE_CATEGORIES,
  onExportCards,
  deckId,
  onCardsSaved,
}: InterleavingStudioProps) {
  const [session, setSession] = useState(
    () => new StructuralInvarianceSession(initialCategories, CALIBRATED_INVARIANCE_PROBLEMS),
  )
  const [mode, setMode] = useState<PracticeMode>('interleaved')
  const [activeTab, setActiveTab] = useState<StudioTab>('drill')
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const questionStartRef = useRef<number>(Date.now())

  // Deck list for persisting the FSRS deck through the canonical bulk card path.
  const [decks, setDecks] = useState<Array<{ id: number; name: string }>>([])
  const [selectedDeckId, setSelectedDeckId] = useState<number | ''>('')
  const [isSaving, setIsSaving] = useState(false)
  const [savedCardIds, setSavedCardIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    void apiGet<{ decks: Array<{ id: number; name: string }> }>('/api/decks')
      .then((data) => {
        if (!cancelled) setDecks(data.decks ?? [])
      })
      .catch(() => {
        // offline fallback: copy-to-clipboard export still works
      })
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveDeckId = useMemo(() => {
    if (selectedDeckId !== '') return selectedDeckId
    if (deckId !== undefined) return deckId
    return decks[0]?.id ?? 1
  }, [selectedDeckId, deckId, decks])

  const state = session.getState()
  const currentProblem = session.getCurrentProblem()
  const isComplete = session.isComplete()

  const categories = state.categories
  const templates = state.templates

  const contrastMatrix = useMemo(
    () => computeCategoryContrastMatrix(categories, templates),
    [categories, templates],
  )
  const sequenceMetrics = useMemo(
    () => computeSequenceMetrics(state.schedule, categories, templates),
    [state.schedule, categories, templates],
  )
  const telemetry = useMemo(
    () => computeDiscriminationTelemetry(state.attempts, categories, templates),
    [state.attempts, categories, templates],
  )
  const deckCards = useMemo(
    () => exportFSRSInterleavingDeck(templates, categories, telemetry.surfaceBiasScore),
    [templates, categories, telemetry.surfaceBiasScore],
  )

  const handleAnswer = (chosenCategoryId: string) => {
    const problem = session.getCurrentProblem()
    if (!problem || feedback) return

    const reactionMs = Date.now() - questionStartRef.current
    const correct = session.answer(chosenCategoryId, reactionMs)

    if (correct) {
      hapticLight()
      playStudioTone(660)
    } else {
      hapticHeavy()
      playStudioTone(220, 0.2, 'triangle')
    }

    setFeedback({
      problemId: problem.id,
      chosenCategoryId,
      correct,
    })
    setSession(cloneSession(session))
  }

  const handleNext = () => {
    hapticMedium()
    setFeedback(null)
    questionStartRef.current = Date.now()
    setSession(cloneSession(session))
  }

  const handleModeChange = (nextMode: PracticeMode) => {
    hapticMedium()
    setMode(nextMode)
    setFeedback(null)
    questionStartRef.current = Date.now()
    session.restart({ mode: nextMode })
    setSession(cloneSession(session))
  }

  const handleCopyDeck = async () => {
    const markdown = deckCards
      .map((c) => `### ${c.id}\n\n**FRONT**\n\n${c.front}\n\n**BACK**\n\n${c.back}`)
      .join('\n\n---\n\n')
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyStatus(`Copied ${deckCards.length} cards`)
    } catch {
      setCopyStatus('Clipboard unavailable')
    }
    window.setTimeout(() => setCopyStatus(null), 2500)
  }

  const handleExport = () => {
    hapticLight()
    onExportCards?.(deckCards)
    void handleCopyDeck()
  }

  /** Persists the identify-the-invariant deck through `PUT /api/cards?bulk=1`. */
  const handleSaveDeck = async () => {
    const pending = deckCards.filter((c) => !savedCardIds.has(c.id))
    if (pending.length === 0 || isSaving) return
    setIsSaving(true)
    hapticLight()

    try {
      await apiSend('/api/cards?bulk=1', 'PUT', {
        deckId: effectiveDeckId,
        items: pending.map((card) => ({
          type: 'basic',
          content: { basic: { front: card.front, back: card.back } },
          tags: card.tags,
        })),
      })
      setSavedCardIds((prev) => new Set([...prev, ...pending.map((c) => c.id)]))
      hapticMedium()
      onCardsSaved?.(pending.length)
    } catch {
      // offline fallback: the copy-to-clipboard export remains available
    } finally {
      setIsSaving(false)
    }
  }

  const answeredProblem = feedback ? templates.find((t) => t.id === feedback.problemId) : undefined
  const trueCat = answeredProblem
    ? categories.find((c) => c.id === answeredProblem.categoryId)
    : undefined

  const tabItems = [
    {
      key: 'drill' as const,
      label: (
        <>
          <Shuffle className="mr-1.5 h-4 w-4 text-ac-text" /> Discrimination Drill
        </>
      ),
    },
    {
      key: 'contrast' as const,
      label: (
        <>
          <Grid3X3 className="mr-1.5 h-4 w-4 text-status-info-text" /> Contrast Matrix
        </>
      ),
    },
    {
      key: 'deck' as const,
      label: (
        <>
          <Download className="mr-1.5 h-4 w-4 text-indigo-500" /> FSRS Deck ({deckCards.length})
        </>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Mode selector: interleaved vs blocked A/B comparator */}
      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-tertiary">
            Practice Schedule
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => handleModeChange('interleaved')}
              aria-pressed={mode === 'interleaved'}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'interleaved'
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-status-success-text'
                  : 'border-neutral-200/60 dark:border-(--hub-border)/60 text-tertiary hover:text-strong'
              }`}
            >
              <Shuffle className="h-3.5 w-3.5" />
              Interleaved (shuffled)
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('blocked')}
              aria-pressed={mode === 'blocked'}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'blocked'
                  ? 'border-amber-500/50 bg-amber-500/15 text-status-warning-text'
                  : 'border-neutral-200/60 dark:border-(--hub-border)/60 text-tertiary hover:text-strong'
              }`}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              Blocked (comparator)
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <Badge tone={mode === 'interleaved' ? 'success' : 'warning'}>
            {mode === 'interleaved' ? 'Rohrer-Taylor optimal' : 'Textbook default'}
          </Badge>
          <span className="tabular-nums">
            {state.cursor}/{state.schedule.length} done
          </span>
        </div>
      </Panel>

      {/* Workspace Navigation Bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200/50 dark:border-(--hub-border)/50 pb-2">
        {tabItems.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab(tab.key)
            }}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'drill' && (
        <div className="flex flex-col gap-4">
          {/* The crucible: current problem */}
          {!isComplete && currentProblem && (
            <Panel>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                    Problem {state.cursor + 1} of {state.schedule.length} · identify the deep
                    structure
                  </span>
                  <Badge tone="neutral">{currentProblem.title}</Badge>
                </div>

                <div className="rounded-xl border border-neutral-200/50 dark:border-(--hub-border)/50 bg-white/40 dark:bg-(--hub-panel)/40 p-4">
                  <Markdown className="text-sm leading-relaxed">{currentProblem.prompt}</Markdown>
                </div>

                {/* Category choice grid */}
                <div
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  role="group"
                  aria-label="Choose the structural category"
                >
                  {categories.map((cat) => {
                    const isChosen = feedback?.chosenCategoryId === cat.id
                    const isTrue = feedback && cat.id === answeredProblem?.categoryId
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        disabled={feedback !== null}
                        onClick={() => handleAnswer(cat.id)}
                        className={`flex min-h-11 flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors ${
                          feedback
                            ? isTrue
                              ? 'border-emerald-500/60 bg-emerald-500/10'
                              : isChosen
                                ? 'border-rose-500/60 bg-rose-500/10'
                                : 'border-neutral-200/40 dark:border-(--hub-border)/40 opacity-60'
                            : 'border-neutral-200/60 dark:border-(--hub-border)/60 hover:border-(--ac-strong)/50 hover:bg-indigo-600/5'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-strong">
                          {feedback && isTrue && (
                            <CheckCircle2 className="h-4 w-4 text-status-success-text" />
                          )}
                          {feedback && isChosen && !isTrue && (
                            <XCircle className="h-4 w-4 text-danger-text" />
                          )}
                          {cat.label}
                        </span>
                        <span className="text-[11px] leading-snug text-tertiary line-clamp-2">
                          {cat.discriminationHint}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Contrastive discrimination crucible feedback */}
                {feedback && answeredProblem && trueCat && (
                  <div
                    className={`rounded-xl border p-4 ${
                      feedback.correct
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-rose-500/40 bg-rose-500/10'
                    }`}
                    role="status"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {feedback.correct ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-status-success-text" />
                          <span className="text-status-success-text">
                            Correct — structure identified
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-danger-text" />
                          <span className="text-danger-text">
                            Surface lure taken — the story lied
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-tertiary">
                      <p>
                        <span className="font-semibold text-strong">Deep invariant:</span>{' '}
                        {trueCat.deepPrinciple}
                      </p>
                      {answeredProblem.surfaceLure && (
                        <p>
                          <span className="font-semibold text-status-warning-text">
                            Why it tricks you:
                          </span>{' '}
                          {answeredProblem.surfaceLure}
                        </p>
                      )}
                      <p>
                        <span className="font-semibold text-strong">Discrimination hint:</span>{' '}
                        {trueCat.discriminationHint}
                      </p>
                    </div>
                    <div className="mt-3">
                      <Button icon={<ArrowRight className="h-4 w-4" />} onClick={handleNext}>
                        {session.isComplete() ? 'See session summary' : 'Next problem'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Session complete summary */}
          {isComplete && (
            <Panel>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-ac-text" />
                  <h3 className="text-sm font-bold text-strong">Session Complete</h3>
                  <Badge tone={telemetry.accuracy >= 0.7 ? 'success' : 'warning'}>
                    {Math.round(telemetry.accuracy * 100)}% discrimination accuracy
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-tertiary">
                  Remember: practice-phase accuracy <em>underestimates</em> long-term retention
                  under interleaving (Rohrer &amp; Taylor 2007). Export the deck below so FSRS can
                  schedule the identify-the-invariant cards, then drill another shuffled pass.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => handleModeChange(mode)}
                  >
                    Restart {mode === 'interleaved' ? 'shuffled' : 'blocked'} pass
                  </Button>
                  <Button variant="ghost" onClick={() => handleModeChange('interleaved')}>
                    Switch to shuffled
                  </Button>
                  <Button variant="ghost" onClick={() => setActiveTab('deck')}>
                    Review FSRS deck
                  </Button>
                </div>
              </div>
            </Panel>
          )}

          {/* Live telemetry HUD */}
          <InterleavingHUD
            telemetry={telemetry}
            sequenceMetrics={sequenceMetrics}
            categories={categories}
            contrastMatrix={contrastMatrix}
            practiceAccuracy={state.practiceAccuracy}
          />
        </div>
      )}

      {activeTab === 'contrast' && (
        <Panel>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5 text-ac-text" />
              <h3 className="text-sm font-bold text-strong">
                Category Contrast Matrix (Carvalho &amp; Goldstone 2014)
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-tertiary">
              Each cell contrasts two problem categories. <strong>Surface distance</strong> — how
              different the stories look; <strong>structural distance</strong> — how different the
              solution invariants are. High contrast utility = look-alike problems that solve
              differently: exactly the pairs shuffled practice must force together.
            </p>
            <div className="overflow-x-auto scroll-x">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-tertiary">
                    <th className="px-2 py-1.5">Pair</th>
                    <th className="px-2 py-1.5">Surface</th>
                    <th className="px-2 py-1.5">Structure</th>
                    <th className="px-2 py-1.5 min-w-32">Contrast Utility</th>
                  </tr>
                </thead>
                <tbody>
                  {contrastMatrix.map((cell) => {
                    const a = categories.find((c) => c.id === cell.categoryA)
                    const b = categories.find((c) => c.id === cell.categoryB)
                    return (
                      <tr
                        key={`${cell.categoryA}-${cell.categoryB}`}
                        className="border-t border-neutral-200/40 dark:border-(--hub-border)/40"
                      >
                        <td className="px-2 py-2 font-medium text-strong">
                          {a?.label} vs {b?.label}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-tertiary">
                          {cell.surfaceDistance.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-tertiary">
                          {cell.structuralDistance.toFixed(2)}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span className="w-8 tabular-nums text-strong">
                              {cell.contrastUtility.toFixed(2)}
                            </span>
                            <ProgressBar value={cell.contrastUtility} label="Contrast utility" />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      )}

      {activeTab === 'deck' && (
        <Panel>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-ac-text" />
                <h3 className="text-sm font-bold text-strong">
                  FSRS Identify-the-Invariant Deck ({deckCards.length} cards)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {copyStatus && <span className="text-xs text-tertiary">{copyStatus}</span>}
                {decks.length > 0 && (
                  <select
                    value={effectiveDeckId}
                    onChange={(e) => setSelectedDeckId(Number(e.target.value))}
                    aria-label="Target deck for saved cards"
                    className="rounded-lg border border-neutral-200/60 dark:border-(--hub-border)/60 bg-white dark:bg-(--hub-panel) px-2 py-1.5 text-xs font-medium text-strong"
                  >
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  icon={<Save className="h-4 w-4" />}
                  onClick={() => void handleSaveDeck()}
                  loading={isSaving}
                >
                  {savedCardIds.size >= deckCards.length
                    ? 'Saved ✓'
                    : `Save ${deckCards.length - savedCardIds.size} to deck`}
                </Button>
                <Button
                  icon={<Copy className="h-4 w-4" />}
                  variant="ghost"
                  onClick={handleCopyDeck}
                >
                  Copy deck
                </Button>
                <Button
                  icon={<Download className="h-4 w-4" />}
                  variant="ghost"
                  onClick={handleExport}
                >
                  Export to FSRS
                </Button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-tertiary">
              One card per problem: the front is the surface story, the back names the deep
              structural invariant, its discrimination hint and the surface lure. Suggested initial
              stability scales with each category&apos;s maximum contrast utility — well-contrasted
              pairs produce more durable schema induction.
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {deckCards.slice(0, 6).map((card) => (
                <div
                  key={card.id}
                  className="rounded-xl border border-neutral-200/50 dark:border-(--hub-border)/50 bg-white/40 dark:bg-(--hub-panel)/40 p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Badge tone="cyan">{card.metadata.categoryId}</Badge>
                    <span className="text-[10px] text-tertiary tabular-nums">
                      S₀ {card.suggestedInitialStability} · D₀ {card.suggestedInitialDifficulty}
                    </span>
                  </div>
                  <Markdown className="text-xs">
                    {card.front.split('\n\n').slice(1).join('\n\n')}
                  </Markdown>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-ac-text">
                      Show invariant
                    </summary>
                    <Markdown className="mt-1.5 text-xs">{card.back}</Markdown>
                  </details>
                </div>
              ))}
            </div>
            {deckCards.length > 6 && (
              <p className="text-[11px] text-tertiary">
                …and {deckCards.length - 6} more in the exported deck.
              </p>
            )}
          </div>
        </Panel>
      )}

      {/* Guiding heuristic */}
      <div className="flex items-start gap-2 rounded-xl border border-neutral-200/50 dark:border-(--hub-border)/50 bg-white/40 dark:bg-(--hub-panel)/40 p-3 text-xs leading-relaxed text-tertiary">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-status-warning-text" />
        <span>
          <strong className="text-strong">How to use this studio:</strong> pick the category by
          asking <em>&ldquo;what kind of computation does the structure demand?&rdquo;</em> — never{' '}
          <em>&ldquo;what does the story mention?&rdquo;</em> Every surface family here (pool pipes,
          railway, office machines) appears under all four deep structures, so the story alone can
          never tell you the answer.
        </span>
      </div>
    </div>
  )
}
