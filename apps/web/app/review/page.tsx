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
  Headphones,
  Home,
  Mic,
  RotateCcw,
  Sparkles,
  Sliders,
  Undo2,
  X,
  Zap,
  Volume2,
} from 'lucide-react'
import type { CardContent, CardFormat, Confidence, Grade } from '@learning-hub/core/types'
import {
  clozeSegments,
  isCardAnswerCorrect,
  pickBasicFront,
  pickCardPrompt,
} from '@learning-hub/core/cards'
import { isSpeechAvailable, speak } from '@/lib/speech'
import {
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticWarning,
  hapticHypercorrection,
} from '@/platform/haptics'
import {
  applyMistake,
  evaluateMetacognitiveProfile,
  evaluateSpokenAnswer,
  initialEnergy,
  MAX_ENERGY,
  stepsToShow,
  workedExampleFade,
} from '@learning-hub/core'
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
import {
  Button,
  CognitiveLoadMeter,
  InkPad,
  MetacognitionRadar,
  MetacognitiveCalibrationCard,
  PageHeader,
  SelectField,
  Skeleton,
} from '@/ui'
import { GenerationPracticeModal } from '@/components/GenerationPracticeModal'
import { BreathingCoherenceStudio } from '@/components/BreathingCoherenceStudio'
import { Wind } from 'lucide-react'
import { WorkloadBalancerModal } from '@/components/WorkloadBalancerModal'
import {
  acquireWakeLock,
  listenForSpeech,
  playChime,
  speakText,
  stopSpeaking,
} from '@/lib/audio-engine'

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
  /** Deck runs delayed feedback (Butler & Roediger 2008): grade blind, no reveal. */
  blind?: boolean
}
/** A blind-graded miss (rating 1–2 in the last 24h) to restudy first. */
interface CorrectionCard {
  id: number
  type: CardFormat
  content: CardContent
  rating: number
  reviewedAt: string
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
  hypercorrection?: {
    isEligible: boolean
    prompt?: string
    contrastNote?: string
  }
}
interface SessionResult {
  cardId: number
  grade: Grade
  intervalDays: number
  xp: number
  /** Confidence the user attached at grading time (0 uncertain / 1 confident) */
  confidence: Confidence
}
/** GET /api/review response — the queue plus, for a delayed-feedback deck, the restudy list. */
interface SessionPayload {
  cards: CardRow[]
  course: { id: number; title: string } | null
  corrections?: CorrectionCard[]
}

const GRADES: { grade: Grade; label: string; color: string }[] = [
  { grade: 1, label: 'Again', color: 'bg-rose-600 hover:bg-rose-500' },
  { grade: 2, label: 'Hard', color: 'bg-amber-600 hover:bg-amber-500' },
  { grade: 3, label: 'Good', color: 'bg-indigo-600 hover:bg-indigo-500' },
  { grade: 4, label: 'Easy', color: 'bg-emerald-600 hover:bg-emerald-500' },
]

/** Front/prompt text of a card (voice review + the corrections restudy list). */
function getCardVoicePrompt(card: { content: CardContent; reps?: number }): string {
  const prompt = pickCardPrompt(card)
  if (prompt.text) return prompt.text
  if (card.content.basic) return card.content.basic.front
  if (card.content.exercise?.prompt) return card.content.exercise.prompt
  if (card.content.typein?.question) return card.content.typein.question
  if (card.content.cloze?.text) return card.content.cloze.text
  if (card.content.mcq?.question) return card.content.mcq.question
  return 'Review item'
}

function getCardVoiceAnswer(card: { content: CardContent }): string {
  if (card.content.basic) return card.content.basic.back
  if (card.content.typein?.acceptedAnswers?.[0]) return card.content.typein.acceptedAnswers[0]
  if (card.content.mcq && card.content.mcq.options[card.content.mcq.correctIndex]) {
    return card.content.mcq.options[card.content.mcq.correctIndex]!
  }
  return ''
}

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
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[]>([])
  const [multiDeckMode, setMultiDeckMode] = useState(false)
  const [speedDrillActive, setSpeedDrillActive] = useState(false)
  const [speedLimitSec, setSpeedLimitSec] = useState(8)
  const [speedSecondsLeft, setSpeedSecondsLeft] = useState(8)
  const [mode, setMode] = useState<'normal' | 'pretest' | 'cram' | 'commute'>('normal')
  const [limit, setLimit] = useState(20)
  const [started, setStarted] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechFeedback, setSpeechFeedback] = useState<string | null>(null)
  const [commuteAutoPlay, setCommuteAutoPlay] = useState(true)
  const [isPlayingDigest, setIsPlayingDigest] = useState(false)
  const [digestStatus, setDigestStatus] = useState<string | null>(null)

  const { data: decksData } = useQuery<{ decks: DeckInfo[] }>({
    queryKey: ['decks'],
    queryFn: () => apiGet<{ decks: DeckInfo[] }>('/api/decks'),
  })
  const session = useQuery<SessionPayload, Error, SessionPayload>({
    queryKey: ['review-session', deckId, selectedDeckIds, multiDeckMode, courseId, limit, mode],
    queryFn: () => {
      const deckParam =
        multiDeckMode && selectedDeckIds.length > 0
          ? `deckIds=${selectedDeckIds.join(',')}`
          : `deckId=${deckId ?? ''}`
      return apiGet<SessionPayload>(
        `/api/review?${deckParam}&courseId=${courseId ?? ''}&limit=${limit}&mode=${mode}`,
      )
    },
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
  /** Study Coins minted by /api/world/verify/review during this session. */
  const [worldCoins, setWorldCoins] = useState(0)
  /** Recall latency captured at grade time, read by the world-coin verifier. */
  const gradeElapsedRef = useRef(0)
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
  const [hyperNotice, setHyperNotice] = useState<{ prompt: string; contrastNote: string } | null>(
    null,
  )
  const [flowAlert, setFlowAlert] = useState<{ zone: string; message: string } | null>(null)
  const [oralListening, setOralListening] = useState(false)
  const [suggestedOralGrade, setSuggestedOralGrade] = useState<{
    grade: Grade
    spoken: string
  } | null>(null)
  // delayed feedback (Butler & Roediger 2008): ids graded WITHOUT seeing the
  // answer this session — shown in the summary; their misses (rating 1–2) are
  // picked up for restudy from revlog at the next session's start
  const [blindGraded, setBlindGraded] = useState<number[]>([])
  // the "Correct these first" restudy list shows once, before the queue
  const [correctionsSeen, setCorrectionsSeen] = useState(false)
  const [showWorkloadModal, setShowWorkloadModal] = useState(false)
  const [generationModalOpen, setGenerationModalOpen] = useState(false)
  const [coherenceModalOpen, setCoherenceModalOpen] = useState(false)
  const [generationTargetCard, setGenerationTargetCard] = useState<{
    concept: string
    explanation: string
    cardId: number
  } | null>(null)
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
      setBlindGraded([])
      setCorrectionsSeen(false)
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

  // Speed Drill countdown timer: counts down while active card is not yet revealed
  useEffect(() => {
    if (!speedDrillActive || !started || finishedAt !== null || revealed || !current) return

    setSpeedSecondsLeft(speedLimitSec)
    const timer = setInterval(() => {
      setSpeedSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setRevealed(true)
          hapticLight()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [speedDrillActive, started, finishedAt, revealed, idx, speedLimitSec, current])
  // delayed feedback (Butler & Roediger 2008): the "Correct these first"
  // restudy list blocks the queue until the learner dismisses it
  const corrections = session.data?.corrections ?? []
  const correctionsPending = !correctionsSeen && corrections.length > 0

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
    setSuggestedOralGrade(null)
    resetRecallTimer()
  }, [resetRecallTimer])

  const gradeMutation = useMutation({
    mutationFn: async (payload: { cardId: number; grade: Grade; confidence: Confidence }) => {
      const elapsedMs = readRecallTimeMs()
      gradeElapsedRef.current = elapsedMs
      return apiSend<ReviewResponse>('/api/review', 'POST', {
        ...payload,
        timeMs: elapsedMs,
        tzOffset: new Date().getTimezoneOffset(),
      })
    },
    onSuccess: (data, variables) => {
      if (!data.ok || !current) return
      // Haptic texture: a heavy beat for misses (attention), light for passes.
      if (variables.grade === 1) hapticHeavy()
      else hapticLight()
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
      // delayed feedback: the grade was committed without seeing the answer —
      // track it so the summary can promise the corrections session
      if (current.blind) {
        setBlindGraded((ids) => (ids.includes(variables.cardId) ? ids : [...ids, variables.cardId]))
      }
      setResults((r) => [
        ...r,
        {
          cardId: variables.cardId,
          grade: variables.grade,
          intervalDays: data.intervalDays,
          xp: data.xp,
          confidence: variables.confidence,
        },
      ])
      // World economy: verify the review server-side (anti-cheat) and mint
      // Study Coins when it passes. Fire-and-forget — a failure must never
      // block or slow the review loop; the world page surfaces the balance.
      void apiSend<{ valid: boolean; coinsAwarded: number }>('/api/world/verify/review', 'POST', {
        cardId: variables.cardId,
        elapsedMs: gradeElapsedRef.current,
        rating: variables.grade,
      })
        .then((res) => {
          if (res?.valid && res.coinsAwarded > 0) {
            setWorldCoins((c) => c + res.coinsAwarded)
          }
        })
        .catch(() => undefined)
      if (data.hypercorrection?.isEligible && data.hypercorrection.prompt) {
        hapticHypercorrection()
        setHyperNotice({
          prompt: data.hypercorrection.prompt,
          contrastNote: data.hypercorrection.contrastNote || '',
        })
      } else if (variables.grade >= 3) {
        hapticLight()
      } else if (variables.grade === 2) {
        hapticMedium()
      } else {
        hapticWarning()
      }
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
      // an undone grade is no longer committed — drop it from the blind set
      setBlindGraded((ids) => ids.filter((id) => id !== last.card.id))
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

  const handleOralRecall = useCallback(async () => {
    if (oralListening || !current) return
    setOralListening(true)
    try {
      const transcript = await listenForSpeech(6000)
      if (transcript.trim()) {
        const cardContent =
          typeof current.content === 'object' && current.content
            ? (current.content as Record<string, unknown>)
            : null
        const rawBack =
          cardContent?.back ??
          (cardContent?.basic as Record<string, unknown> | undefined)?.back ??
          (cardContent?.typein as { acceptedAnswers?: string[] } | undefined)
            ?.acceptedAnswers?.[0] ??
          ''
        const expected = String(rawBack)
        const evalResult = evaluateSpokenAnswer(transcript, expected)
        setSuggestedOralGrade({ grade: evalResult.grade, spoken: transcript })
        setRevealed(true)
      }
    } finally {
      setOralListening(false)
    }
  }, [oralListening, current])

  const commit = useCallback(
    (grade: Grade) => {
      if (!current || gradeMutation.isPending) return
      const elapsed = readRecallTimeMs()
      gradeMutation.mutate({ cardId: current.id, grade, confidence })

      // Background cognitive telemetry & flow-state monitoring (Yerkes-Dodson DDA)
      void apiSend<{
        ok: boolean
        evaluation?: {
          flowZone: 'boredom' | 'flow' | 'overload'
          interventionSuggestion?: string
        }
      }>('/api/cognitive/load', 'POST', {
        cardId: current.id,
        responseLatencyMs: elapsed,
        recentErrorCount: results.slice(-5).filter((r) => r.grade === 1).length,
      })
        .then((res) => {
          if (res?.evaluation?.flowZone === 'overload' && res.evaluation.interventionSuggestion) {
            setFlowAlert({
              zone: 'overload',
              message: res.evaluation.interventionSuggestion,
            })
          }
        })
        .catch(() => {
          // Telemetry errors must never disrupt review flow
        })
    },
    [current, gradeMutation, confidence, readRecallTimeMs, results],
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
        {
          cardId: current.id,
          grade: result.grade,
          intervalDays,
          xp: review.xpEarned,
          // Exercise-graded cards have no separate confidence prompt; treat as
          // uncertain so the calibration radar only counts honest JOL trials.
          confidence: 0,
        },
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

  // Commute mode: wake lock management
  useEffect(() => {
    // The sentinel is an object with release(), not a function. `cancelled`
    // covers cleanup running before the lock request resolves.
    let cancelled = false
    let wakeLock: WakeLockSentinel | null = null
    if (mode === 'commute' && started) {
      void acquireWakeLock().then((lock) => {
        if (cancelled) void lock?.release().catch(() => undefined)
        else wakeLock = lock
      })
    }
    return () => {
      cancelled = true
      void wakeLock?.release().catch(() => undefined)
      stopSpeaking()
    }
  }, [mode, started])

  // Hands-free voice review loop for commute mode
  const runVoiceReviewForCurrentCard = useCallback(
    async (card: CardRow) => {
      if (!card) return
      setIsListening(false)
      setSpeechFeedback('Reading prompt…')
      try {
        const promptText = getCardVoicePrompt(card)
        await speakText(promptText)

        playChime('listen')
        setIsListening(true)
        setSpeechFeedback('Listening for your answer…')

        const spoken = await listenForSpeech(6000)
        setIsListening(false)

        if (!spoken || spoken.trim().length === 0) {
          setSpeechFeedback('No answer heard. Tap a grade or speak.')
          return
        }

        setSpeechFeedback(`Heard: "${spoken}". Evaluating…`)
        const expectedText = getCardVoiceAnswer(card) || 'done'

        const evalRes = await apiSend<{
          ok: boolean
          grade: Grade
          pass: boolean
          feedback: string
          score: number
        }>('/api/audio/grade', 'POST', {
          expected: expectedText,
          spoken,
        })

        if (evalRes.ok) {
          playChime(evalRes.pass ? 'success' : 'fail')
          setSpeechFeedback(evalRes.feedback)
          await speakText(evalRes.pass ? 'Correct!' : `Answer is: ${expectedText}`)
          gradeMutation.mutate({
            cardId: card.id,
            grade: evalRes.grade,
            confidence: 1,
          })
        }
      } catch {
        setIsListening(false)
        setSpeechFeedback('Voice recognition error. You can answer manually.')
      }
    },
    [gradeMutation],
  )

  useEffect(() => {
    if (
      mode === 'commute' &&
      started &&
      current &&
      commuteAutoPlay &&
      !finishedAt &&
      !correctionsPending
    ) {
      const timer = setTimeout(() => {
        void runVoiceReviewForCurrentCard(current)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [
    mode,
    started,
    current?.id,
    commuteAutoPlay,
    finishedAt,
    correctionsPending,
    runVoiceReviewForCurrentCard,
  ])

  const reveal = useCallback(() => setRevealed(true), [])

  // keyboard: 1-4 grade · space reveal/Good · e undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return
      if (current.type === 'exercise') return // the exercise owns its own controls
      if (correctionsPending) return // the corrections screen owns the keyboard
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (!revealed) {
            // delayed feedback: no reveal — the learner commits a grade blind
            if (!current.blind) reveal()
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
        if (!revealed && !current.blind) reveal()
        else commit(3)
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        if (revealed || current.blind) commit(Number(e.key) as Grade)
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
  }, [current, revealed, correctionsPending, commit, reveal, undoStack, typeinValue, clozeInput])

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

  /**
   * Real metacognitive calibration for THIS session, derived from the
   * confidence rating the user attached to every graded review (revlog
   * persists the same 0/1 signal). Fewer than 5 confidence-rated trials →
   * the radar stays hidden: a Brier/gamma readout on tiny samples is
   * noise dressed as insight.
   */
  const calibrationReport = useMemo(() => {
    const trials = results.map((r) => ({
      cardId: r.cardId,
      // Same mapping the server/MCP parity uses for stored confidence.
      confidence: r.confidence === 1 ? 0.9 : 0.35,
      outcome: r.grade > 1 ? 1 : 0,
    }))
    if (trials.length < 5) return null
    return evaluateMetacognitiveProfile(trials)
  }, [results])

  // ─── Setup screen ───
  if (!started) {
    return (
      <div className="space-y-4">
        <PageHeader title="Review" />
        <div className="panel space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="label mb-0">Deck Selection</div>
              <button
                type="button"
                onClick={() => {
                  setMultiDeckMode(!multiDeckMode)
                  if (!multiDeckMode && deckId !== null) {
                    setSelectedDeckIds([deckId])
                  }
                }}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
              >
                {multiDeckMode ? '← Back to single deck' : '⇄ Interleave multiple decks'}
              </button>
            </div>
            {!multiDeckMode ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDeckId(null)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    deckId === null
                      ? 'border-indigo-500 bg-indigo-600/10 text-indigo-300'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-(--hub-border) dark:text-secondary dark:hover:bg-(--hub-panel-2)'
                  }`}
                >
                  📚 All decks
                  <span className="ml-2 text-xs text-tertiary">
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
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-(--hub-border) dark:text-secondary dark:hover:bg-(--hub-panel-2)'
                    }`}
                  >
                    {d.emoji} {d.name}
                    <span className="ml-2 text-xs text-tertiary">{d.due} due</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(decksData?.decks ?? []).map((d) => {
                    const isSelected = selectedDeckIds.includes(d.id)
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setSelectedDeckIds((prev) =>
                            isSelected ? prev.filter((id) => id !== d.id) : [...prev, d.id],
                          )
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200 font-medium'
                            : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-(--hub-border) dark:text-secondary dark:hover:bg-(--hub-panel-2)'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}
                        {d.emoji} {d.name}
                        <span className="ml-2 text-xs text-tertiary">{d.due} due</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-tertiary">
                  {selectedDeckIds.length > 1
                    ? `Interleaving ${selectedDeckIds.length} decks with round-robin subject rotation (Rohrer 2020: d=0.83 over blocked practice).`
                    : 'Select 2 or more decks to blend into an interleaved study session.'}
                </p>
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label mb-2">Mode</div>
              <div className="flex flex-wrap gap-2">
                {(['normal', 'pretest', 'cram', 'commute'] as const).map((m) => (
                  <Button
                    key={m}
                    onClick={() => setMode(m)}
                    variant={mode === m ? 'secondary' : 'ghost'}
                  >
                    {m === 'commute' ? '🎧 commute' : m}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-tertiary">
                {mode === 'normal' &&
                  'Due cards, most overdue first. Confident-wrong answers retry first (hypercorrection).'}
                {mode === 'pretest' && 'Test before study: never-reviewed cards surface first.'}
                {mode === 'cram' && 'Ignore due dates — weakest memories first.'}
                {mode === 'commute' &&
                  'Hands-free audio loop: prompts read aloud, voice answer recognized & fuzzy graded.'}
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
              <SelectField
                label={
                  <>
                    Retrieval criterion{' '}
                    <span className="font-normal normal-case tracking-normal">
                      (correct recalls after a mistake)
                    </span>
                  </>
                }
                value={srCriterion}
                onChange={(e) => setSrCriterion(Number(e.target.value))}
              >
                {Array.from({ length: MAX_SR_CRITERION }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} — {n === 1 ? 'one verification recall' : `${n} spaced correct recalls`}
                  </option>
                ))}
              </SelectField>
              <p className="mt-2 text-xs text-tertiary">
                Successive relearning: a failed card repeats (spaced) until it has been recalled
                correctly this many times (Rawson &amp; Dunlosky 2011).
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 dark:border-(--hub-border) p-3 bg-neutral-50/50 dark:bg-neutral-900/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-status-warning-text" />
                <span className="text-sm font-medium">⚡ Speed Drill Mode</span>
              </div>
              <button
                type="button"
                onClick={() => setSpeedDrillActive(!speedDrillActive)}
                className={`rounded px-2.5 py-1 text-xs font-medium border transition-colors ${
                  speedDrillActive
                    ? 'border-amber-500 bg-amber-500/20 text-status-warning-text'
                    : 'border-neutral-300 dark:border-neutral-700 text-tertiary hover:text-secondary'
                }`}
              >
                {speedDrillActive ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <p className="text-xs text-tertiary mb-2">
              Timed retrieval sprints (Kornell 2009): enforces rapid active recall before surface
              cues take over.
            </p>
            {speedDrillActive && (
              <div className="flex items-center gap-2 pt-1 border-t border-neutral-200 dark:border-(--hub-border) text-xs">
                <span className="text-faint">Time per card:</span>
                {[5, 8, 10, 15].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeedLimitSec(s)}
                    className={`rounded px-2 py-0.5 border ${
                      speedLimitSec === s
                        ? 'border-amber-500 bg-amber-500/20 text-status-warning-text font-bold'
                        : 'border-neutral-300 dark:border-neutral-700 text-faint'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={(decksData?.decks ?? []).length === 0}
              onClick={() => setStarted(true)}
            >
              <Zap className="h-4 w-4" /> Start session
            </Button>
            <Button
              variant="ghost"
              className="text-xs flex items-center gap-1.5"
              disabled={isPlayingDigest}
              onClick={async () => {
                setIsPlayingDigest(true)
                setDigestStatus('Generating commute podcast script…')
                try {
                  const data = await apiGet<{
                    ok: boolean
                    script: { cues: Array<{ text: string; pauseMs: number }> }
                  }>(`/api/audio/digest?limit=15&minutes=5&deckId=${deckId ?? ''}`)
                  if (data.ok && data.script.cues.length > 0) {
                    setDigestStatus('Playing hands-free audio review…')
                    for (const cue of data.script.cues) {
                      if (cue.text && cue.text !== '...') {
                        await speakText(cue.text)
                      }
                      if (cue.pauseMs > 0) {
                        await new Promise((r) => setTimeout(r, cue.pauseMs))
                      }
                    }
                    setDigestStatus('Commute audio digest complete!')
                  } else {
                    setDigestStatus('No due cards found for audio digest.')
                  }
                } catch {
                  setDigestStatus('Could not play audio digest.')
                } finally {
                  setIsPlayingDigest(false)
                }
              }}
            >
              <Headphones className="h-4 w-4 text-indigo-400" />
              {isPlayingDigest ? 'Playing Audio Digest…' : 'Generate 5m Commute Digest'}
            </Button>
            <Button
              variant="ghost"
              className="text-xs flex items-center gap-1.5"
              onClick={() => setShowWorkloadModal(true)}
            >
              <Sliders className="h-4 w-4 text-indigo-400" /> Workload &amp; Easy Days
            </Button>
            {digestStatus && <span className="text-xs text-faint">{digestStatus}</span>}
          </div>
        </div>
        <WorkloadBalancerModal
          isOpen={showWorkloadModal}
          onClose={() => setShowWorkloadModal(false)}
          deckId={deckId ?? undefined}
        />
      </div>
    )
  }

  // ─── Session summary ───
  if (finishedAt !== null || (!current && results.length > 0)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Session complete" />
        <div className="panel celebrate space-y-3">
          <div className="flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-status-warning-text" />
            <div>
              <div className="text-lg font-bold">
                {stats.correct} / {stats.total} recalled ({stats.accuracy}%)
              </div>
              <div className="text-sm text-tertiary">+{stats.xp} XP earned</div>
              {worldCoins > 0 && (
                <div className="text-xs text-status-warning-text">
                  +{worldCoins} Study Coins from verified reviews (anti-cheat checked)
                </div>
              )}
              {blindGraded.length > 0 && (
                <div className="text-xs text-status-warning-text">
                  {blindGraded.length} graded blind — corrections surface at your next session.
                </div>
              )}
              {speedDrillActive && stats.total > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-status-warning-text">
                  <Zap className="h-3.5 w-3.5 text-status-warning-text" />
                  <span>
                    Speed Drill Sprint: {stats.total} cards · {stats.accuracy}% accuracy under{' '}
                    {speedLimitSec}s pressure
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setStarted(false)
                setFinishedAt(null)
                setResults([])
                setExerciseResult(null)
              }}
            >
              <RotateCcw className="h-4 w-4" /> New session
            </Button>
            <Button
              variant="ghost"
              className="flex items-center gap-1.5"
              onClick={() => setShowWorkloadModal(true)}
            >
              <Sliders className="h-4 w-4" /> Workload &amp; Forecast
            </Button>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-secondary dark:hover:bg-(--hub-panel-2) [@media(pointer:coarse)]:min-h-11"
            >
              <Home className="h-4 w-4" /> Dashboard
            </a>
          </div>
        </div>
        {stats.total > 0 && (
          <CognitiveLoadMeter
            totalLoad={Math.min(100, Math.max(20, Math.round(100 - (stats.accuracy - 50) * 0.8)))}
            zone={
              stats.accuracy >= 80
                ? 'optimal_flow'
                : stats.accuracy <= 55
                  ? 'overload'
                  : 'underload'
            }
            germaneLoad={Math.round((stats.accuracy / 100) * 45)}
            intrinsicLoad={35}
            extraneousLoad={10}
            recommendation={
              stats.accuracy >= 80
                ? 'High schema integration achieved. Your working memory was in an optimal consolidation window.'
                : stats.accuracy <= 55
                  ? 'High cognitive friction detected. Consider taking a 10-minute restorative pause before continuing.'
                  : 'Moderate friction. Target retrieval cues for lapsed cards in your next session.'
            }
          />
        )}
        {calibrationReport && (
          <MetacognitionRadar
            brierScore={calibrationReport.brierScore}
            bias={calibrationReport.bias}
            status={calibrationReport.status}
            difficultyAdjustment={calibrationReport.difficultyAdjustment}
            guidance={calibrationReport.guidance}
            sampleSize={calibrationReport.sampleSize}
          />
        )}
        {stats.total > 0 && (
          <MetacognitiveCalibrationCard
            deckName={deckId ? decksData?.decks?.find((d) => d.id === deckId)?.name : undefined}
            className="mt-4"
          />
        )}
        <WorkloadBalancerModal
          isOpen={showWorkloadModal}
          onClose={() => setShowWorkloadModal(false)}
          deckId={deckId ?? undefined}
        />
      </div>
    )
  }

  if (session.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Building session">
        <Skeleton className="h-9 w-48" />
        <div className="panel space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-28" />
        </div>
      </div>
    )
  }

  // delayed feedback (Butler & Roediger 2008): the blind-graded misses of the
  // last 24h come first — even when nothing else in the deck is due
  if (correctionsPending) {
    return <CorrectionsScreen corrections={corrections} onDone={() => setCorrectionsSeen(true)} />
  }

  if (!current) {
    return <div className="panel text-sm text-tertiary">No cards due in this deck.</div>
  }

  // ─── Active card ───
  return (
    <div className="space-y-4">
      <PageHeader
        title={session.data?.course ? 'Mixed practice' : 'Review'}
        subtitle={session.data?.course ? session.data.course.title : undefined}
        actions={
          <div className="flex items-center gap-3 text-sm text-tertiary">
            <span>
              {idx + 1} / {queue.length}
            </span>
            <EnergyBar energy={energy} />
          </div>
        }
      />

      {mode === 'commute' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-300">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 animate-pulse" />
            <span>
              <strong>Commute Mode:</strong>{' '}
              {speechFeedback || 'Prompt spoken & voice evaluation ready.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                if (isListening) {
                  stopSpeaking()
                  setIsListening(false)
                } else if (current) {
                  void runVoiceReviewForCurrentCard(current)
                }
              }}
              className="flex items-center gap-1 text-[11px] py-1 px-2 border border-indigo-400/30"
            >
              <Mic
                className={`h-3.5 w-3.5 ${isListening ? 'text-danger-text animate-pulse' : ''}`}
              />
              {isListening ? 'Listening…' : 'Speak'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setCommuteAutoPlay(!commuteAutoPlay)}
              className="text-[11px] py-1 px-2 border border-indigo-400/30"
            >
              {commuteAutoPlay ? 'Pause Loop' : 'Resume Loop'}
            </Button>
          </div>
        </div>
      )}

      <div className="panel min-h-[280px] space-y-4">
        <div className="flex gap-2 text-[10px] uppercase tracking-widest text-tertiary">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-(--hub-panel-2)">
            {current.type}
          </span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-(--hub-panel-2)">
            reps {current.reps}
          </span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-(--hub-panel-2)">
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
              <Button variant="primary" onClick={advanceAfterExercise}>
                Next card <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <>
            {flowAlert && (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-status-info-text shrink-0" />
                  <div>
                    <span className="font-semibold text-status-info-text">
                      Flow Pacing Intervention
                    </span>
                    <p className="mt-0.5 text-xs text-sky-200/90">{flowAlert.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFlowAlert(null)}
                  className="rounded px-2 py-1 text-xs text-status-info-text hover:bg-sky-500/20"
                >
                  Dismiss
                </button>
              </div>
            )}
            {hyperNotice && (
              <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <div className="flex items-center justify-between font-semibold text-status-warning-text">
                  <span>Metacognitive Hypercorrection (Butterfield &amp; Metcalfe)</span>
                  <button
                    onClick={() => setHyperNotice(null)}
                    className="text-xs text-status-warning-text hover:text-amber-200"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="mt-1 text-xs text-amber-200/90">{hyperNotice.prompt}</p>
                <p className="mt-1 text-[11px] italic text-status-warning-text/75">
                  {hyperNotice.contrastNote}
                </p>
              </div>
            )}
            {speedDrillActive && (
              <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-status-warning-text">
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-status-warning-text" /> Speed Drill Sprint
                  </span>
                  <span className="font-mono text-sm">{speedSecondsLeft}s</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className={`h-full transition-all duration-1000 ${
                      speedSecondsLeft > 4
                        ? 'bg-emerald-500'
                        : speedSecondsLeft > 2
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, (speedSecondsLeft / speedLimitSec) * 100)}%` }}
                  />
                </div>
              </div>
            )}
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
              {!revealed && !current.blind ? (
                <>
                  <Button variant="primary" onClick={reveal}>
                    <Eye className="h-4 w-4" /> Reveal{' '}
                    <span className="text-xs opacity-70">space</span>
                  </Button>
                  <Button
                    variant={oralListening ? 'danger' : 'ghost'}
                    onClick={() => void handleOralRecall()}
                    title="Speak your answer aloud (Oral retrieval practice, generation effect)"
                  >
                    <Mic className="h-4 w-4" />
                    {oralListening ? 'Listening…' : 'Say aloud'}
                  </Button>
                </>
              ) : (
                GRADES.map((g) => {
                  const nextLabel = current.previews?.[g.grade]
                  const isSuggested = suggestedOralGrade?.grade === g.grade
                  return (
                    <Button
                      key={g.grade}
                      variant="bare"
                      className={`${g.color} text-white ${isSuggested ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
                      onClick={() => commit(g.grade)}
                      disabled={gradeMutation.isPending}
                    >
                      <span>{g.label}</span>
                      {nextLabel && !current.blind && (
                        <span className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[11px] opacity-90">
                          {nextLabel}
                        </span>
                      )}
                      <span className="text-xs opacity-65">{g.grade}</span>
                    </Button>
                  )
                })
              )}
              {suggestedOralGrade && (
                <div className="mt-1 flex w-full items-center gap-1.5 text-xs text-status-warning-text">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    Spoken: &ldquo;{suggestedOralGrade.spoken}&rdquo; — suggested grade highlighted
                    above.
                  </span>
                </div>
              )}
              {current.blind && !revealed && (
                <span
                  className="text-xs text-status-warning-text"
                  title="Delayed feedback (Butler & Roediger 2008): committing a grade before seeing the answer beat immediate feedback on a final test. Your misses (rating 1–2) surface for restudy at the start of the next session."
                >
                  graded blind — corrections at your next session
                </span>
              )}
              <div className="ml-auto flex items-center gap-1 text-xs">
                <span className="text-tertiary">confidence</span>
                <button
                  onClick={() => setConfidence(1)}
                  className={`rounded px-2 py-1 ${confidence === 1 ? 'bg-emerald-600/20 text-status-success-text' : 'text-tertiary hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'}`}
                >
                  <Check className="inline h-3 w-3" /> sure
                </button>
                <button
                  onClick={() => setConfidence(0)}
                  className={`rounded px-2 py-1 ${confidence === 0 ? 'bg-amber-600/20 text-status-warning-text' : 'text-tertiary hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'}`}
                >
                  <X className="inline h-3 w-3" /> unsure
                </button>
              </div>
              {revealed && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    const prompt = getCardVoicePrompt(current)
                    const canon =
                      typeof current.content.basic?.back === 'string'
                        ? current.content.basic.back
                        : prompt
                    setGenerationTargetCard({
                      concept: prompt,
                      explanation: canon,
                      cardId: current.id,
                    })
                    setGenerationModalOpen(true)
                  }}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
                  title="Practice 4-tier active generation ladder (Slamecka & Graf 1978)"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Generation Practice
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-tertiary">
        <Button
          variant="ghost"
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
        </Button>
        {current.type !== 'exercise' && (
          <span>
            {current.blind
              ? 'keys: 1-4 grade blind · e undo (delayed feedback — no reveal)'
              : 'keys: 1-4 grade · space reveal/Good · e undo'}
          </span>
        )}
        <Button
          variant="ghost"
          onClick={() => setCoherenceModalOpen(true)}
          className="flex items-center gap-1.5 text-xs text-status-info-text hover:text-status-info-text"
          title="0.1 Hz Baroreflex Resonance Breathing Priming"
        >
          <Wind className="h-3.5 w-3.5" />
          <span>Coherence Priming</span>
        </Button>
        <Button
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            setStarted(false)
            setFinishedAt(null)
          }}
        >
          End session <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {generationModalOpen && generationTargetCard && (
        <GenerationPracticeModal
          isOpen={generationModalOpen}
          onClose={() => setGenerationModalOpen(false)}
          initialConcept={generationTargetCard.concept}
          initialExplanation={generationTargetCard.explanation}
          cardId={generationTargetCard.cardId}
          deckId={current?.deckId ?? deckId ?? undefined}
        />
      )}

      {coherenceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl">
            <BreathingCoherenceStudio
              onCompleteSession={() => {}}
              onNavigateToReview={() => setCoherenceModalOpen(false)}
            />
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setCoherenceModalOpen(false)}
                className="text-xs text-faint hover:text-white"
              >
                Close and return to review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** The back text of a correction card, per format (restudy shows front AND back). */
function correctionAnswer(card: CorrectionCard): string {
  if (card.content.basic) return card.content.basic.back
  if (card.content.typein) return card.content.typein.acceptedAnswers.join(' · ')
  if (card.content.mcq) return card.content.mcq.options[card.content.mcq.correctIndex] ?? ''
  if (card.content.cloze) return card.content.cloze.answers.join(' · ')
  return getCardVoiceAnswer(card) // exercise/proof_step/… — best-effort extraction
}

/**
 * "Correct these first" — the restudy list of a delayed-feedback deck
 * (Butler & Roediger 2008: delaying feedback until after the response beat
 * immediate feedback on a final test). Shows every blind-graded miss of the
 * last 24h (revlog rating 1–2) with front and back revealed; reading them is
 * the correction — grading stays with FSRS, so these cards are NOT requeued.
 */
function CorrectionsScreen({
  corrections,
  onDone,
}: {
  corrections: CorrectionCard[]
  onDone: () => void
}) {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Correct these first"
        subtitle="blind-graded misses from your last session"
      />
      <div className="panel space-y-3">
        <p className="text-xs text-tertiary">
          You committed these blind — read question and answer together now. Butler &amp; Roediger
          (2008): feedback after the attempt sticks better than feedback during it.
        </p>
        <ul className="divide-y divide-neutral-100 dark:divide-(--hub-panel-2)">
          {corrections.map((c) => (
            <li key={c.id} className="space-y-1 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-tertiary dark:bg-(--hub-panel-2)">
                  {c.type}
                </span>
                <span
                  className={`text-[10px] ${c.rating === 1 ? 'text-danger-text' : 'text-status-warning-text'}`}
                >
                  {c.rating === 1 ? 'graded again' : 'graded hard'}
                </span>
              </div>
              <div className="font-medium">{getCardVoicePrompt(c)}</div>
              <div className="text-indigo-300">{correctionAnswer(c)}</div>
            </li>
          ))}
        </ul>
        <Button variant="primary" onClick={onDone}>
          Got it — start the session <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function EnergyBar({ energy }: { energy: number }) {
  const low = energy <= 1
  const Icon = low ? BatteryLow : Battery
  return (
    <span
      className={`flex items-center gap-1 ${low ? 'text-danger-text' : 'text-status-success-text'}`}
      title="session energy — mistakes drain it"
    >
      <Icon className="h-4 w-4" />
      {Array.from({ length: MAX_ENERGY }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i < energy ? (low ? 'bg-rose-400' : 'bg-emerald-400') : 'bg-neutral-300 dark:bg-(--hub-border)'}`}
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
    const promptInfo = pickCardPrompt(card)
    const front = promptInfo.text || pickBasicFront(content.basic, card.reps)
    return (
      <div className="space-y-4">
        {promptInfo.isVariant && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
            <Sparkles className="h-3 w-3" />
            <span>
              Alternate phrasing ({promptInfo.variantIndex + 1}/{promptInfo.totalVariants + 1})
            </span>
          </div>
        )}
        {/* dual coding: the image is part of the prompt, never the answer */}
        {content.basic.imageId != null && (
          <img
            src={`/api/images/${content.basic.imageId}`}
            alt=""
            className="max-h-56 rounded-lg border border-neutral-200 dark:border-(--hub-border)"
          />
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="text-xl font-medium">{front}</div>
          {isSpeechAvailable() && (
            <Button
              variant="ghost"
              className="shrink-0 border p-2"
              aria-label="Read card aloud"
              title="Read aloud"
              onClick={() => speak(front)}
            >
              <Volume2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {revealed && (
          <div className="border-t border-neutral-200 pt-4 text-lg text-indigo-300 dark:border-(--hub-border)">
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
          <div className="text-xs text-tertiary">hint: {content.cloze.hint}</div>
        )}
        {revealed && content.cloze.mode === 'typein' && (
          <div
            className={`text-sm ${clozeCorrect ? 'text-status-success-text' : 'text-danger-text'}`}
          >
            {clozeCorrect ? 'correct' : `answer: ${content.cloze.answers.join(', ')}`}
          </div>
        )}
      </div>
    )
  }

  if (content.typein) {
    const promptInfo = pickCardPrompt(card)
    const question = promptInfo.text || content.typein.question
    return (
      <div className="space-y-4">
        {promptInfo.isVariant && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
            <Sparkles className="h-3 w-3" />
            <span>
              Alternate phrasing ({promptInfo.variantIndex + 1}/{promptInfo.totalVariants + 1})
            </span>
          </div>
        )}
        <div className="text-xl font-medium">{question}</div>
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
            className={`text-lg font-medium ${typeinCorrect(props.typeinValue, content) ? 'text-status-success-text' : 'text-danger-text'}`}
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
    const promptInfo = pickCardPrompt(card)
    const question = promptInfo.text || content.mcq.question
    return (
      <div className="space-y-4">
        {promptInfo.isVariant && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
            <Sparkles className="h-3 w-3" />
            <span>
              Alternate phrasing ({promptInfo.variantIndex + 1}/{promptInfo.totalVariants + 1})
            </span>
          </div>
        )}
        <div className="text-xl font-medium">{question}</div>
        {!revealed && (
          <div className="text-sm text-tertiary">
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
                      ? 'border-emerald-600 bg-emerald-600/10 text-status-success-text'
                      : picked
                        ? 'border-rose-600 bg-rose-600/10 text-danger-text'
                        : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-(--hub-border) dark:text-secondary dark:hover:bg-(--hub-panel-2)'
                  }`}
                >
                  {String.fromCharCode(65 + i)}. {opt}
                </button>
              )
            })}
            {props.mcqPick !== null && content.mcq.rationale && (
              <div className="text-xs text-tertiary">{content.mcq.rationale}</div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (content.occlusion) {
    return <OcclusionView card={card} revealed={revealed} />
  }

  if (content.sketch) {
    return <SketchView card={card} revealed={revealed} />
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
                <span className="text-tertiary">{i + 1}.</span>
                <span>{visible ? step : '•••'}</span>
              </li>
            )
          })}
        </ol>
        <div className="text-sm text-tertiary">
          {revealed ? (
            <span className="text-base text-status-success-text">
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
        {g.translation && revealed && <div className="text-sm text-tertiary">{g.translation}</div>}
      </div>
    )
  }

  if (content.matching) {
    return (
      <div className="space-y-2">
        <div className="label">matching set (play it in Games)</div>
        {revealed && (
          <ul className="list-inside list-disc text-sm text-secondary">
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

  return <div className="text-sm text-tertiary">Unsupported card format.</div>
}

/** Image occlusion: absolutely-positioned normalized-rect overlays, labels on reveal. */
function OcclusionView({ card, revealed }: { card: CardRow; revealed: boolean }) {
  const occ = card.content.occlusion
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  if (!occ) return null

  const mode = occ.mode ?? 'hide-all-guess-one'
  const activeId = occ.activeRectId

  return (
    <div className="space-y-2">
      <div
        className="relative mx-auto max-w-xl overflow-hidden rounded-lg border border-neutral-200 dark:border-(--hub-border)"
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
        {occ.rects.map((rect) => {
          const isTarget = !activeId || activeId === rect.id
          const isMasked = mode === 'hide-all-guess-one' ? true : isTarget
          const isEllipse = rect.shape === 'ellipse'

          let overlayStyle = ''
          if (!isMasked) {
            // Unmasked helper label in hide-one-guess-one mode
            overlayStyle = 'border border-neutral-600/30 bg-black/30'
          } else if (!revealed) {
            // Masked before reveal
            overlayStyle = isTarget
              ? 'border-2 border-sky-400 bg-sky-600/70 shadow-lg shadow-cyan-500/20 animate-pulse'
              : 'border border-amber-600/80 bg-amber-800/80'
          } else {
            // Revealed
            overlayStyle = isTarget
              ? 'border-2 border-emerald-400 bg-emerald-500/30'
              : 'border border-indigo-400/60 bg-indigo-500/20'
          }

          return (
            <div
              key={rect.id}
              className={`absolute transition-colors ${isEllipse ? 'rounded-full' : 'rounded'} ${overlayStyle}`}
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            >
              {(revealed || !isMasked) && rect.label && (
                <span className="absolute inset-0 grid place-items-center text-xs font-semibold text-white drop-shadow">
                  {rect.label}
                </span>
              )}
            </div>
          )
        })}
        {size === null && (
          <div className="absolute inset-0 grid place-items-center text-xs text-tertiary">
            loading image…
          </div>
        )}
      </div>
      {!revealed && (
        <div className="text-center text-xs text-faint">
          {mode === 'hide-all-guess-one'
            ? 'Identify the highlighted blue region'
            : 'Identify the occluded region'}
        </div>
      )}
    </div>
  )
}

/** Sketch-from-memory card view with InkPad and solution reveal. */
function SketchView({ card, revealed }: { card: CardRow; revealed: boolean }) {
  const sketch = card.content.sketch
  if (!sketch) return null

  return (
    <div className="space-y-4">
      <div className="text-base font-medium text-neutral-100">{sketch.prompt}</div>

      <div className="space-y-1.5">
        <div className="text-xs text-faint">Draw or write your answer:</div>
        <InkPad
          height={220}
          readOnly={revealed}
          onChange={(url) => {
            void apiSend('/api/review/attempt-image', 'POST', {
              cardId: card.id,
              imageData: url,
            })
          }}
        />
      </div>

      {revealed && (
        <div className="rounded-xl border border-neutral-700/80 bg-neutral-900/80 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-status-success-text flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            Reference Solution
          </div>

          {sketch.referenceImageId && (
            <img
              src={`/api/images/${sketch.referenceImageId}`}
              alt="Reference solution"
              className="max-h-60 rounded-lg mx-auto border border-neutral-800"
            />
          )}

          {sketch.referenceText && (
            <p className="text-sm text-neutral-200 leading-relaxed">{sketch.referenceText}</p>
          )}

          {sketch.rubric && sketch.rubric.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="text-xs font-medium text-faint">Recall check:</div>
              <ul className="list-disc pl-5 text-xs text-secondary space-y-0.5">
                {sketch.rubric.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
