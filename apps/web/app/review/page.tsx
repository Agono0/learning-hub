'use client'

/**
 * Review session (Agent A). Per-format rendering for basic / cloze / typein /
 * mcq / occlusion / proof_step cards, confidence toggle, keyboard 1-4 + space +
 * e (undo), session energy, and a summary with the .celebrate flourish.
 *
 * CLIENT component — imports core via SUBPATHS only (never the barrel: it
 * drags ai.ts/better-sqlite3 into the client bundle).
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Battery,
  BatteryLow,
  Check,
  Eye,
  Home,
  RotateCcw,
  Sparkles,
  Undo2,
  X,
  Zap,
} from 'lucide-react'
import type { CardContent, CardFormat, Confidence, Grade } from '@learning-hub/core/types'
import { clozeSegments, isCardAnswerCorrect, pickBasicFront } from '@learning-hub/core/cards'
import {
  applyMistake,
  initialEnergy,
  MAX_ENERGY,
  stepsToShow,
  workedExampleFade,
} from '@learning-hub/core/review'
import {
  DEFAULT_SR_CRITERION,
  initialSrState,
  MAX_SR_CRITERION,
  needsAnotherRecall,
  recordSrResult,
  type SuccessiveState,
} from '@learning-hub/core/practice'
import { apiGet, apiSend } from '@/lib/transport'
import { ExercisePractice, type PracticeResponse } from '@/ui/exercises'

interface CardRow {
  id: number
  deckId: number
  type: CardFormat
  content: CardContent
  tags: string[]
  state: number
  reps: number
  stability: number
  due: string
  previews?: Record<Grade, string>
}
interface DeckInfo {
  id: number
  name: string
  emoji: string | null
  due: number
  total: number
}
interface PreReview {
  id: number
  due: string
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: number
  lastReview: string | null
  learningStep: number
}
interface ReviewResponse {
  ok: boolean
  card: Partial<CardRow>
  preReview: PreReview
  revlogId: number
  nextPreviews?: Record<Grade, string>
  intervalDays: number
  xp: number
  streak: { current: number; best: number }
}
interface SessionResult {
  cardId: number
  grade: Grade
  intervalDays: number
  xp: number
}

const GRADES: { grade: Grade; label: string; color: string }[] = [
  { grade: 1, label: 'Again', color: 'bg-red-600 hover:bg-red-500' },
  { grade: 2, label: 'Hard', color: 'bg-amber-600 hover:bg-amber-500' },
  { grade: 3, label: 'Good', color: 'bg-indigo-600 hover:bg-indigo-500' },
  { grade: 4, label: 'Easy', color: 'bg-emerald-600 hover:bg-emerald-500' },
]

/** useSearchParams needs a Suspense boundary in the static (Tauri) export. */
export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewPageInner />
    </Suspense>
  )
}

function ReviewPageInner() {
  const qc = useQueryClient()
  // ?courseId=<id> → mixed practice across the whole course (auto-starts)
  const courseIdParam = useSearchParams().get('courseId')
  const courseId = courseIdParam ? Number(courseIdParam) : null
  const [deckId, setDeckId] = useState<number | null>(null)
  const [mode, setMode] = useState<'normal' | 'pretest' | 'cram'>('normal')
  const [limit, setLimit] = useState(20)
  const [started, setStarted] = useState(false)

  const { data: decksData } = useQuery<{ decks: DeckInfo[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet<{ decks: DeckInfo[] }>('/api/decks'),
  })
  const session = useQuery<
    { cards: CardRow[]; course: { id: number; title: string } | null },
    Error,
    { cards: CardRow[]; course: { id: number; title: string } | null }
  >({
    queryKey: ['review-session', deckId, courseId, limit, mode],
    queryFn: () =>
      apiGet<{ cards: CardRow[]; course: { id: number; title: string } | null }>(
        `/api/review?deckId=${deckId ?? ''}&courseId=${courseId ?? ''}&limit=${limit}&mode=${mode}`,
      ),
    enabled: started,
  })
  // a mixed-practice link starts the session immediately
  useEffect(() => {
    if (courseId !== null && !Number.isNaN(courseId)) setStarted(true)
  }, [courseId])

  const [queue, setQueue] = useState<CardRow[]>([])
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [confidence, setConfidence] = useState<Confidence>(1)
  const [energy, setEnergy] = useState(initialEnergy)
  const [results, setResults] = useState<SessionResult[]>([])
  const [undoStack, setUndoStack] = useState<
    {
      card: CardRow
      preReview: PreReview
      revlogId: number
      prevSr: SuccessiveState | undefined
      wasMistake: boolean
      requeuedAt: number | null
      gradedIdx: number
    }[]
  >([])
  const [typeinValue, setTypeinValue] = useState('')
  const [mcqPick, setMcqPick] = useState<number | null>(null)
  const [clozeInput, setClozeInput] = useState<Record<number, string>>({})
  // successive relearning (Rawson & Dunlosky): a failed card needs N spaced
  // correct recalls before the session lets it go
  const [srCriterion, setSrCriterion] = useState(DEFAULT_SR_CRITERION)
  const srMap = useRef(new Map<number, SuccessiveState>())
  // blur-aware active recall stopwatch (auto-pauses while document.hidden, capped at 60_000 ms)
  const cardShownAtRef = useRef<number>(Date.now())
  const accumulatedMsRef = useRef<number>(0)
  // practice-engine exercise cards: the graded response from ExercisePractice
  // (the practice endpoint already recorded the review — the session only advances)
  const [exerciseResult, setExerciseResult] = useState<PracticeResponse | null>(null)
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const resetRecallTimer = useCallback(() => {
    accumulatedMsRef.current = 0
    cardShownAtRef.current = typeof document !== 'undefined' && document.hidden ? 0 : Date.now()
  }, [])

  const readRecallTimeMs = useCallback(() => {
    const activeSlice =
      typeof document !== 'undefined' && (document.hidden || cardShownAtRef.current === 0)
        ? 0
        : Math.max(0, Date.now() - cardShownAtRef.current)
    return Math.min(60_000, Math.max(200, Math.round(accumulatedMsRef.current + activeSlice)))
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (cardShownAtRef.current > 0) {
          accumulatedMsRef.current += Math.max(0, Date.now() - cardShownAtRef.current)
          cardShownAtRef.current = 0
        }
      } else {
        cardShownAtRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (session.data) {
      setQueue(session.data.cards)
      setIdx(0)
      setResults([])
      setUndoStack([])
      setEnergy(initialEnergy())
      setFinishedAt(null)
      srMap.current = new Map()
      // a stale answer from a previous session must never unlock "Next card"
      // for the first exercise card of the new one
      setExerciseResult(null)
      resetRecallTimer()
    }
  }, [session.data, resetRecallTimer])

  const current = queue[idx]

  /** fold a graded recall into the card's successive-relearning state */
  const recordSr = useCallback((cardId: number, correct: boolean) => {
    const next = recordSrResult(srMap.current.get(cardId) ?? initialSrState(), correct)
    srMap.current.set(cardId, next)
    return next
  }, [])

  /**
   * Re-queue a card with SPACING (≥ 1 other card before the retry when the
   * queue has room) — successive relearning interleaves rather than repeats.
   * Returns the index the retry will be inserted at (for the undo buffer).
   */
  const requeueSpaced = useCallback(
    (card: CardRow): number => {
      const at = Math.min(queue.length, idx + 2)
      setQueue((q) => {
        const copy = [...q]
        copy.splice(Math.min(copy.length, idx + 2), 0, card)
        return copy
      })
      return at
    },
    [queue.length, idx],
  )

  const resetCardState = useCallback(() => {
    setRevealed(false)
    setConfidence(1)
    setTypeinValue('')
    setMcqPick(null)
    setClozeInput({})
    resetRecallTimer()
  }, [resetRecallTimer])

  const gradeMutation = useMutation({
    mutationFn: async (payload: { cardId: number; grade: Grade; confidence: Confidence }) =>
      apiSend<ReviewResponse>('/api/review', 'POST', {
        ...payload,
        timeMs: readRecallTimeMs(),
        tzOffset: new Date().getTimezoneOffset(),
      }),
    onSuccess: (data, variables) => {
      if (!data.ok || !current) return
      const prevSr = srMap.current.get(variables.cardId)
      const wasMistake = variables.grade === 1
      const sr = recordSr(variables.cardId, !wasMistake)
      // successive relearning: a correct recall still re-queues (without
      // draining energy) while the criterion is unmet
      const requeue = wasMistake || needsAnotherRecall(sr, srCriterion)
      const updatedCard: CardRow = {
        ...current,
        ...data.card,
        previews: data.nextPreviews ?? current.previews,
      }
      const requeuedAt = requeue ? requeueSpaced(updatedCard) : null
      setUndoStack((s) => [
        ...s,
        {
          card: current,
          preReview: data.preReview,
          revlogId: data.revlogId,
          prevSr,
          wasMistake,
          requeuedAt,
          gradedIdx: idx,
        },
      ])
      if (wasMistake) setEnergy((e) => applyMistake(e))
      setResults((r) => [
        ...r,
        {
          cardId: variables.cardId,
          grade: variables.grade,
          intervalDays: data.intervalDays,
          xp: data.xp,
        },
      ])
      // The re-queued copy extends the queue, so a re-queue on the LAST card
      // must also extend the end check — otherwise the retry is dropped.
      resetCardState()
      void qc.invalidateQueries({ queryKey: ['decks'] })
      if (idx + 1 >= queue.length + (requeue ? 1 : 0)) setFinishedAt(Date.now())
      else setIdx((i) => i + 1)
    },
  })

  const undoMutation = useMutation({
    mutationFn: async (payload: { cardId: number; revlogId: number; preReview: PreReview }) =>
      apiSend<{ ok: boolean }>('/api/review/undo', 'POST', payload),
    onSuccess: (data) => {
      if (!data.ok || undoStack.length === 0) return
      const last = undoStack[undoStack.length - 1]!
      setUndoStack((s) => s.slice(0, -1))
      setResults((r) => r.slice(0, -1))
      if (last.prevSr) srMap.current.set(last.card.id, last.prevSr)
      else srMap.current.delete(last.card.id)
      if (last.wasMistake) setEnergy((e) => Math.min(MAX_ENERGY, e + 1))
      setQueue((q) => {
        const copy = [...q]
        // remove the re-queued copy this grade inserted (spaced insert, with
        // a trailing-copy fallback for stacks graded before spacing existed)
        if (
          last.requeuedAt !== null &&
          last.requeuedAt < copy.length &&
          copy[last.requeuedAt]?.id === last.card.id
        ) {
          copy.splice(last.requeuedAt, 1)
        } else if (last.requeuedAt !== null && copy[copy.length - 1]?.id === last.card.id) {
          copy.pop()
        }
        if (last.gradedIdx < copy.length) {
          copy[last.gradedIdx] = last.card
        } else {
          copy.push(last.card)
        }
        return copy
      })
      setIdx(last.gradedIdx)
      resetCardState()
      setFinishedAt(null)
      void qc.invalidateQueries({ queryKey: ['decks'] })
    },
  })

  const commit = useCallback(
    (grade: Grade) => {
      if (!current || gradeMutation.isPending) return
      gradeMutation.mutate({ cardId: current.id, grade, confidence })
    },
    [current, gradeMutation, confidence],
  )

  // Practice-engine exercise cards are graded AND recorded by the practice
  // endpoint (same executeReview pipeline) — the session only advances here,
  // mirroring gradeMutation's bookkeeping (no undo: there is no preReview).
  const advanceAfterExercise = useCallback(() => {
    if (!current || !exerciseResult) return
    const { result, review } = exerciseResult
    const wasMistake = !result.pending && result.grade === 1
    const sr = recordSr(current.id, !wasMistake)
    const requeue = wasMistake || needsAnotherRecall(sr, srCriterion)
    if (requeue) {
      if (wasMistake) setEnergy((e) => applyMistake(e))
      requeueSpaced(current)
    }
    if (review) {
      const intervalDays = Math.max(
        0,
        Math.round((new Date(review.due).getTime() - Date.now()) / 86_400_000),
      )
      setResults((r) => [
        ...r,
        { cardId: current.id, grade: result.grade, intervalDays, xp: review.xpEarned },
      ])
    }
    setExerciseResult(null)
    resetCardState()
    void qc.invalidateQueries({ queryKey: ['decks'] })
    if (idx + 1 >= queue.length + (requeue ? 1 : 0)) setFinishedAt(Date.now())
    else setIdx((i) => i + 1)
  }, [
    current,
    exerciseResult,
    idx,
    queue.length,
    resetCardState,
    recordSr,
    requeueSpaced,
    srCriterion,
  ])

  const reveal = useCallback(() => setRevealed(true), [])

  // keyboard: 1-4 grade · space reveal/Good · e undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return
      if (current.type === 'exercise') return // the exercise owns its own controls
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (!revealed) {
            reveal()
          } else {
            // Enter commits the typed answer for typein AND cloze/multi-blank
            // cards — the shared core evaluator decides, never a hardcoded
            // Again. Committing stays disabled while the input is empty.
            const input = current.content.cloze ? clozeInput : typeinValue
            if (!answerInputHasText(input)) return
            commit(isCardAnswerCorrect(current.content, input) ? 3 : 1)
          }
        }
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        if (!revealed) reveal()
        else commit(3)
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        if (revealed) commit(Number(e.key) as Grade)
      } else if (e.key === 'e') {
        e.preventDefault()
        if (undoStack.length > 0) {
          const last = undoStack[undoStack.length - 1]!
          undoMutation.mutate({
            cardId: last.card.id,
            revlogId: last.revlogId,
            preReview: last.preReview,
          })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, commit, reveal, undoStack, typeinValue, clozeInput])

  useEffect(() => {
    if (revealed) inputRef.current?.blur()
  }, [revealed])

  const stats = useMemo(() => {
    const total = results.length
    const correct = results.filter((r) => r.grade > 1).length
    return {
      total,
      correct,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      xp: results.reduce((a, r) => a + r.xp, 0),
    }
  }, [results])

  // ─── Setup screen ───
  if (!started) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Review</h1>
        <div className="panel space-y-4">
          <div>
            <div className="label mb-2">Deck</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setDeckId(null)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  deckId === null
                    ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-[#26262b] dark:text-neutral-300 dark:hover:bg-[#1a1a1f]'
                }`}
              >
                📚 All decks
                <span className="ml-2 text-xs text-neutral-500">
                  {(decksData?.decks ?? []).reduce((acc, d) => acc + d.due, 0)} due
                </span>
              </button>
              {(decksData?.decks ?? []).map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDeckId(d.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    deckId === d.id
                      ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-[#26262b] dark:text-neutral-300 dark:hover:bg-[#1a1a1f]'
                  }`}
                >
                  {d.emoji} {d.name}
                  <span className="ml-2 text-xs text-neutral-500">{d.due} due</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label mb-2">Mode</div>
              <div className="flex gap-2">
                {(['normal', 'pretest', 'cram'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`btn-ghost ${mode === m ? 'bg-indigo-600/10 text-indigo-300' : ''}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {mode === 'normal' &&
                  'Due cards, most overdue first. Confident-wrong answers retry first (hypercorrection).'}
                {mode === 'pretest' && 'Test before study: never-reviewed cards surface first.'}
                {mode === 'cram' && 'Ignore due dates — weakest memories first.'}
              </p>
            </div>
            <div>
              <div className="label mb-2">Session size</div>
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="input"
              />
              <div className="label mb-2 mt-3">
                Retrieval criterion{' '}
                <span className="font-normal text-neutral-500">
                  (correct recalls after a mistake)
                </span>
              </div>
              <select
                className="input"
                value={srCriterion}
                onChange={(e) => setSrCriterion(Number(e.target.value))}
              >
                {Array.from({ length: MAX_SR_CRITERION }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} — {n === 1 ? 'one verification recall' : `${n} spaced correct recalls`}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-neutral-500">
                Successive relearning: a failed card repeats (spaced) until it has been recalled
                correctly this many times (Rawson &amp; Dunlosky 2011).
              </p>
            </div>
          </div>
          <button
            className="btn"
            disabled={(decksData?.decks ?? []).length === 0}
            onClick={() => setStarted(true)}
          >
            <Zap className="h-4 w-4" /> Start session
          </button>
        </div>
      </div>
    )
  }

  // ─── Session summary ───
  if (finishedAt !== null || (!current && results.length > 0)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Session complete</h1>
        <div className="panel celebrate space-y-3">
          <div className="flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-amber-400" />
            <div>
              <div className="text-lg font-bold">
                {stats.correct} / {stats.total} recalled ({stats.accuracy}%)
              </div>
              <div className="text-sm text-neutral-500">+{stats.xp} XP earned</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn"
              onClick={() => {
                setStarted(false)
                setFinishedAt(null)
                setResults([])
                setExerciseResult(null)
              }}
            >
              <RotateCcw className="h-4 w-4" /> New session
            </button>
            <a href="/" className="btn-ghost">
              <Home className="h-4 w-4" /> Dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (session.isLoading || !current) {
    return (
      <div className="panel text-sm text-neutral-500">
        {session.isLoading ? 'Building session…' : 'No cards due in this deck.'}
      </div>
    )
  }

  // ─── Active card ───
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {session.data?.course ? 'Mixed practice' : 'Review'}
          </h1>
          {session.data?.course && (
            <p className="text-xs text-neutral-500">{session.data.course.title}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>
            {idx + 1} / {queue.length}
          </span>
          <EnergyBar energy={energy} />
        </div>
      </div>

      <div className="panel min-h-[280px] space-y-4">
        <div className="flex gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-[#1a1a1f]">
            {current.type}
          </span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-[#1a1a1f]">
            reps {current.reps}
          </span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-[#1a1a1f]">
            stability {current.stability.toFixed(1)}d
          </span>
        </div>

        {current.type === 'exercise' && current.content.exercise ? (
          <div className="space-y-3">
            <ExercisePractice
              key={`${current.id}-${idx}`}
              cardId={current.id}
              exercise={current.content.exercise}
              onAnswered={setExerciseResult}
            />
            {exerciseResult && (
              <button className="btn" onClick={advanceAfterExercise}>
                Next card <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <>
            <CardFront
              card={current}
              revealed={revealed}
              typeinValue={typeinValue}
              setTypeinValue={setTypeinValue}
              mcqPick={mcqPick}
              setMcqPick={setMcqPick}
              clozeInput={clozeInput}
              setClozeInput={setClozeInput}
              inputRef={inputRef}
            />

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {!revealed ? (
                <button className="btn" onClick={reveal}>
                  <Eye className="h-4 w-4" /> Reveal{' '}
                  <span className="text-xs opacity-70">space</span>
                </button>
              ) : (
                GRADES.map((g) => {
                  const nextLabel = current.previews?.[g.grade]
                  return (
                    <button
                      key={g.grade}
                      className={`btn ${g.color}`}
                      onClick={() => commit(g.grade)}
                      disabled={gradeMutation.isPending}
                    >
                      <span>{g.label}</span>
                      {nextLabel && (
                        <span className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[11px] opacity-90">
                          {nextLabel}
                        </span>
                      )}
                      <span className="text-xs opacity-65">{g.grade}</span>
                    </button>
                  )
                })
              )}
              <div className="ml-auto flex items-center gap-1 text-xs">
                <span className="text-neutral-500">confidence</span>
                <button
                  onClick={() => setConfidence(1)}
                  className={`rounded px-2 py-1 ${confidence === 1 ? 'bg-emerald-600/20 text-emerald-400' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]'}`}
                >
                  <Check className="inline h-3 w-3" /> sure
                </button>
                <button
                  onClick={() => setConfidence(0)}
                  className={`rounded px-2 py-1 ${confidence === 0 ? 'bg-amber-600/20 text-amber-400' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1a1a1f]'}`}
                >
                  <X className="inline h-3 w-3" /> unsure
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <button
          className="btn-ghost"
          disabled={undoStack.length === 0 || undoMutation.isPending}
          onClick={() => {
            const last = undoStack[undoStack.length - 1]
            if (last) {
              undoMutation.mutate({
                cardId: last.card.id,
                revlogId: last.revlogId,
                preReview: last.preReview,
              })
            }
          }}
        >
          <Undo2 className="h-3.5 w-3.5" /> undo <span className="opacity-70">e</span>
        </button>
        {current.type !== 'exercise' && <span>keys: 1-4 grade · space reveal/Good · e undo</span>}
        <button
          className="btn-ghost ml-auto"
          onClick={() => {
            setStarted(false)
            setFinishedAt(null)
          }}
        >
          End session <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function EnergyBar({ energy }: { energy: number }) {
  const low = energy <= 1
  const Icon = low ? BatteryLow : Battery
  return (
    <span
      className={`flex items-center gap-1 ${low ? 'text-red-400' : 'text-emerald-400'}`}
      title="session energy — mistakes drain it"
    >
      <Icon className="h-4 w-4" />
      {Array.from({ length: MAX_ENERGY }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i < energy ? (low ? 'bg-red-400' : 'bg-emerald-400') : 'bg-neutral-300 dark:bg-[#26262b]'}`}
        />
      ))}
    </span>
  )
}

function typeinCorrect(value: string, content: CardContent): boolean {
  const accepted = content.typein?.acceptedAnswers ?? []
  return accepted.some((a) => a.toLowerCase().trim() === value.toLowerCase().trim())
}

/** True when the answer input holds any text (typein string or cloze blanks map). */
function answerInputHasText(input: string | Record<number, string>): boolean {
  if (typeof input === 'string') return input.trim() !== ''
  return Object.values(input).some((v) => v.trim() !== '')
}

// ─── Per-format card rendering ──────────────────────────────────────────────

function CardFront(props: {
  card: CardRow
  revealed: boolean
  typeinValue: string
  setTypeinValue: (v: string) => void
  mcqPick: number | null
  setMcqPick: (i: number | null) => void
  clozeInput: Record<number, string>
  setClozeInput: (v: Record<number, string>) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { card, revealed } = props
  const content = card.content

  if (content.basic) {
    // desirable difficulty: rotate front phrasings across exposures
    const front = pickBasicFront(content.basic, card.reps)
    return (
      <div className="space-y-4">
        {/* dual coding: the image is part of the prompt, never the answer */}
        {content.basic.imageId != null && (
          <img
            src={`/api/images/${content.basic.imageId}`}
            alt=""
            className="max-h-56 rounded-lg border border-neutral-200 dark:border-[#26262b]"
          />
        )}
        <div className="text-xl font-medium">{front}</div>
        {revealed && (
          <div className="border-t border-neutral-200 pt-4 text-lg text-indigo-300 dark:border-[#26262b]">
            {content.basic.back}
          </div>
        )}
      </div>
    )
  }

  if (content.cloze) {
    const segments = clozeSegments(content.cloze.text)
    // evaluate ALL blanks with the shared core evaluator (multi-blank aware)
    const clozeCorrect = isCardAnswerCorrect(content, props.clozeInput)
    return (
      <div className="space-y-3">
        <div className="text-xl leading-loose">
          {/* segments are a pure function of the card's immutable content —
              they never reorder or grow, so index keys are stable per card */}
          {segments.map((seg, i) => {
            if (seg.kind === 'text') return <span key={i}>{seg.text}</span>
            const typed = props.clozeInput[seg.index] ?? ''
            return (
              <span key={i} className="mx-1 inline-block align-baseline">
                {revealed ? (
                  <span className="rounded bg-indigo-600/20 px-2 py-0.5 font-medium text-indigo-300">
                    {seg.answer}
                  </span>
                ) : content.cloze?.mode === 'typein' ? (
                  <input
                    ref={props.inputRef}
                    value={typed}
                    onChange={(e) =>
                      props.setClozeInput({ ...props.clozeInput, [seg.index]: e.target.value })
                    }
                    className="mx-1 w-32 rounded border-b-2 border-indigo-500 bg-transparent px-1 py-0.5 text-center outline-none"
                    placeholder={'␣'.repeat(Math.min(seg.answer.length, 8))}
                  />
                ) : (
                  <span className="rounded border-b-2 border-indigo-500 px-3 text-transparent select-none">
                    {'␣'.repeat(Math.min(seg.answer.length, 8))}
                  </span>
                )}
              </span>
            )
          })}
        </div>
        {content.cloze.hint && !revealed && (
          <div className="text-xs text-neutral-500">hint: {content.cloze.hint}</div>
        )}
        {revealed && content.cloze.mode === 'typein' && (
          <div className={`text-sm ${clozeCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
            {clozeCorrect ? 'correct' : `answer: ${content.cloze.answers.join(', ')}`}
          </div>
        )}
      </div>
    )
  }

  if (content.typein) {
    return (
      <div className="space-y-4">
        <div className="text-xl font-medium">{content.typein.question}</div>
        <input
          ref={props.inputRef}
          value={props.typeinValue}
          onChange={(e) => props.setTypeinValue(e.target.value)}
          disabled={revealed}
          className="input max-w-md"
          placeholder="type the answer, Enter to grade"
        />
        {revealed && (
          <div
            className={`text-lg font-medium ${typeinCorrect(props.typeinValue, content) ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {typeinCorrect(props.typeinValue, content)
              ? 'correct'
              : content.typein.acceptedAnswers.join(' · ')}
          </div>
        )}
      </div>
    )
  }

  if (content.mcq) {
    return (
      <div className="space-y-4">
        <div className="text-xl font-medium">{content.mcq.question}</div>
        {!revealed && (
          <div className="text-sm text-neutral-500">
            options appear after you commit — recall first (stepwise MCQ)
          </div>
        )}
        {revealed && (
          <div className="space-y-2">
            {content.mcq.options.map((opt, i) => {
              const picked = props.mcqPick === i
              const isCorrect = i === content.mcq!.correctIndex
              const show = props.mcqPick !== null
              return (
                <button
                  key={i}
                  onClick={() => props.setMcqPick(i)}
                  className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    show && isCorrect
                      ? 'border-emerald-600 bg-emerald-600/10 text-emerald-300'
                      : picked
                        ? 'border-red-600 bg-red-600/10 text-red-300'
                        : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-[#26262b] dark:text-neutral-300 dark:hover:bg-[#1a1a1f]'
                  }`}
                >
                  {String.fromCharCode(65 + i)}. {opt}
                </button>
              )
            })}
            {props.mcqPick !== null && content.mcq.rationale && (
              <div className="text-xs text-neutral-500">{content.mcq.rationale}</div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (content.occlusion) {
    return <OcclusionView card={card} revealed={revealed} />
  }

  if (content.proof_step) {
    const ps = content.proof_step
    const fade = workedExampleFade(1) // completion-problem level by default
    const visibleCount = Math.max(1, stepsToShow(1, ps.proofSteps.length))
    return (
      <div className="space-y-3">
        <div className="text-lg font-medium">{ps.theorem}</div>
        <ol className="space-y-1.5 text-sm">
          {/* static slice of the card's immutable proof steps — items never
              reorder or drop, so index keys are safe */}
          {ps.proofSteps.slice(0, Math.max(ps.stepIndex + 1, visibleCount)).map((step, i) => {
            const visible = i < visibleCount || i <= ps.stepIndex
            const isTarget = i === ps.stepIndex
            return (
              <li key={i} className={`flex gap-2 ${isTarget ? 'font-medium text-indigo-300' : ''}`}>
                <span className="text-neutral-500">{i + 1}.</span>
                <span>{visible ? step : '•••'}</span>
              </li>
            )
          })}
        </ol>
        <div className="text-sm text-neutral-500">
          {revealed ? (
            <span className="text-base text-emerald-400">
              justified by: {ps.justification}
              {ps.sourceLemma ? ` (lemma: ${ps.sourceLemma})` : ''}
            </span>
          ) : (
            <>What justifies step {ps.stepIndex + 1}?</>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-neutral-600">{fade.label}</div>
      </div>
    )
  }

  if (content.grammar) {
    const g = content.grammar
    const parts = g.sentence.split(
      new RegExp(`(${g.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'),
    )
    return (
      <div className="space-y-3">
        <div className="label">pattern: {g.pattern}</div>
        <div className="text-xl">
          {parts.map((part, i) =>
            part.toLowerCase() === g.target.toLowerCase() ? (
              revealed ? (
                <span key={i} className="rounded bg-indigo-600/20 px-2 font-medium text-indigo-300">
                  {part}
                </span>
              ) : (
                <span
                  key={i}
                  className="rounded border-b-2 border-indigo-500 px-4 text-transparent select-none"
                >
                  {'␣'.repeat(Math.min(part.length, 10))}
                </span>
              )
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </div>
        {g.translation && revealed && (
          <div className="text-sm text-neutral-500">{g.translation}</div>
        )}
      </div>
    )
  }

  if (content.matching) {
    return (
      <div className="space-y-2">
        <div className="label">matching set (play it in Games)</div>
        {revealed && (
          <ul className="list-inside list-disc text-sm text-neutral-300">
            {content.matching.pairs.map((p, i) => (
              <li key={i}>
                {p.left} → {p.right}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return <div className="text-sm text-neutral-500">Unsupported card format.</div>
}

/** Image occlusion: absolutely-positioned normalized-rect overlays, labels on reveal. */
function OcclusionView({ card, revealed }: { card: CardRow; revealed: boolean }) {
  const occ = card.content.occlusion
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  if (!occ) return null
  return (
    <div className="space-y-2">
      <div
        className="relative mx-auto max-w-xl overflow-hidden rounded-lg border border-neutral-200 dark:border-[#26262b]"
        style={{ minHeight: 200 }}
      >
        <img
          src={`/api/images/${occ.imageId}`}
          alt="occlusion card"
          className="block w-full"
          onLoad={(e) => {
            const img = e.currentTarget
            setSize({ w: img.clientWidth, h: img.clientHeight })
          }}
        />
        {/* overlays are positioned in normalized 0-1 coords — resize-proof */}
        {occ.rects.map((rect) => (
          <div
            key={rect.id}
            className={`absolute rounded-sm border ${revealed ? 'border-indigo-400 bg-indigo-500/25' : 'border-neutral-500 bg-neutral-700'}`}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
            }}
          >
            {revealed && rect.label && (
              <span className="absolute inset-0 grid place-items-center text-xs font-medium text-white drop-shadow">
                {rect.label}
              </span>
            )}
          </div>
        ))}
        {size === null && (
          <div className="absolute inset-0 grid place-items-center text-xs text-neutral-500">
            loading image…
          </div>
        )}
      </div>
      {!revealed && (
        <div className="text-center text-xs text-neutral-500">reveal to show the labels</div>
      )}
    </div>
  )
}
