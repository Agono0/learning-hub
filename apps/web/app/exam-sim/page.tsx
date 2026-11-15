'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Award,
  CheckCircle2,
  Clock,
  Flag,
  Mic,
  PlusCircle,
  RefreshCw,
  Timer,
  XCircle,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { hapticHeavy, hapticLight } from '@/platform/haptics'
import { Button, Callout, PageHeader, Panel, Skeleton, useToast } from '@/ui'

interface ExamQuestion {
  cardId: number
  type: string
  prompt: string
  options?: string[]
  bloomLevel: 'remember' | 'understand' | 'apply'
}

interface ExamAssembly {
  ok: boolean
  examId: string
  durationMinutes: number
  totalQuestions: number
  questions: ExamQuestion[]
  availableDecks: Array<{ id: number; name: string }>
}

interface ExamGradedResult {
  ok: boolean
  score: number
  correctCount: number
  totalQuestions: number
  bloomBreakdown: Record<string, { total: number; correct: number }>
  results: Array<{
    cardId: number
    prompt: string
    userAnswer: string
    correctAnswer: string
    correct: boolean
    bloomLevel: 'remember' | 'understand' | 'apply'
  }>
  missedCards: Array<{ front: string; back: string }>
  feedbackSummary: string
}

export default function ExamSimulatorPage() {
  const { toast } = useToast()

  // Setup state
  const [selectedDeckId, setSelectedDeckId] = useState<string>('all')
  const [questionCount, setQuestionCount] = useState<number>(10)
  const [durationMinutes, setDurationMinutes] = useState<number>(15)

  // In-exam state
  const [inExam, setInExam] = useState<boolean>(false)
  const [examData, setExamData] = useState<ExamAssembly | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [flagged, setFlagged] = useState<Set<number>>(new Set())
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0)
  const [timerActive, setTimerActive] = useState<boolean>(false)

  // Graded report state
  const [gradedReport, setGradedReport] = useState<ExamGradedResult | null>(null)
  const [cardsAdded, setCardsAdded] = useState<boolean>(false)

  const answersRef = useRef(answers)
  answersRef.current = answers

  // Fetch initial decks list
  const { data: initialData, isLoading: initialLoading } = useQuery<ExamAssembly>({
    queryKey: ['exam-sim-initial'],
    queryFn: () => apiGet('/api/curriculum/exam/simulator?count=1&durationMinutes=15'),
  })

  // Start exam
  const startExamMutation = useMutation({
    mutationFn: async () => {
      const url = `/api/curriculum/exam/simulator?count=${questionCount}&durationMinutes=${durationMinutes}${
        selectedDeckId !== 'all' ? `&deckId=${selectedDeckId}` : ''
      }`
      return apiGet<ExamAssembly>(url)
    },
    onSuccess: (data) => {
      if (!data.questions || data.questions.length === 0) {
        toast({
          title: 'No cards available',
          description: 'The selected deck has no active flashcards to test.',
          tone: 'danger',
        })
        return
      }
      setExamData(data)
      setCurrentIndex(0)
      setAnswers({})
      setFlagged(new Set())
      setSecondsRemaining(data.durationMinutes * 60)
      setTimerActive(true)
      setInExam(true)
      setGradedReport(null)
      setCardsAdded(false)
    },
    onError: (err) => {
      toast({
        title: 'Failed to assemble exam',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    },
  })

  // Submit exam for delayed blind grading
  const gradeExamMutation = useMutation({
    mutationFn: async () => {
      if (!examData) return null
      const currentAns = answersRef.current
      const submissions = examData.questions.map((q) => ({
        cardId: q.cardId,
        answer: currentAns[q.cardId] || '',
      }))
      return apiSend<ExamGradedResult>('/api/curriculum/exam/simulator', 'POST', {
        action: 'grade',
        examId: examData.examId,
        submissions,
      })
    },
    onSuccess: (report) => {
      if (!report) return
      setTimerActive(false)
      setInExam(false)
      setGradedReport(report)
      // Haptic texture on the exam boundary: heavy beat for a miss-heavy
      // submission (attention), light for a pass (F-06 wiring parity).
      if (report.score >= 50) hapticLight()
      else hapticHeavy()
      toast({
        title: 'Exam submitted',
        description: `Your score: ${report.score}%. Delayed feedback is ready to review.`,
        tone: 'success',
      })
    },
    onError: (err) => {
      toast({
        title: 'Grading failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    },
  })

  // Create cards from misses
  const addMissesMutation = useMutation({
    mutationFn: async () => {
      if (!gradedReport || gradedReport.missedCards.length === 0) return null
      return apiSend<{ ok: boolean; createdCount: number }>(
        '/api/curriculum/exam/simulator',
        'POST',
        {
          action: 'create_cards_from_misses',
          misses: gradedReport.missedCards,
        },
      )
    },
    onSuccess: (res) => {
      if (!res) return
      setCardsAdded(true)
      toast({
        title: 'Cards added to review',
        description: `Created ${res.createdCount} new spaced repetition flashcards from your misses.`,
        tone: 'success',
      })
    },
    onError: (err) => {
      toast({
        title: 'Failed to create cards',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    },
  })

  // Timer countdown: interval updates seconds without re-creating interval every second
  useEffect(() => {
    if (!timerActive) return
    const interval = setInterval(() => {
      setSecondsRemaining((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [timerActive])

  // Timer expiration trigger: safely submits exam when countdown reaches 0
  useEffect(() => {
    if (timerActive && secondsRemaining <= 0) {
      setTimerActive(false)
      gradeExamMutation.mutate()
    }
  }, [timerActive, secondsRemaining, gradeExamMutation])

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const toggleFlag = (cardId: number) => {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  if (initialLoading) {
    return (
      <div className="container max-w-4xl space-y-6 py-6">
        <PageHeader
          title="Mock Exam Simulator"
          subtitle="Timed mock exams with delayed blind grading."
        />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  // ── VIEW 1: EXAM SETUP ────────────────────────────────────────────────────
  if (!inExam && !gradedReport) {
    const availableDecks = initialData?.availableDecks ?? []

    return (
      <div className="container max-w-2xl space-y-6 py-6">
        <PageHeader
          title="Timed Mock Exam Simulator"
          subtitle="Simulate real test pressure with delayed-feedback blind grading and automated remediation."
        />

        <Callout tone="accent" title="Delayed Feedback Testing Effect (Butler & Roediger 2008)">
          Instant feedback during an exam short-circuits critical calibration. This simulator grades
          your entire test only AFTER submission, mirroring real examination conditions for maximum
          retention.
        </Callout>

        <Panel className="p-6 space-y-5">
          <div>
            <label className="label mb-1.5 block">Select Subject / Deck</label>
            <select
              value={selectedDeckId}
              onChange={(e) => setSelectedDeckId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-(--hub-border) dark:bg-(--hub-panel)"
            >
              <option value="all">All Available Decks</option>
              {availableDecks.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label mb-1.5 block">Question Count</label>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-(--hub-border) dark:bg-(--hub-panel)"
              >
                <option value={5}>5 Questions (Quick Check)</option>
                <option value={10}>10 Questions (Standard)</option>
                <option value={20}>20 Questions (In-depth)</option>
                <option value={30}>30 Questions (Full Paper)</option>
              </select>
            </div>

            <div>
              <label className="label mb-1.5 block">Time Limit</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-(--hub-border) dark:bg-(--hub-panel)"
              >
                <option value={5}>5 Minutes</option>
                <option value={10}>10 Minutes</option>
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <Button
              className="w-full"
              onClick={() => startExamMutation.mutate()}
              disabled={startExamMutation.isPending}
            >
              <Timer className="h-4 w-4 mr-2" />
              Begin Timed Exam
            </Button>
          </div>
        </Panel>
      </div>
    )
  }

  // ── VIEW 2: ACTIVE TIMED EXAM ─────────────────────────────────────────────
  if (inExam && examData) {
    const currentQuestion = examData.questions[currentIndex]
    const currentAnswer = answers[currentQuestion.cardId] || ''
    const isCurrentFlagged = flagged.has(currentQuestion.cardId)
    const isUrgent = secondsRemaining < 120 // under 2 minutes
    const answeredCount = Object.keys(answers).filter((k) => answers[Number(k)]?.trim()).length

    return (
      <div className="container max-w-3xl space-y-4 py-4">
        {/* Exam Navigation Header */}
        <Panel className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-neutral-400">Exam Mode</span>
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                Question {currentIndex + 1} of {examData.totalQuestions}
              </span>
            </div>

            <div
              role="timer"
              aria-label="Remaining time"
              className={`flex items-center gap-1.5 font-mono text-base font-bold tabular-nums px-2.5 py-1 rounded-md ${
                isUrgent
                  ? 'bg-rose-100 text-rose-600 animate-pulse dark:bg-rose-950/60 dark:text-rose-400'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
              }`}
            >
              <Clock className="h-4 w-4" />
              {formatTimer(secondsRemaining)}
            </div>
            {/* Throttled screen reader announcement at critical thresholds */}
            <div className="sr-only" aria-live="polite">
              {secondsRemaining === 600
                ? '10 minutes remaining'
                : secondsRemaining === 300
                  ? '5 minutes remaining'
                  : secondsRemaining === 60
                    ? '1 minute remaining'
                    : secondsRemaining === 30
                      ? '30 seconds remaining'
                      : null}
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                const unanswered = examData.totalQuestions - answeredCount
                if (unanswered > 0) {
                  if (confirm(`You still have ${unanswered} unanswered question(s). Submit now?`)) {
                    gradeExamMutation.mutate()
                  }
                } else {
                  gradeExamMutation.mutate()
                }
              }}
              disabled={gradeExamMutation.isPending}
            >
              Submit Exam
            </Button>
          </div>

          {/* Question Palette Buttons */}
          <div role="tablist" aria-label="Exam questions" className="flex flex-wrap gap-1.5 pt-1">
            {examData.questions.map((q, idx) => {
              const hasAns = !!answers[q.cardId]?.trim()
              const isFlg = flagged.has(q.cardId)
              const isCur = idx === currentIndex

              return (
                <button
                  key={q.cardId}
                  type="button"
                  role="tab"
                  aria-selected={isCur}
                  aria-label={`Question ${idx + 1}${hasAns ? ', answered' : ', unanswered'}${isFlg ? ', flagged' : ''}`}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-8 w-8 min-h-[36px] min-w-[36px] rounded text-xs font-medium transition-all ${
                    isCur
                      ? 'ring-2 ring-indigo-500 font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300'
                      : isFlg
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : hasAns
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400'
                  }`}
                >
                  {idx + 1}
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Current Question Body */}
        <Panel className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-(--hub-border)">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              Bloom Level: {currentQuestion.bloomLevel}
            </span>

            <button
              type="button"
              onClick={() => toggleFlag(currentQuestion.cardId)}
              className={`flex items-center gap-1 text-xs font-medium ${
                isCurrentFlagged ? 'text-amber-500' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <Flag className="h-3.5 w-3.5" />
              {isCurrentFlagged ? 'Flagged' : 'Flag'}
            </button>
          </div>

          <div className="text-base font-medium leading-relaxed text-neutral-900 dark:text-neutral-100">
            {currentQuestion.prompt}
          </div>

          {/* Input: Multiple Choice or Open Text */}
          {currentQuestion.options && currentQuestion.options.length > 0 ? (
            <div className="space-y-2 pt-2">
              {currentQuestion.options.map((opt, oIdx) => (
                <label
                  key={oIdx}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                    currentAnswer === opt
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-neutral-200 hover:bg-neutral-50 dark:border-(--hub-border) dark:hover:bg-neutral-900/40'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${currentQuestion.cardId}`}
                    checked={currentAnswer === opt}
                    onChange={() =>
                      setAnswers((prev) => ({ ...prev, [currentQuestion.cardId]: opt }))
                    }
                    className="accent-indigo-500"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="pt-2">
              <textarea
                value={currentAnswer}
                onChange={(e) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [currentQuestion.cardId]: e.target.value,
                  }))
                }
                placeholder="Type your exam answer here..."
                rows={4}
                className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-(--hub-border) dark:bg-(--hub-panel)"
              />
            </div>
          )}

          {/* Prev / Next Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-(--hub-border)">
            <Button
              variant="ghost"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-neutral-400">
              {answeredCount} of {examData.totalQuestions} answered
            </span>
            <Button
              disabled={currentIndex === examData.totalQuestions - 1}
              onClick={() => setCurrentIndex((i) => Math.min(examData.totalQuestions - 1, i + 1))}
            >
              Next
            </Button>
          </div>
        </Panel>
      </div>
    )
  }

  // ── VIEW 3: POST-EXAM SCORE & DELAYED FEEDBACK REPORT ─────────────────────
  if (gradedReport) {
    const passed = gradedReport.score >= 70

    return (
      <div className="container max-w-3xl space-y-6 py-6">
        <PageHeader
          title="Exam Score & Remediation"
          subtitle="Delayed evaluation report and automated card generation."
        />

        {/* Score Banner */}
        <Panel className="p-6 text-center space-y-3">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
            <Award className={`h-10 w-10 ${passed ? 'text-emerald-500' : 'text-amber-500'}`} />
          </div>
          <div>
            <div
              className={`text-4xl font-extrabold ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
            >
              {gradedReport.score}%
            </div>
            <div className="text-sm font-medium text-neutral-500">
              {gradedReport.correctCount} of {gradedReport.totalQuestions} Questions Correct
            </div>
          </div>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            {gradedReport.feedbackSummary}
          </p>
        </Panel>

        {/* Bloom Taxonomy Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {(['remember', 'understand', 'apply'] as const).map((lvl) => {
            const b = gradedReport.bloomBreakdown[lvl] ?? { total: 0, correct: 0 }
            const pct = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0
            return (
              <Panel key={lvl} className="p-3 text-center space-y-1">
                <div className="text-[10px] uppercase font-semibold text-neutral-400">{lvl}</div>
                <div className="text-xl font-bold">{pct}%</div>
                <div className="text-[11px] text-neutral-500">
                  {b.correct} / {b.total}
                </div>
              </Panel>
            )
          })}
        </div>

        {/* Action: Add Missed Questions to Flashcards */}
        {gradedReport.missedCards.length > 0 && (
          <Panel className="p-4 bg-amber-50/60 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Turn Misses into Spaced Repetition Cards
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {gradedReport.missedCards.length} missed question(s) identified. Reinforce them in
                  your daily review.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/voice-tutor?topic=${encodeURIComponent(
                    `Missed exam questions remediation: ${gradedReport.missedCards[0]?.front ?? ''}`,
                  )}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-xs hover:bg-white dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                >
                  <Mic className="h-3.5 w-3.5" />
                  Socratic Voice Drill
                </Link>
                {cardsAdded ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Added to Decks
                  </span>
                ) : (
                  <Button
                    onClick={() => addMissesMutation.mutate()}
                    disabled={addMissesMutation.isPending}
                  >
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    Add {gradedReport.missedCards.length} Misses to Review
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        )}

        {/* Detailed Question Review */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Question Review (Delayed Feedback)
          </h3>

          {gradedReport.results.map((res, idx) => (
            <Panel key={res.cardId} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-400">
                  Q{idx + 1} · {res.bloomLevel}
                </span>
                {res.correct ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Correct
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <XCircle className="h-3.5 w-3.5" /> Missed
                  </span>
                )}
              </div>

              <div className="text-sm font-medium">{res.prompt}</div>

              <div className="grid gap-2 text-xs pt-1 sm:grid-cols-2">
                <div className="rounded bg-neutral-50 p-2 dark:bg-neutral-900/50">
                  <span className="font-semibold text-neutral-400 block mb-0.5">Your Answer:</span>
                  <span
                    className={
                      res.correct
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }
                  >
                    {res.userAnswer || '(blank)'}
                  </span>
                </div>
                <div className="rounded bg-neutral-50 p-2 dark:bg-neutral-900/50">
                  <span className="font-semibold text-neutral-400 block mb-0.5">
                    Correct Answer:
                  </span>
                  <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                    {res.correctAnswer || 'See reference'}
                  </span>
                </div>
              </div>

              {!res.correct && (
                <div className="pt-1">
                  <Link
                    href={`/voice-tutor?topic=${encodeURIComponent(res.prompt)}&cardId=${res.cardId}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    <Mic className="h-3 w-3" /> Drill with Socratic Voice Tutor
                  </Link>
                </div>
              )}
            </Panel>
          ))}
        </div>

        {/* Retake Button */}
        <div className="pt-2 text-center">
          <Button
            variant="ghost"
            onClick={() => {
              setGradedReport(null)
              setInExam(false)
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Take Another Exam
          </Button>
        </div>
      </div>
    )
  }

  return null
}
