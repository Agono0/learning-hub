'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Brain,
  CheckCircle2,
  Download,
  Layers,
  Lightbulb,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react'
import {
  CALIBRATED_SCAFFOLDING_PROBLEMS,
  WorkedExampleSession,
  evaluateErroneousAttempt,
  evaluateSelfExplanation,
  exportStepToFSRS,
  getStepFadingStatus,
  type ErroneousEvaluationResult,
  type FadingStrategy,
  type MisconceptionCategory,
  type ScaffoldingStage,
  type SelfExplanationEvaluation,
  type WorkedExampleProblem,
} from '@learning-hub/core/scaffolding'
import { FadedScaffoldingHUD } from '../ui/FadedScaffoldingHUD'
import { getSharedAudioContext } from '../lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium, hapticWarning } from '../platform/haptics'

export type StudioTab = 'derivation' | 'self_explanation' | 'erroneous_crucible' | 'fsrs_export'

export interface WorkedExampleStudioProps {
  initialProblemId?: string
  initialStage?: ScaffoldingStage
  onExportCard?: (card: ReturnType<typeof exportStepToFSRS>) => void
  className?: string
}

export function WorkedExampleStudio({
  initialProblemId = 'raft_leader_election',
  initialStage = 2,
  onExportCard,
  className,
}: WorkedExampleStudioProps) {
  // Problem state
  const [selectedProblemId, setSelectedProblemId] = useState<string>(initialProblemId)
  const [activeTab, setActiveTab] = useState<StudioTab>('derivation')
  const [audioMuted, setAudioMuted] = useState(false)

  // Session state machine reference
  const sessionRef = useRef<WorkedExampleSession>(
    new WorkedExampleSession(selectedProblemId, initialStage, 0.0),
  )

  // Local mirror state for reactive re-renders
  const [sessionState, setSessionState] = useState(() => sessionRef.current.getState())
  const currentProblem = useMemo<WorkedExampleProblem>(
    () =>
      CALIBRATED_SCAFFOLDING_PROBLEMS[selectedProblemId] ||
      CALIBRATED_SCAFFOLDING_PROBLEMS.raft_leader_election!,
    [selectedProblemId],
  )

  // Step interaction state
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null)
  const [clozeInput, setClozeInput] = useState('')
  const [stepFeedback, setStepFeedback] = useState<string | null>(null)
  const [stepFeedbackIsCorrect, setStepFeedbackIsCorrect] = useState<boolean | null>(null)
  const [activeHint, setActiveHint] = useState<string | null>(null)

  // Self-Explanation lab state
  const [activePromptIndex, setActivePromptIndex] = useState(0)
  const [userExplanationText, setUserExplanationText] = useState('')
  const [selfExplanationResult, setSelfExplanationResult] =
    useState<SelfExplanationEvaluation | null>(null)

  // Erroneous crucible state
  const [activeErroneousIndex, setActiveErroneousIndex] = useState(0)
  const [selectedFlawedStep, setSelectedFlawedStep] = useState<number>(1)
  const [selectedMisconception, setSelectedMisconception] =
    useState<MisconceptionCategory>('invariant_violation')
  const [learnerRepairText, setLearnerRepairText] = useState('')
  const [erroneousResult, setErroneousResult] = useState<ErroneousEvaluationResult | null>(null)

  // Synthesize Web Audio Earcons
  const playAudioEarcon = useCallback(
    (type: 'success' | 'error' | 'milestone' | 'hint') => {
      if (audioMuted) return
      void getSharedAudioContext()
        .then((ctx) => {
          if (!ctx) return
          if (ctx.state === 'suspended') {
            void ctx.resume()
          }

          const now = ctx.currentTime
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)

          if (type === 'success') {
            osc.type = 'sine'
            osc.frequency.setValueAtTime(523.25, now) // C5
            osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12) // G5
            gain.gain.setValueAtTime(0.12, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            osc.start(now)
            osc.stop(now + 0.25)
          } else if (type === 'error') {
            osc.type = 'sawtooth'
            osc.frequency.setValueAtTime(220, now) // A3
            osc.frequency.exponentialRampToValueAtTime(146.83, now + 0.18) // D3
            gain.gain.setValueAtTime(0.14, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            osc.start(now)
            osc.stop(now + 0.25)
          } else if (type === 'milestone') {
            osc.type = 'triangle'
            osc.frequency.setValueAtTime(440, now) // A4
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.22) // A5
            gain.gain.setValueAtTime(0.15, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
            osc.start(now)
            osc.stop(now + 0.35)
          } else if (type === 'hint') {
            osc.type = 'sine'
            osc.frequency.setValueAtTime(329.63, now) // E4
            osc.frequency.exponentialRampToValueAtTime(440, now + 0.1) // A4
            gain.gain.setValueAtTime(0.09, now)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
            osc.start(now)
            osc.stop(now + 0.18)
          }
        })
        .catch(() => {
          // Ignore audio failures
        })
    },
    [audioMuted],
  )

  // Problem switcher
  const handleProblemChange = (problemId: string) => {
    setSelectedProblemId(problemId)
    sessionRef.current = new WorkedExampleSession(
      problemId,
      sessionState.stage,
      sessionState.learnerExpertise,
    )
    setSessionState(sessionRef.current.getState())
    setSelectedChoiceIndex(null)
    setClozeInput('')
    setStepFeedback(null)
    setActiveHint(null)
    setUserExplanationText('')
    setSelfExplanationResult(null)
    setLearnerRepairText('')
    setErroneousResult(null)
    hapticMedium()
  }

  // Stage switcher
  const handleStageChange = (newStage: ScaffoldingStage) => {
    sessionRef.current.setStage(newStage)
    setSessionState(sessionRef.current.getState())
    setStepFeedback(null)
    setActiveHint(null)
    hapticMedium()
    playAudioEarcon('hint')
  }

  // Strategy switcher
  const handleStrategyChange = (newStrategy: FadingStrategy) => {
    sessionRef.current.setStrategy(newStrategy)
    setSessionState(sessionRef.current.getState())
    hapticLight()
  }

  // Step submission
  const handleStepSubmit = () => {
    const activeStep = sessionRef.current.getCurrentStep()
    if (!activeStep) return

    let answer = ''
    if (activeStep.scaffoldOptions) {
      if (selectedChoiceIndex === null) return
      answer = selectedChoiceIndex.toString()
    } else if (activeStep.clozeTarget) {
      if (!clozeInput.trim()) return
      answer = clozeInput.trim()
    } else {
      answer = clozeInput.trim()
    }

    const result = sessionRef.current.evaluateCurrentStepAnswer(answer)
    setStepFeedback(result.feedback)
    setStepFeedbackIsCorrect(result.isCorrect)

    if (result.isCorrect) {
      playAudioEarcon('success')
      hapticLight()
      setSelectedChoiceIndex(null)
      setClozeInput('')
      setActiveHint(null)
      if (sessionRef.current.getState().isCompleted) {
        playAudioEarcon('milestone')
        hapticHeavy()
      }
    } else {
      playAudioEarcon('error')
      hapticWarning()
    }

    setSessionState(sessionRef.current.getState())
  }

  // Hint button
  const handleRequestHint = () => {
    const hint = sessionRef.current.useHint()
    setActiveHint(hint)
    playAudioEarcon('hint')
    hapticLight()
    setSessionState(sessionRef.current.getState())
  }

  // Reset problem session
  const handleResetSession = () => {
    sessionRef.current = new WorkedExampleSession(
      selectedProblemId,
      sessionState.stage,
      sessionState.learnerExpertise,
    )
    setSessionState(sessionRef.current.getState())
    setSelectedChoiceIndex(null)
    setClozeInput('')
    setStepFeedback(null)
    setActiveHint(null)
    hapticMedium()
  }

  // Self-Explanation submission
  const handleEvaluateExplanation = () => {
    const prompt = currentProblem.selfExplanationPrompts[activePromptIndex]
    if (!prompt || !userExplanationText.trim()) return

    const result = evaluateSelfExplanation({
      userExplanation: userExplanationText,
      prompt,
    })

    setSelfExplanationResult(result)
    sessionRef.current.recordSelfExplanationScore(prompt.id, result.score)
    setSessionState(sessionRef.current.getState())

    if (result.score >= 0.75) {
      playAudioEarcon('success')
      hapticMedium()
    } else {
      playAudioEarcon('hint')
      hapticLight()
    }
  }

  // Erroneous crucible submission
  const handleEvaluateErroneous = () => {
    const variant = currentProblem.erroneousVariants[activeErroneousIndex]
    if (!variant || !learnerRepairText.trim()) return

    const result = evaluateErroneousAttempt({
      selectedStepIndex: selectedFlawedStep,
      selectedMisconception,
      learnerRepairText,
      erroneousVariant: variant,
    })

    setErroneousResult(result)
    if (result.compositeScore >= 0.7) {
      playAudioEarcon('success')
      hapticHeavy()
    } else {
      playAudioEarcon('error')
      hapticWarning()
    }
  }

  // Flashcard export
  const handleExportFlashcard = (stepIndex: number) => {
    const card = exportStepToFSRS({
      problem: currentProblem,
      stepIndex,
      stage: sessionState.stage,
    })

    if (onExportCard) {
      onExportCard(card)
    }

    // Trigger synthetic download of JSON card
    const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fsrs-scaffold-${currentProblem.id}-step-${stepIndex}.json`
    a.click()
    URL.revokeObjectURL(url)

    playAudioEarcon('milestone')
    hapticLight()
  }

  return (
    <div className={`flex flex-col gap-6 ${className || ''}`}>
      {/* Top Controls & Problem Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-faint">
            Calibrated Problem:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(CALIBRATED_SCAFFOLDING_PROBLEMS).map((p) => {
              const isSelected = p.id === selectedProblemId
              return (
                <button
                  key={p.id}
                  onClick={() => handleProblemChange(p.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-white/5 text-secondary hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {p.title.split(' ')[0]} ({p.domain.replace('_', ' ')})
                </button>
              )
            })}
          </div>
        </div>

        {/* Audio Mute & Reset */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAudioMuted(!audioMuted)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-faint hover:bg-white/10 hover:text-white transition-all"
            title={audioMuted ? 'Unmute Earcons' : 'Mute Earcons'}
            aria-label={audioMuted ? 'Unmute audio feedback' : 'Mute audio feedback'}
          >
            {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            onClick={handleResetSession}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-white/10 hover:text-white transition-all"
            title="Reset Derivation Progression"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Cognitive Load Telemetry HUD */}
      <FadedScaffoldingHUD
        stage={sessionState.stage}
        strategy={sessionState.strategy}
        cognitiveLoad={sessionState.cognitiveLoad}
        elementInteractivity={currentProblem.elementInteractivity}
        domain={currentProblem.domain}
        problemTitle={currentProblem.title}
        activeStepIndex={sessionState.currentStepIndex}
        totalSteps={currentProblem.steps.length}
        onStageChange={handleStageChange}
        onStrategyChange={handleStrategyChange}
      />

      {/* Tab Navigation */}
      <div className="flex border-b border-white/10 text-xs font-bold">
        <button
          onClick={() => {
            setActiveTab('derivation')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'derivation'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Derivation & Scaffolding Canvas</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('self_explanation')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'self_explanation'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Brain className="h-4 w-4" />
          <span>Self-Explanation Lab (Chi 1989)</span>
          {Object.keys(sessionState.selfExplanationScores).length > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-status-success-text font-bold">
              {Object.keys(sessionState.selfExplanationScores).length} done
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('erroneous_crucible')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'erroneous_crucible'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="h-4 w-4 text-status-warning-text" />
          <span>Erroneous Example Crucible (Große 2007)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('fsrs_export')
            hapticLight()
          }}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition-all ${
            activeTab === 'fsrs_export'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-faint hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-4 w-4 text-status-success-text" />
          <span>FSRS Flashcard Bridge</span>
        </button>
      </div>

      {/* Tab 1: Derivation & Scaffolding Canvas */}
      {activeTab === 'derivation' && (
        <div className="flex flex-col gap-5">
          {/* Problem Statement Card */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">
              Problem Statement
            </span>
            <p className="text-sm font-medium text-slate-200 leading-relaxed">
              {currentProblem.problemStatement}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-faint">
              <span className="font-semibold text-tertiary">Prerequisites:</span>
              {currentProblem.prerequisites.map((pre, idx) => (
                <span
                  key={idx}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-secondary"
                >
                  {pre}
                </span>
              ))}
            </div>
          </div>

          {/* Derivation Steps List */}
          <div className="flex flex-col gap-4">
            {currentProblem.steps.map((step) => {
              const status = getStepFadingStatus({
                step,
                totalSteps: currentProblem.steps.length,
                stage: sessionState.stage,
                strategy: sessionState.strategy,
              })

              const isCompleted = sessionState.completedStepIds.includes(step.id)
              const isCurrent = step.stepIndex === sessionState.currentStepIndex
              const isFuture = step.stepIndex > sessionState.currentStepIndex

              return (
                <div
                  key={step.id}
                  className={`relative overflow-hidden rounded-2xl border transition-all ${
                    isCurrent
                      ? 'border-indigo-500 bg-slate-900/90 shadow-xl shadow-indigo-500/10'
                      : isCompleted
                        ? 'border-emerald-500/40 bg-slate-950/70'
                        : 'border-white/5 bg-slate-950/40 opacity-70'
                  }`}
                >
                  {/* Step Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3 bg-white/[0.02]">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-status-success-text border border-emerald-500/30'
                            : isCurrent
                              ? 'bg-indigo-500 text-white'
                              : 'bg-white/10 text-faint'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.stepIndex}
                      </span>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-faint block">
                          Sub-Goal Chunk
                        </span>
                        <h4 className="text-xs font-bold text-white">{step.subgoalLabel}</h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                        {step.governingPrinciple}
                      </span>
                      {/* One-click Export to FSRS */}
                      <button
                        onClick={() => handleExportFlashcard(step.stepIndex)}
                        className="rounded-lg border border-white/10 bg-white/5 p-1 text-faint hover:bg-white/10 hover:text-white transition-all"
                        title="Export Step to FSRS Spaced Repetition Card"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-status-success-text" />
                      </button>
                    </div>
                  </div>

                  {/* Step Content */}
                  <div className="p-5">
                    {/* Read-Only Mode (Stage 1 or already completed step) */}
                    {status.promptType === 'read_only' ||
                    isCompleted ||
                    (!isCurrent && !isFuture) ? (
                      <div className="flex flex-col gap-3">
                        <div className="rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-sm font-bold text-status-success-text overflow-x-auto">
                          <code>{step.content}</code>
                        </div>
                        <p className="text-xs text-secondary leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                          <strong>Theoretical Justification:</strong> {step.explanation}
                        </p>
                      </div>
                    ) : null}

                    {/* Faded Completion Interactive Mode (Active Step) */}
                    {status.isOmitted && isCurrent && !isCompleted ? (
                      <div className="flex flex-col gap-4">
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                          <strong>Scaffolded Task:</strong> Complete this derivation step using the
                          governing principle (<em>{step.governingPrinciple}</em>).
                        </div>

                        {/* Multiple Choice Fading Option */}
                        {step.scaffoldOptions ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-secondary">
                              Select the mathematically sound derivation formulation:
                            </span>
                            {step.scaffoldOptions.map((opt, optIdx) => {
                              const isSelected = selectedChoiceIndex === optIdx
                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => setSelectedChoiceIndex(optIdx)}
                                  className={`flex items-start gap-3 rounded-xl border p-3 text-left font-mono text-xs transition-all ${
                                    isSelected
                                      ? 'border-indigo-500 bg-indigo-500/20 text-white font-bold shadow-md shadow-indigo-500/20'
                                      : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/5 hover:text-white'
                                  }`}
                                >
                                  <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                      isSelected
                                        ? 'bg-indigo-500 text-white'
                                        : 'bg-white/10 text-faint'
                                    }`}
                                  >
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span className="break-all">{opt}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : null}

                        {/* Cloze Deletion / Free Generation Fading Option */}
                        {step.clozeTarget ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-secondary">
                              Fill in the missing target variable / expression:
                            </span>
                            <div className="rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-xs text-slate-200">
                              {step.clozeTemplate ? (
                                <span>{step.clozeTemplate.replace('{{target}}', '________')}</span>
                              ) : (
                                <span>Derive step target:</span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={clozeInput}
                              onChange={(e) => setClozeInput(e.target.value)}
                              placeholder={`Enter target (e.g. "${step.clozeTarget}")...`}
                              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                        ) : null}

                        {/* Hint Display */}
                        {activeHint && (
                          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-300 flex items-start gap-2">
                            <Lightbulb className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
                            <span>{activeHint}</span>
                          </div>
                        )}

                        {/* Feedback Banner */}
                        {stepFeedback && (
                          <div
                            className={`rounded-xl border p-3 text-xs font-semibold flex items-center gap-2 ${
                              stepFeedbackIsCorrect
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-status-success-text'
                                : 'border-rose-500/40 bg-rose-500/15 text-danger-text'
                            }`}
                          >
                            {stepFeedbackIsCorrect ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-text" />
                            ) : (
                              <XCircle className="h-4 w-4 shrink-0 text-danger-text" />
                            )}
                            <span>{stepFeedback}</span>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between gap-3 pt-2">
                          <button
                            onClick={handleRequestHint}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-secondary hover:bg-white/10 hover:text-white transition-all"
                          >
                            <Lightbulb className="h-3.5 w-3.5 text-status-warning-text" />
                            <span>Request Hint ({2 - sessionState.hintsUsed} remaining)</span>
                          </button>

                          <button
                            onClick={handleStepSubmit}
                            disabled={
                              step.scaffoldOptions
                                ? selectedChoiceIndex === null
                                : !clozeInput.trim()
                            }
                            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            <span>Verify Step</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Locked Future Step Indicator */}
                    {isFuture && !isCompleted && !isCurrent ? (
                      <div className="flex items-center gap-2 text-xs text-tertiary py-1">
                        <Layers className="h-3.5 w-3.5" />
                        <span>
                          Step locked until Step {sessionState.currentStepIndex} is verified.
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Completion Celebration Banner */}
          {sessionState.isCompleted && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-6 text-center backdrop-blur-md">
              <Award className="mx-auto h-12 w-12 text-status-success-text mb-2 animate-bounce" />
              <h3 className="text-base font-black text-white">Derivation Successfully Mastered!</h3>
              <p className="text-xs text-secondary max-w-lg mx-auto mt-1">
                You progressed through the Renkl-Atkinson scaffolding continuum, internalized the
                governing theoretical invariants, and maintained working memory capacity balance.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={() => setActiveTab('self_explanation')}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
                >
                  Proceed to Self-Explanation Lab
                </button>
                <button
                  onClick={() => setActiveTab('fsrs_export')}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 transition-all"
                >
                  Export All Steps to FSRS Deck
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Self-Explanation Lab (Chi et al. 1989) */}
      {activeTab === 'self_explanation' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">
              Chi et al. (1989) Principle-Based Self-Explanation
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              Self-explaining worked examples stimulates germane cognitive load by forcing the
              active generation of domain inferences, linking surface mathematical moves to deep
              structural invariants.
            </p>
          </div>

          {/* Prompt Selector */}
          <div className="flex gap-2">
            {currentProblem.selfExplanationPrompts.map((p, pIdx) => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePromptIndex(pIdx)
                  setUserExplanationText('')
                  setSelfExplanationResult(null)
                  hapticLight()
                }}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  activePromptIndex === pIdx
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                }`}
              >
                Prompt #{pIdx + 1} ({p.promptType.replace('_', ' ')})
              </button>
            ))}
          </div>

          {/* Prompt Card */}
          {currentProblem.selfExplanationPrompts[activePromptIndex] && (
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/90 p-5">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-bold text-white">
                  {currentProblem.selfExplanationPrompts[activePromptIndex].promptText}
                </h4>
                <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                  Target: Step{' '}
                  {currentProblem.selfExplanationPrompts[activePromptIndex].targetStepIndex}
                </span>
              </div>

              {/* Guiding Rubric Hints */}
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3 text-xs text-tertiary">
                <span className="font-semibold text-secondary block mb-1">
                  Required Rubric Coverage:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {currentProblem.selfExplanationPrompts[activePromptIndex].guidingRubric.map(
                    (r, rIdx) => (
                      <li key={rIdx}>{r}</li>
                    ),
                  )}
                </ul>
              </div>

              {/* Text Input Area */}
              <textarea
                value={userExplanationText}
                onChange={(e) => setUserExplanationText(e.target.value)}
                placeholder="Type your deep principle-based explanation here (e.g. articulate why the Pigeonhole Principle or Bellman Principle of Optimality guarantees this transition)..."
                rows={5}
                className="w-full rounded-xl border border-white/10 bg-slate-950 p-4 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />

              {/* Evaluation Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleEvaluateExplanation}
                  disabled={!userExplanationText.trim()}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Evaluate Self-Explanation</span>
                </button>
              </div>

              {/* Evaluation Results */}
              {selfExplanationResult && (
                <div className="mt-2 flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/80 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      Rigor Score: {Math.round(selfExplanationResult.score * 100)}%
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                        selfExplanationResult.score >= 0.75
                          ? 'bg-emerald-500/20 text-status-success-text'
                          : 'bg-amber-500/20 text-status-warning-text'
                      }`}
                    >
                      Keyword Coverage: {Math.round(selfExplanationResult.keywordCoverage * 100)}%
                    </span>
                  </div>

                  <p className="text-xs text-secondary">
                    {selfExplanationResult.constructiveFeedback}
                  </p>

                  {/* Exemplar Comparison */}
                  <div className="rounded-lg border border-white/5 bg-slate-900 p-3 text-xs text-tertiary">
                    <span className="font-semibold text-indigo-400 block mb-1">
                      Canonical Exemplar Comparison:
                    </span>
                    <p className="italic text-secondary">
                      {selfExplanationResult.exemplarComparison}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Erroneous Example Crucible (Große & Renkl 2007) */}
      {activeTab === 'erroneous_crucible' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-status-warning-text block mb-1">
              Große & Renkl (2007) Erroneous Example Diagnostic Lab
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              Research demonstrates that debugging incorrect examples combined with correct examples
              fosters deep conceptual schemas and inoculates against negative transfer.
            </p>
          </div>

          {/* Variant Selector */}
          {currentProblem.erroneousVariants.length > 1 && (
            <div className="flex gap-2">
              {currentProblem.erroneousVariants.map((v, vIdx) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setActiveErroneousIndex(vIdx)
                    setSelectedFlawedStep(1)
                    setLearnerRepairText('')
                    setErroneousResult(null)
                    hapticLight()
                  }}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    activeErroneousIndex === vIdx
                      ? 'bg-amber-600 text-white'
                      : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Flawed Case #{vIdx + 1}
                </button>
              ))}
            </div>
          )}

          {currentProblem.erroneousVariants[activeErroneousIndex] && (
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/90 p-5">
              <h4 className="text-xs font-bold text-secondary">
                A flawed proof variant was introduced. Pinpoint the flawed step and classify the
                root misconception:
              </h4>

              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 font-mono text-xs text-danger-text">
                <code>{currentProblem.erroneousVariants[activeErroneousIndex].flawedContent}</code>
              </div>

              {/* Step Selection */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-faint">
                  Which step contains the flaw?
                </span>
                {currentProblem.steps.map((st) => (
                  <button
                    key={st.stepIndex}
                    onClick={() => setSelectedFlawedStep(st.stepIndex)}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                      selectedFlawedStep === st.stepIndex
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    Step {st.stepIndex}
                  </button>
                ))}
              </div>

              {/* Misconception Category Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-faint">Misconception Category:</span>
                {(
                  [
                    'invariant_violation',
                    'boundary_edge_case',
                    'premature_optimization',
                    'flawed_induction',
                    'concurrency_race',
                    'fallacious_assumption',
                  ] as MisconceptionCategory[]
                ).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedMisconception(cat)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                      selectedMisconception === cat
                        ? 'bg-amber-600 text-white'
                        : 'bg-white/5 text-faint hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Corrective Repair Formulation */}
              <textarea
                value={learnerRepairText}
                onChange={(e) => setLearnerRepairText(e.target.value)}
                placeholder="State the mathematical / logical repair to restore proof validity..."
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />

              <div className="flex justify-end">
                <button
                  onClick={handleEvaluateErroneous}
                  disabled={!learnerRepairText.trim()}
                  className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-500 disabled:opacity-50 transition-all"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Diagnose Misconception</span>
                </button>
              </div>

              {/* Erroneous Diagnostic Result */}
              {erroneousResult && (
                <div className="rounded-xl border border-white/10 bg-slate-950/80 p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      Diagnostic Rigor: {Math.round(erroneousResult.compositeScore * 100)}%
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                        erroneousResult.compositeScore >= 0.7
                          ? 'bg-emerald-500/20 text-status-success-text'
                          : 'bg-rose-500/20 text-danger-text'
                      }`}
                    >
                      {erroneousResult.isStepIdentifiedCorrectly &&
                      erroneousResult.isMisconceptionIdentifiedCorrectly
                        ? 'Category & Step Spot-On'
                        : 'Diagnosis Needed Adjustment'}
                    </span>
                  </div>
                  <p className="text-xs text-secondary">{erroneousResult.diagnosticSummary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: FSRS Spaced Repetition Bridge */}
      {activeTab === 'fsrs_export' && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-status-success-text block mb-1">
              FSRS v5 Spaced Repetition Flashcard Bridge
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              Export each faded step into high-yield active recall flashcards. Cards feature
              sub-goal chunking, theoretical justifications, and custom tags for long-term
              retention.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentProblem.steps.map((step) => {
              const card = exportStepToFSRS({
                problem: currentProblem,
                stepIndex: step.stepIndex,
                stage: sessionState.stage,
              })

              return (
                <div
                  key={step.id}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">
                        Step {step.stepIndex} • {step.subgoalLabel}
                      </span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-secondary font-mono">
                        Diff: {card.suggestedDifficulty}/10
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-slate-950/80 p-3 text-xs text-slate-300">
                      <strong>Card Front:</strong>
                      <p className="mt-1 text-[11px] text-faint line-clamp-3">{card.front}</p>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-slate-950/80 p-3 text-xs text-slate-300">
                      <strong>Card Back:</strong>
                      <p className="mt-1 text-[11px] text-status-success-text/90 line-clamp-3">
                        {card.back}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/5">
                    <div className="flex gap-1">
                      {card.tags.map((t, tIdx) => (
                        <span key={tIdx} className="text-[10px] text-tertiary">
                          #{t}
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={() => handleExportFlashcard(step.stepIndex)}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-500 transition-all"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export Card</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
