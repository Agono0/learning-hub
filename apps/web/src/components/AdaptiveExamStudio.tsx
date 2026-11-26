'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Download,
  Flag,
  Play,
  RefreshCw,
  RotateCcw,
  Target,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react'
import { IconButton } from '@/ui'
import {
  CALIBRATED_QUESTION_BANKS,
  AdaptiveExamSession,
  SuccessiveRelearningBuffer,
  type AdaptiveExamConfig,
  type AdaptiveQuestionItem,
  type BloomCognitiveLevel,
} from '@learning-hub/core/practice'
import { getSharedAudioContext } from '../lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import { AdaptiveExamHUD } from '../ui/AdaptiveExamHUD'
import { cx } from '../ui/cx'

export interface AdaptiveExamStudioProps {
  initialDomain?: string
  passingStandardTheta?: number
  onCompleteExam?: (results: {
    theta: number
    percentile: number
    scorePercent: number
    masteryStatus: string
    missedItems: AdaptiveQuestionItem[]
  }) => void
  onExportRemedialCards?: (cards: Array<{ front: string; back: string; tags: string[] }>) => void
  className?: string
}

export function AdaptiveExamStudio({
  initialDomain = 'neuroscience_memory',
  passingStandardTheta = 0.3,
  onCompleteExam,
  onExportRemedialCards,
  className,
}: AdaptiveExamStudioProps) {
  // Domain selection
  const [selectedDomain, setSelectedDomain] = useState<string>(initialDomain)
  const itemPool = useMemo(() => {
    return (
      CALIBRATED_QUESTION_BANKS[selectedDomain] || CALIBRATED_QUESTION_BANKS.neuroscience_memory!
    )
  }, [selectedDomain])

  // Exam Configuration
  const examConfig: AdaptiveExamConfig = useMemo(
    () => ({
      id: `cat-exam-${selectedDomain}`,
      title:
        selectedDomain === 'neuroscience_memory'
          ? 'Neuroscience & Synaptic Plasticity CAT'
          : selectedDomain === 'distributed_consensus'
            ? 'Distributed Consensus & Fault Tolerance CAT'
            : 'Cognitive Architecture & Memory Systems CAT',
      domain: selectedDomain,
      passingThetaStandard: passingStandardTheta,
      sprtConfidenceAlpha: 0.05,
      sprtConfidenceBeta: 0.05,
      minQuestions: 3,
      maxQuestions: 8,
      targetSem: 0.32,
      timeLimitSeconds: 1200,
      successiveRelearningCriterion: 2,
    }),
    [selectedDomain, passingStandardTheta],
  )

  // Exam Session Instance
  const sessionRef = useRef<AdaptiveExamSession>(new AdaptiveExamSession(examConfig, itemPool))
  const [isExamActive, setIsExamActive] = useState(false)
  const [isExamCompleted, setIsExamCompleted] = useState(false)

  // Current question & user interaction state
  const [currentItem, setCurrentItem] = useState<AdaptiveQuestionItem | null>(() =>
    sessionRef.current.getCurrentItem(),
  )
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [eliminatedOptions, setEliminatedOptions] = useState<Set<number>>(new Set())
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now())
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Live telemetry state
  const [currentTheta, setCurrentTheta] = useState(0.0)
  const [currentSem, setCurrentSem] = useState(1.0)
  const [administeredCount, setAdministeredCount] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(examConfig.timeLimitSeconds)

  // Diagnostic Report & Successive Relearning State
  const [diagnosticReport, setDiagnosticReport] = useState<ReturnType<
    AdaptiveExamSession['generateDiagnosticAutopsy']
  > | null>(null)
  const relearningBufferRef = useRef<SuccessiveRelearningBuffer>(new SuccessiveRelearningBuffer(2))
  const [relearningActiveIndex, setRelearningActiveIndex] = useState(0)
  const [relearningNotice, setRelearningNotice] = useState<string | null>(null)

  // Audio Earcon Synthesizer
  const playAudioEarcon = useCallback(
    (type: 'submit' | 'complete' | 'relearning') => {
      if (!soundEnabled) return
      void getSharedAudioContext()
        .then((audioCtx) => {
          const now = audioCtx.currentTime
          const osc = audioCtx.createOscillator()
          const gain = audioCtx.createGain()

          osc.type = 'sine'
          gain.gain.setValueAtTime(0.001, now)

          if (type === 'submit') {
            osc.frequency.setValueAtTime(523.25, now) // C5
            gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
            osc.start(now)
            osc.stop(now + 0.25)
          } else if (type === 'complete') {
            osc.frequency.setValueAtTime(440, now)
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15)
            gain.gain.exponentialRampToValueAtTime(0.15, now + 0.04)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
            osc.start(now)
            osc.stop(now + 0.42)
          } else {
            osc.frequency.setValueAtTime(659.25, now) // E5
            gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
            osc.start(now)
            osc.stop(now + 0.2)
          }

          osc.connect(gain)
          gain.connect(audioCtx.destination)
        })
        .catch(() => {})
    },
    [soundEnabled],
  )

  // Timer countdown
  useEffect(() => {
    if (!isExamActive || isExamCompleted) return
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          handleFinishExam()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [isExamActive, isExamCompleted])

  // Start / Reset Exam Session
  const handleStartExam = () => {
    sessionRef.current = new AdaptiveExamSession(examConfig, itemPool)
    relearningBufferRef.current = new SuccessiveRelearningBuffer(2)
    setCurrentItem(sessionRef.current.getCurrentItem())
    setSelectedOption(null)
    setEliminatedOptions(new Set())
    setFlaggedQuestions(new Set())
    setCurrentTheta(0.0)
    setCurrentSem(1.0)
    setAdministeredCount(0)
    setTimeRemaining(examConfig.timeLimitSeconds)
    setIsExamActive(true)
    setIsExamCompleted(false)
    setDiagnosticReport(null)
    setQuestionStartTime(Date.now())
    playAudioEarcon('submit')
    hapticMedium()
  }

  // Toggle option strike-through distractor elimination
  const handleToggleEliminate = (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    setEliminatedOptions((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
    hapticLight()
  }

  // Submit response and adaptively route to next item
  const handleSubmitAnswer = () => {
    if (selectedOption === null || !currentItem) return
    const responseTime = Date.now() - questionStartTime

    const result = sessionRef.current.submitResponse(selectedOption, responseTime)

    // Feed missed questions into Successive Relearning buffer
    if (!result.isCorrect) {
      relearningBufferRef.current.addFailedItem(
        currentItem,
        selectedOption,
        `Selected: "${currentItem.options[selectedOption]}". Correct: "${currentItem.options[currentItem.correctOptionIndex]}".`,
      )
    }

    setCurrentTheta(result.newTheta)
    setCurrentSem(result.newSem)
    setAdministeredCount(sessionRef.current.getAdministeredCount())

    if (result.isTerminated) {
      handleFinishExam()
    } else {
      setCurrentItem(sessionRef.current.getCurrentItem())
      setSelectedOption(null)
      setEliminatedOptions(new Set())
      setQuestionStartTime(Date.now())
      playAudioEarcon('submit')
      hapticMedium()
    }
  }

  // Finalize exam and generate diagnostic autopsy
  const handleFinishExam = () => {
    setIsExamCompleted(true)
    setIsExamActive(false)
    const report = sessionRef.current.generateDiagnosticAutopsy()
    setDiagnosticReport(report)
    playAudioEarcon('complete')
    hapticHeavy()

    if (onCompleteExam) {
      onCompleteExam({
        theta: report.theta,
        percentile: report.percentile,
        scorePercent: report.scorePercent,
        masteryStatus: report.masteryStatus,
        missedItems: report.missedItems.map((m) => m.item),
      })
    }
  }

  // Successive Relearning drill attempt handler
  const handleRelearningAttempt = (isSuccess: boolean) => {
    const pending = relearningBufferRef.current.getPendingItems()
    const targetItem = pending[relearningActiveIndex]
    if (!targetItem) return

    relearningBufferRef.current.recordRecallAttempt(targetItem.questionItem.id, isSuccess)
    playAudioEarcon('relearning')
    hapticMedium()

    // Next item or loop
    const updatedPending = relearningBufferRef.current.getPendingItems()
    if (updatedPending.length > 0) {
      setRelearningActiveIndex((idx) => idx % updatedPending.length)
    }
  }

  // Export remedial flashcards to FSRS deck
  const handleExportRemedialCards = () => {
    if (!diagnosticReport) return
    const cards = diagnosticReport.missedItems.map((m) => ({
      front: `[Exam Remediation] ${m.item.prompt}`,
      back: `Correct Answer: ${m.item.options[m.item.correctOptionIndex]}\n\nRationale:\n${m.item.explanation}`,
      tags: ['exam-remediation', selectedDomain, m.item.bloomLevel],
    }))

    if (onExportRemedialCards) {
      onExportRemedialCards(cards)
    }
    setRelearningNotice(`Exported ${cards.length} targeted remediation cards to your deck!`)
    playAudioEarcon('complete')
    hapticMedium()
    setTimeout(() => setRelearningNotice(null), 4000)
  }

  const pendingRelearning = relearningBufferRef.current.getPendingItems()
  const activeRelearningItem = pendingRelearning[relearningActiveIndex] || null

  return (
    <div
      className={cx(
        'relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl transition-all',
        className,
      )}
    >
      {/* Studio Header */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">{examConfig.title}</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-secondary">
                Item Response Theory
              </span>
            </div>
            <p className="text-[11px] text-faint">
              Computerized Adaptive Testing & Successive Relearning Remediation (Rawson & Dunlosky
              2011)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {/* Domain Bank Selector */}
          {!isExamActive && (
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 outline-none"
            >
              <option value="neuroscience_memory" className="bg-slate-900">
                Neurobiology of Memory (CA1/LTP/STC)
              </option>
              <option value="distributed_consensus" className="bg-slate-900">
                Distributed Systems (Raft/CAP/CRDT)
              </option>
              <option value="cognitive_psychology" className="bg-slate-900">
                Cognitive Science (FSRS/Sweller)
              </option>
            </select>
          )}

          {/* Sound Toggle */}
          <IconButton
            label="Toggle Audio Cues"
            size="sm"
            onClick={() => setSoundEnabled((p) => !p)}
            className="rounded-xl border border-white/10 bg-white/5 text-faint hover:text-white"
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-indigo-400" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </IconButton>
        </div>
      </div>

      {/* Main Studio Viewport */}
      <div className="p-6 space-y-6">
        {/* PRE-EXAM STATE */}
        {!isExamActive && !isExamCompleted && (
          <div className="max-w-xl mx-auto space-y-6 text-center py-8">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Award className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-tight">
                High-Stakes Adaptive Examination
              </h3>
              <p className="text-xs text-secondary leading-relaxed max-w-md mx-auto">
                Unlike static quizzes, questions adapt to your latent ability (θ) in real time using
                3-Parameter Logistic IRT. Every incorrect response is routed into a Successive
                Relearning verification buffer.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-left">
              <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint block mb-1">
                  Stopping Rule
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  SEM ≤ {examConfig.targetSem} or SPRT
                </span>
              </div>
              <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint block mb-1">
                  Time Budget
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  {Math.round(examConfig.timeLimitSeconds / 60)} Minutes
                </span>
              </div>
              <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint block mb-1">
                  Pass Standard
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  θ ≥ +{examConfig.passingThetaStandard.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartExam}
              className="inline-flex items-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-600/30 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-600/50 shadow-xl transition-all"
            >
              <Play className="h-4 w-4" />
              <span>Begin Adaptive Examination</span>
            </button>
          </div>
        )}

        {/* IN-EXAM ACTIVE STATE */}
        {isExamActive && currentItem && (
          <div className="space-y-6">
            {/* Live IRT Telemetry HUD */}
            <AdaptiveExamHUD
              currentTheta={currentTheta}
              currentSem={currentSem}
              targetSem={examConfig.targetSem}
              questionNumber={administeredCount + 1}
              totalQuestionsLimit={examConfig.maxQuestions}
              timeRemainingSeconds={timeRemaining}
              sprtDecision={sessionRef.current.getSprtStatus().decision}
              currentItem={currentItem}
            />

            {/* Question Stem Box */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    Bloom: {currentItem.bloomLevel}
                  </span>
                  <span className="text-xs text-faint font-medium">
                    Difficulty b = {currentItem.difficulty.toFixed(2)} · Discrimination a ={' '}
                    {currentItem.discrimination.toFixed(2)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFlaggedQuestions((prev) => {
                      const next = new Set(prev)
                      if (next.has(currentItem.id)) next.delete(currentItem.id)
                      else next.add(currentItem.id)
                      return next
                    })
                    hapticLight()
                  }}
                  className={cx(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all',
                    flaggedQuestions.has(currentItem.id)
                      ? 'border-amber-500/40 bg-amber-500/20 text-status-warning-text'
                      : 'border-white/10 bg-white/5 text-faint hover:text-white',
                  )}
                >
                  <Flag className="h-3 w-3" />
                  <span>{flaggedQuestions.has(currentItem.id) ? 'Flagged' : 'Flag'}</span>
                </button>
              </div>

              <h3 className="text-base font-bold text-white leading-relaxed">
                {currentItem.prompt}
              </h3>

              {/* Distractor Elimination Hint */}
              <p className="text-[11px] text-faint italic">
                Tip: Click the cross icon to strike through distractors you have ruled out.
              </p>

              {/* Multiple Choice Options */}
              <div className="space-y-2.5 pt-2">
                {currentItem.options.map((opt, i) => {
                  const isSelected = selectedOption === i
                  const isEliminated = eliminatedOptions.has(i)
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        if (!isEliminated) {
                          setSelectedOption(i)
                          hapticLight()
                        }
                      }}
                      className={cx(
                        'group flex items-center justify-between gap-3 rounded-xl border p-4 transition-all cursor-pointer',
                        isEliminated
                          ? 'border-white/5 bg-slate-950/40 opacity-40 line-through text-tertiary'
                          : isSelected
                            ? 'border-indigo-500 bg-indigo-500/20 shadow-md ring-1 ring-indigo-500/40 text-white'
                            : 'border-white/5 bg-slate-950/80 text-slate-200 hover:border-white/15 hover:bg-slate-900',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cx(
                            'flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold font-mono transition-all',
                            isSelected
                              ? 'bg-indigo-500 text-white'
                              : 'bg-white/10 text-faint group-hover:text-white',
                          )}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-xs font-medium leading-relaxed">{opt}</span>
                      </div>

                      {/* Strike-through button */}
                      <IconButton
                        label={isEliminated ? 'Restore option' : 'Eliminate distractor'}
                        size="sm"
                        variant="bare"
                        onClick={(e) => handleToggleEliminate(e, i)}
                        className={cx(
                          'rounded-md text-faint hover:text-danger-text hover:bg-rose-500/10 text-[11px]',
                          isEliminated ? 'text-danger-text' : '',
                        )}
                        title={isEliminated ? 'Restore option' : 'Eliminate distractor'}
                      >
                        <XCircle className="h-4 w-4" />
                      </IconButton>
                    </div>
                  )
                })}
              </div>

              {/* Submit Answer Action */}
              <div className="flex items-center justify-end pt-4 border-t border-white/5">
                <button
                  type="button"
                  disabled={selectedOption === null}
                  onClick={handleSubmitAnswer}
                  className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-600/30 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-600/50 disabled:opacity-40 transition-all shadow-sm"
                >
                  <span>Submit & Route Next</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POST-EXAM DIAGNOSTIC AUTOPSY */}
        {isExamCompleted && diagnosticReport && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
                    Diagnostic Autopsy & Mastery Verdict
                  </span>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Examination Completed · Latent Ability θ ={' '}
                    {diagnosticReport.theta > 0
                      ? `+${diagnosticReport.theta.toFixed(2)}`
                      : diagnosticReport.theta.toFixed(2)}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold',
                      diagnosticReport.masteryStatus === 'certified_mastery'
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-status-success-text'
                        : diagnosticReport.masteryStatus === 'provisional_pass'
                          ? 'border-sky-500/40 bg-sky-500/15 text-status-info-text'
                          : 'border-rose-500/40 bg-rose-500/15 text-danger-text',
                    )}
                  >
                    <Award className="h-4 w-4" />
                    {diagnosticReport.masteryStatus === 'certified_mastery'
                      ? 'Certified Mastery'
                      : diagnosticReport.masteryStatus === 'provisional_pass'
                        ? 'Provisional Pass'
                        : 'Remediation Recommended'}
                  </span>

                  <button
                    type="button"
                    onClick={handleStartExam}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-secondary hover:text-white transition-all"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retake</span>
                  </button>
                </div>
              </div>

              {/* High-level stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-white/5 bg-slate-950 p-3">
                  <span className="text-[10px] font-bold uppercase text-faint block mb-0.5">
                    Percentile Rank
                  </span>
                  <span className="font-mono text-base font-black text-indigo-300">
                    {diagnosticReport.percentile}th %ile
                  </span>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950 p-3">
                  <span className="text-[10px] font-bold uppercase text-faint block mb-0.5">
                    Raw Accuracy
                  </span>
                  <span className="font-mono text-base font-black text-white">
                    {diagnosticReport.scorePercent}%
                  </span>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-950 p-3">
                  <span className="text-[10px] font-bold uppercase text-faint block mb-0.5">
                    Administered Items
                  </span>
                  <span className="font-mono text-base font-black text-white">
                    {administeredCount} Items
                  </span>
                </div>
              </div>

              {/* Bloom Taxonomy Breakdown */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-faint block">
                  Bloom Cognitive Taxonomy Performance
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
                  {(Object.keys(diagnosticReport.bloomBreakdown) as BloomCognitiveLevel[]).map(
                    (level) => {
                      const data = diagnosticReport.bloomBreakdown[level]
                      if (data.total === 0) return null
                      return (
                        <div
                          key={level}
                          className="rounded-xl border border-white/5 bg-slate-950 p-2.5 text-center"
                        >
                          <span className="text-[10px] font-bold uppercase text-faint block mb-1">
                            {level}
                          </span>
                          <span className="font-mono font-bold text-white">
                            {data.correct}/{data.total} ({data.accuracy}%)
                          </span>
                        </div>
                      )
                    },
                  )}
                </div>
              </div>

              {/* Summary note */}
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-secondary">
                {diagnosticReport.pedagogicalSummary}
              </div>
            </div>

            {/* SUCCESSIVE RELEARNING DRILL SECTION */}
            {diagnosticReport.missedItems.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/10 pb-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-status-warning-text" />
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      Successive Relearning Criterion Crucible (Rawson & Dunlosky 2011)
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-status-warning-text">
                      Criterion: 2 Consecutive Correct Recalls
                    </span>
                    <button
                      type="button"
                      onClick={handleExportRemedialCards}
                      className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-status-warning-text hover:bg-amber-500/20 transition-all shadow-sm"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export to FSRS Deck</span>
                    </button>
                  </div>
                </div>

                {relearningNotice && (
                  <p className="text-xs font-semibold text-status-success-text animate-fade-in">
                    {relearningNotice}
                  </p>
                )}

                {/* Active Relearning Item Card */}
                {activeRelearningItem ? (
                  <div className="rounded-xl border border-white/10 bg-slate-900/90 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-faint">
                        Pending Items: {pendingRelearning.length} | Consecutive Streaks:{' '}
                        {activeRelearningItem.criterionConsecutiveSuccesses}/
                        {activeRelearningItem.targetCriterion}
                      </span>
                      <span className="text-xs text-faint font-mono">
                        Difficulty b = {activeRelearningItem.questionItem.difficulty.toFixed(2)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-white leading-relaxed">
                      {activeRelearningItem.questionItem.prompt}
                    </p>

                    <div className="rounded-lg border border-white/5 bg-slate-950 p-3 text-xs text-slate-300 space-y-1">
                      <span className="font-bold text-status-success-text">Target Answer:</span>
                      <p>
                        {
                          activeRelearningItem.questionItem.options[
                            activeRelearningItem.questionItem.correctOptionIndex
                          ]
                        }
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleRelearningAttempt(false)}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-danger-text hover:bg-rose-500/20 transition-all"
                      >
                        Reset Streak (Incorrect)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelearningAttempt(true)}
                        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-status-success-text hover:bg-emerald-500/20 transition-all"
                      >
                        Correct Recall (+1 Streak)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-xs font-bold text-status-success-text">
                    <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-status-success-text" />
                    All missed items have achieved the Successive Relearning criterion!
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
