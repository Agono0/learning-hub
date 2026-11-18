'use client'

/**
 * @file MetacognitionStudio.tsx
 * @description Dynamic Self-Regulated Metacognitive Calibration & Hypercorrection Studio.
 *
 * Implements:
 * - Nelson & Narens (1990) Multi-Level Metacognitive Architecture
 * - Butterfield & Metcalfe (2001, 2006) Hypercorrection Effect
 * - Murphy (1973) Brier Partitioning & 5-Bin Calibration Curve
 * - FSRS Spaced Repetition Hypercorrection Bridge
 */

import React, { useMemo, useState } from 'react'
import {
  CrucibleOption,
  EPISTEMIC_CRUCIBLE_PROBLEMS,
  exportHypercorrectionToFSRSCards,
  HypercorrectionSession,
} from '@learning-hub/core/metacognition'
import { MetacognitiveCalibrationHUD, Badge, Button, Panel, ProgressBar, Markdown } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticMedium, hapticLight } from '../platform/haptics'
import {
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  Flame,
  Layers,
  RotateCcw,
  Sparkles,
  Target,
  XCircle,
  Zap,
} from 'lucide-react'

export interface MetacognitionStudioProps {
  initialProblemBank?: typeof EPISTEMIC_CRUCIBLE_PROBLEMS
  onExportCards?: (cards: ReturnType<typeof exportHypercorrectionToFSRSCards>) => void
}

type StudioTab = 'crucible' | 'calibration_curve' | 'hypercorrection_lab' | 'fsrs_cards'

export function MetacognitionStudio({
  initialProblemBank = EPISTEMIC_CRUCIBLE_PROBLEMS,
  onExportCards,
}: MetacognitionStudioProps) {
  const [session, setSession] = useState(() => new HypercorrectionSession(initialProblemBank))
  const [activeTab, setActiveTab] = useState<StudioTab>('crucible')

  // Slider state
  const [prospectiveJOL, setProspectiveJOL] = useState<number>(0.7)
  const [retrospectiveConfidence, setRetrospectiveConfidence] = useState<number>(0.8)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [exportedSuccess, setExportedSuccess] = useState<boolean>(false)

  // Feedback display state
  const [lastFeedback, setLastFeedback] = useState<{
    isCorrect: boolean
    isHypercorrection: boolean
    surpriseScore: number
    explanation: string
  } | null>(null)

  const state = session.getState()
  const currentProblem = session.getCurrentProblem()
  const profile = state.profile
  const isPhaseProspective = state.phase === 'prospective_jol'
  const isPhaseOption = state.phase === 'option_selection'
  const isPhaseConfidence = state.phase === 'confidence_rating'
  const isPhaseFeedback = state.phase === 'feedback_deconstruction'

  // Generated FSRS Cards
  const generatedCards = useMemo(() => {
    return exportHypercorrectionToFSRSCards(state.trials, initialProblemBank)
  }, [state.trials, initialProblemBank])

  // Play audio acoustic cues
  const playTone = (isCorrect: boolean, isHyper: boolean) => {
    void getSharedAudioContext()
      .then((ctx) => {
        if (!ctx) return
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        if (isCorrect) {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(523.25, now) // C5
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1) // E5
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.25)
        } else if (isHyper) {
          // Intense dissonance indicating Epistemic Surprise
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(440, now) // A4
          osc.frequency.linearRampToValueAtTime(220, now + 0.15) // A3 drop
          gain.gain.setValueAtTime(0.2, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
          osc.start(now)
          osc.stop(now + 0.3)
        } else {
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(300, now)
          gain.gain.setValueAtTime(0.12, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
          osc.start(now)
          osc.stop(now + 0.2)
        }
      })
      .catch(() => {})
  }

  // 1. Submit Prospective JOL
  const handleProspectiveSubmit = () => {
    hapticMedium()
    session.submitProspectiveJOL(prospectiveJOL)
    setSession(new HypercorrectionSession(initialProblemBank))
    // We recreate session wrapper or update state cleanly
    session.submitProspectiveJOL(prospectiveJOL)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // 2. Select Option
  const handleOptionSelect = (optionId: string) => {
    hapticMedium()
    setSelectedOptionId(optionId)
    session.selectOption(optionId)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // 3. Submit Confidence & Grade
  const handleConfidenceSubmit = () => {
    const res = session.submitRetrospectiveConfidence(retrospectiveConfidence)
    setLastFeedback({
      isCorrect: res.record.isCorrect,
      isHypercorrection: res.isHypercorrection,
      surpriseScore: res.epistemicSurpriseScore,
      explanation: res.explanation,
    })

    if (res.isHypercorrection) {
      hapticHeavy()
      playTone(false, true)
    } else if (res.record.isCorrect) {
      hapticLight()
      playTone(true, false)
    } else {
      hapticMedium()
      playTone(false, false)
    }

    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // 4. Advance to Next Problem
  const handleNextProblem = () => {
    hapticMedium()
    const advanced = session.advanceToNextProblem()
    setSelectedOptionId(null)
    setProspectiveJOL(0.7)
    setRetrospectiveConfidence(0.8)
    setLastFeedback(null)
    if (!advanced) {
      // Completed all questions in the crucible bank
      setActiveTab('calibration_curve')
    }
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Restart Crucible
  const handleRestart = () => {
    hapticMedium()
    setSession(new HypercorrectionSession(initialProblemBank))
    setSelectedOptionId(null)
    setProspectiveJOL(0.7)
    setRetrospectiveConfidence(0.8)
    setLastFeedback(null)
    setActiveTab('crucible')
  }

  // Handle Export Cards
  const handleExport = () => {
    hapticLight()
    if (onExportCards) {
      onExportCards(generatedCards)
    }
    setExportedSuccess(true)
    setTimeout(() => setExportedSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      {/* Real-Time Metacognitive Calibration HUD */}
      <MetacognitiveCalibrationHUD
        profile={profile}
        lastEpistemicSurpriseScore={lastFeedback?.surpriseScore ?? 0}
        isHypercorrectionTriggered={lastFeedback?.isHypercorrection ?? false}
        currentIllusion={state.trials[state.trials.length - 1]?.detectedIllusion}
      />

      {/* Workspace Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('crucible')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'crucible'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-neutral-100/50 dark:bg-(--hub-panel-2)/50 text-tertiary bg-neutral-100 dark:bg-(--hub-panel-2) hover:text-strong'
            }`}
          >
            <Target className="h-4 w-4" />
            <span>Epistemic Crucible</span>
            <Badge tone="neutral" className="ml-1 px-1.5 py-0 text-[10px]">
              {state.currentProblemIndex + 1}/{state.problemIds.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calibration_curve')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'calibration_curve'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-neutral-100/50 dark:bg-(--hub-panel-2)/50 text-tertiary bg-neutral-100 dark:bg-(--hub-panel-2) hover:text-strong'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Calibration Curve</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hypercorrection_lab')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'hypercorrection_lab'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-neutral-100/50 dark:bg-(--hub-panel-2)/50 text-tertiary bg-neutral-100 dark:bg-(--hub-panel-2) hover:text-strong'
            }`}
          >
            <Flame className="h-4 w-4 text-status-warning-text" />
            <span>Hypercorrection Lab</span>
            {profile.hypercorrectionCount > 0 && (
              <Badge tone="warning" className="ml-1 px-1.5 py-0 text-[10px]">
                {profile.hypercorrectionCount}
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fsrs_cards')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'fsrs_cards'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-neutral-100/50 dark:bg-(--hub-panel-2)/50 text-tertiary bg-neutral-100 dark:bg-(--hub-panel-2) hover:text-strong'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>FSRS Flashcards</span>
            {generatedCards.length > 0 && (
              <Badge tone="neutral" className="ml-1 px-1.5 py-0 text-[10px]">
                {generatedCards.length}
              </Badge>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={handleRestart}
          className="flex items-center gap-1.5 rounded-xl border border-neutral-200/60 dark:border-(--hub-border)/60 bg-white/60 dark:bg-(--hub-panel)/60 px-3 py-1.5 text-xs text-tertiary hover:text-strong transition-all"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Session</span>
        </button>
      </div>

      {/* TAB 1: Epistemic Crucible Interactive Trial */}
      {activeTab === 'crucible' && currentProblem && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200/50 dark:border-(--hub-border)/50 pb-3">
              <div className="flex items-center gap-2">
                <Badge tone="neutral" className="capitalize">
                  {currentProblem.domain.replace('_', ' ')}
                </Badge>
                <h4 className="text-base font-semibold text-strong">{currentProblem.title}</h4>
              </div>
              <div className="text-xs text-tertiary">
                Question {state.currentProblemIndex + 1} of {state.problemIds.length}
              </div>
            </div>

            {/* Problem Stem */}
            <div className="text-sm font-medium leading-relaxed text-strong">
              {currentProblem.stem}
            </div>

            {/* STEP 1: Prospective JOL Slider */}
            {isPhaseProspective && (
              <div className="mt-4 rounded-xl border border-(--ac-strong)/20 bg-indigo-600/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-ac-text">
                    <Brain className="h-4 w-4" />
                    <span>Prospective Judgment of Learning (Nelson & Narens 1990)</span>
                  </div>
                  <span className="text-sm font-bold text-strong">
                    {Math.round(prospectiveJOL * 100)}%
                  </span>
                </div>
                <p className="text-xs text-tertiary">
                  Before inspecting the options, estimate your probability of knowing the precise
                  scientific mechanism:
                </p>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={prospectiveJOL}
                  onChange={(e) => setProspectiveJOL(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-tertiary">
                  <span>0% (No Idea)</span>
                  <span>50% (Unsure)</span>
                  <span>100% (Certain)</span>
                </div>
                <Button variant="primary" onClick={handleProspectiveSubmit} className="w-full mt-2">
                  Reveal Options & Test Hypothesis
                </Button>
              </div>
            )}

            {/* STEP 2: Options Selection */}
            {(isPhaseOption || isPhaseConfidence || isPhaseFeedback) && (
              <div className="space-y-2.5 pt-2">
                <div className="text-xs font-semibold text-tertiary">
                  Select your theoretical conclusion:
                </div>
                <div className="space-y-2">
                  {currentProblem.options.map((opt: CrucibleOption) => {
                    const isSelected = selectedOptionId === opt.id
                    const isRevealed = isPhaseFeedback
                    const isCorrect = opt.isCorrect

                    let optionBorder =
                      'border-neutral-200/70 dark:border-(--hub-border)/70 border-neutral-200 dark:border-(--hub-border)'
                    const optionBg = 'bg-white/70 dark:bg-(--hub-panel)/70'

                    if (isRevealed) {
                      if (isCorrect) {
                        optionBorder =
                          'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                      } else if (isSelected) {
                        optionBorder =
                          'border-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-200'
                      }
                    } else if (isSelected) {
                      optionBorder =
                        'border-(--ac-strong) bg-indigo-600/10 text-strong ring-1 ring-(--ac-strong)'
                    }

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isPhaseFeedback}
                        onClick={() => handleOptionSelect(opt.id)}
                        className={`w-full text-left rounded-lg border p-3 text-xs transition-all ${optionBorder} ${optionBg}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 shrink-0">
                            {isRevealed && isCorrect && (
                              <CheckCircle2 className="h-4 w-4 text-status-success-text" />
                            )}
                            {isRevealed && isSelected && !isCorrect && (
                              <XCircle className="h-4 w-4 text-danger-text" />
                            )}
                            {(!isRevealed || (!isCorrect && !isSelected)) && (
                              <div
                                className={`h-4 w-4 rounded-full border ${
                                  isSelected
                                    ? 'border-(--ac-strong) bg-indigo-600'
                                    : 'border-neutral-300/60 dark:border-(--hub-border)/60'
                                }`}
                              />
                            )}
                          </div>
                          <span className="flex-1 leading-relaxed">{opt.text}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* STEP 3: Retrospective Confidence Rating */}
            {isPhaseConfidence && selectedOptionId && (
              <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-status-info-text dark:text-status-info-text">
                    <Sparkles className="h-4 w-4" />
                    <span>Retrospective Confidence Judgment (RCJ)</span>
                  </div>
                  <span className="text-sm font-bold text-strong">
                    {Math.round(retrospectiveConfidence * 100)}%
                  </span>
                </div>
                <p className="text-xs text-tertiary">
                  How confident are you in this specific response? (Scores ≥ 70% with an error
                  trigger the Butterfield Hypercorrection Effect)
                </p>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={retrospectiveConfidence}
                  onChange={(e) => setRetrospectiveConfidence(parseFloat(e.target.value))}
                  className="w-full accent-sky-500"
                />
                <div className="flex justify-between text-[10px] text-tertiary">
                  <button
                    type="button"
                    onClick={() => setRetrospectiveConfidence(0.25)}
                    className="hover:underline"
                  >
                    25% (Guess)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetrospectiveConfidence(0.5)}
                    className="hover:underline"
                  >
                    50% (Toss-up)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetrospectiveConfidence(0.75)}
                    className="hover:underline"
                  >
                    75% (Confident)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetrospectiveConfidence(0.95)}
                    className="hover:underline"
                  >
                    95% (Certain)
                  </button>
                </div>
                <Button variant="primary" onClick={handleConfidenceSubmit} className="w-full mt-2">
                  Submit & Evaluate Cognitive Calibration
                </Button>
              </div>
            )}

            {/* STEP 4: Feedback & Epistemic Deconstruction */}
            {isPhaseFeedback && lastFeedback && (
              <div className="mt-4 space-y-4 rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-white/80 dark:bg-(--hub-panel)/80 p-4">
                {/* Result Banner */}
                <div
                  className={`flex items-center gap-3 rounded-lg p-3 text-xs font-medium ${
                    lastFeedback.isCorrect
                      ? 'bg-emerald-500/10 text-emerald-800 dark:text-status-success-text'
                      : lastFeedback.isHypercorrection
                        ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/40'
                        : 'bg-rose-500/10 text-rose-800 dark:text-danger-text'
                  }`}
                >
                  {lastFeedback.isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-status-success-text shrink-0" />
                  ) : lastFeedback.isHypercorrection ? (
                    <Zap className="h-5 w-5 text-status-warning-text shrink-0 fill-amber-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-danger-text shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">
                      {lastFeedback.isCorrect
                        ? 'Accurate Metacognitive Affirmation'
                        : lastFeedback.isHypercorrection
                          ? 'Hypercorrection Event: High-Confidence Epistemic Prediction Error!'
                          : 'Incorrect Intuition'}
                    </div>
                    <div className="text-[11px] opacity-90">
                      Reported Confidence: {Math.round(retrospectiveConfidence * 100)}% | Epistemic
                      Surprise: {Math.round(lastFeedback.surpriseScore * 100)}%
                    </div>
                  </div>
                </div>

                {/* Canonical Scientific Reality */}
                <div className="space-y-1">
                  <div className="text-xs font-bold text-strong">
                    Canonical Scientific Explanation:
                  </div>
                  <div className="text-xs text-tertiary leading-relaxed">
                    <Markdown>{currentProblem.canonicalScientificExplanation}</Markdown>
                  </div>
                </div>

                {/* Counter-Evidence & Proof */}
                <div className="space-y-1 rounded-lg border border-neutral-200/50 dark:border-(--hub-border)/50 bg-white/40 dark:bg-(--hub-panel)/40 p-3">
                  <div className="text-xs font-semibold text-ac-text">
                    Empirical Proof & Counter-Evidence:
                  </div>
                  <div className="text-xs text-tertiary leading-relaxed">
                    {currentProblem.counterEvidence}
                  </div>
                </div>

                {/* Sub-Goal Chunking Derivation */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-strong">
                    Sub-Goal Chunking Derivation (Catrambone 1998):
                  </div>
                  <div className="space-y-1">
                    {currentProblem.subGoalChunking.map((step: string, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 rounded border border-neutral-200/40 dark:border-(--hub-border)/40 bg-white/50 dark:bg-(--hub-panel)/50 p-2 text-xs text-tertiary"
                      >
                        <span className="font-semibold text-ac-text shrink-0">{idx + 1}.</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Next Problem Button */}
                <Button
                  variant="primary"
                  onClick={handleNextProblem}
                  className="w-full flex items-center justify-center gap-1.5"
                >
                  <span>Advance to Next Problem</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 2: Calibration Curve & Reliability Diagram */}
      {activeTab === 'calibration_curve' && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200/50 dark:border-(--hub-border)/50 pb-3">
              <div>
                <h4 className="text-base font-semibold text-strong">
                  5-Bin Calibration Curve & Reliability Partition
                </h4>
                <p className="text-xs text-tertiary">
                  Murphy (1973) Brier Partition: Reliability (Error) vs Resolution (Discrimination)
                </p>
              </div>
              <Badge tone="neutral">
                {profile.sampleSize} Trial{profile.sampleSize !== 1 ? 's' : ''} Analyzed
              </Badge>
            </div>

            {/* Bins Table & Progress Bars */}
            <div className="space-y-3">
              {profile.calibrationBins.map((bin) => {
                const confPercent = Math.round(bin.meanConfidence * 100)
                const accPercent = Math.round(bin.meanAccuracy * 100)
                const isOverconfident = confPercent > accPercent

                return (
                  <div
                    key={bin.label}
                    className="rounded-lg border border-neutral-200/60 dark:border-(--hub-border)/60 bg-white/50 dark:bg-(--hub-panel)/50 p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span>{bin.label}</span>
                      <span className="text-tertiary">
                        {bin.trialCount} trial{bin.trialCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-[10px] text-tertiary mb-1">
                          <span>Mean Confidence</span>
                          <span className="font-bold text-strong">{confPercent}%</span>
                        </div>
                        <ProgressBar value={confPercent / 100} className="h-1.5" />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] text-tertiary mb-1">
                          <span>Observed Accuracy</span>
                          <span className="font-bold text-strong">{accPercent}%</span>
                        </div>
                        <ProgressBar value={accPercent / 100} className="h-1.5" />
                      </div>
                    </div>

                    {bin.trialCount > 0 && (
                      <div className="text-[10px] text-tertiary">
                        Calibration Gap:{' '}
                        <span
                          className={
                            isOverconfident
                              ? 'text-status-warning-text font-semibold'
                              : 'text-status-success-text font-semibold'
                          }
                        >
                          {isOverconfident
                            ? `+${confPercent - accPercent}% overconfident`
                            : `${accPercent - confPercent}% well-calibrated`}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Murphy Decomposition Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="rounded-lg border border-neutral-200/40 dark:border-(--hub-border)/40 bg-white/50 dark:bg-(--hub-panel)/50 p-3 text-xs">
                <span className="text-tertiary">Reliability (Error):</span>
                <div className="text-sm font-bold text-strong mt-0.5">
                  {profile.murphyDecomposition.reliability.toFixed(3)}
                </div>
                <p className="text-[10px] text-tertiary mt-0.5">Lower is better (0 = ideal)</p>
              </div>

              <div className="rounded-lg border border-neutral-200/40 dark:border-(--hub-border)/40 bg-white/50 dark:bg-(--hub-panel)/50 p-3 text-xs">
                <span className="text-tertiary">Resolution (Discrimination):</span>
                <div className="text-sm font-bold text-strong mt-0.5">
                  {profile.murphyDecomposition.resolution.toFixed(3)}
                </div>
                <p className="text-[10px] text-tertiary mt-0.5">Higher is better</p>
              </div>

              <div className="rounded-lg border border-neutral-200/40 dark:border-(--hub-border)/40 bg-white/50 dark:bg-(--hub-panel)/50 p-3 text-xs">
                <span className="text-tertiary">Base Uncertainty:</span>
                <div className="text-sm font-bold text-strong mt-0.5">
                  {profile.murphyDecomposition.uncertainty.toFixed(3)}
                </div>
                <p className="text-[10px] text-tertiary mt-0.5">Task inherent variance</p>
              </div>
            </div>

            {/* Recommendations */}
            <div className="rounded-lg border border-(--ac-strong)/20 bg-indigo-600/5 p-3 space-y-2">
              <div className="text-xs font-bold text-ac-text flex items-center gap-1.5">
                <Brain className="h-4 w-4" />
                <span>Metacognitive Recommendations:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-xs text-tertiary">
                {profile.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: Hypercorrection Laboratory */}
      {activeTab === 'hypercorrection_lab' && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200/50 dark:border-(--hub-border)/50 pb-3">
              <div>
                <h4 className="text-base font-semibold text-strong">
                  Hypercorrection Diagnostic Crucible
                </h4>
                <p className="text-xs text-tertiary">
                  High-confidence errors repaired via Butterfield & Metcalfe (2001) attention surge
                </p>
              </div>
              <Badge tone="warning">
                {profile.hypercorrectionCount} High-Confidence Error
                {profile.hypercorrectionCount !== 1 ? 's' : ''}
              </Badge>
            </div>

            {profile.hypercorrectionCount === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200/70 dark:border-(--hub-border)/70 p-8 text-center text-sm text-tertiary">
                No high-confidence errors recorded yet! Complete crucible problems with subjective
                confidence ≥ 70% to trigger hypercorrection diagnostics.
              </div>
            ) : (
              <div className="space-y-3">
                {state.trials
                  .filter((t) => t.isHypercorrectionCandidate)
                  .map((trial, index) => {
                    const item = initialProblemBank[trial.itemId]
                    if (!item) return null
                    const selectedOpt = item.options.find((o) => o.id === trial.selectedOptionId)

                    return (
                      <div
                        key={index}
                        className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5 space-y-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-strong">{item.title}</span>
                          <Badge tone="danger">
                            Confidence: {Math.round(trial.retrospectiveConfidence * 100)}%
                          </Badge>
                        </div>

                        <div className="text-tertiary italic">"{item.stem}"</div>

                        <div className="rounded border border-neutral-200/40 dark:border-(--hub-border)/40 bg-white/50 dark:bg-(--hub-panel)/50 p-2 text-rose-600 dark:text-danger-text">
                          <span className="font-semibold">Intuitive Error Chosen: </span>
                          {selectedOpt?.text}
                        </div>

                        {selectedOpt?.misconceptionRationale && (
                          <div className="text-xs text-tertiary">
                            <span className="font-semibold text-strong">Root Illusion: </span>
                            {selectedOpt.misconceptionRationale}
                          </div>
                        )}

                        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-800 dark:text-status-success-text">
                          <span className="font-semibold">Correct Scientific Reality: </span>
                          {item.canonicalScientificExplanation}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 4: FSRS Flashcard Tree & Export Bridge */}
      {activeTab === 'fsrs_cards' && (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/50 dark:border-(--hub-border)/50 pb-3">
              <div>
                <h4 className="text-base font-semibold text-strong">
                  FSRS Spaced Repetition Hypercorrection Bridge
                </h4>
                <p className="text-xs text-tertiary">
                  Cards generated with boosted initial stability (S = 3.5+) to capitalize on
                  attention surge
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  disabled={generatedCards.length === 0}
                  onClick={handleExport}
                  className="flex items-center gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{exportedSuccess ? 'Cards Exported!' : 'Export to FSRS Review Deck'}</span>
                </Button>
              </div>
            </div>

            {generatedCards.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200/70 dark:border-(--hub-border)/70 p-8 text-center text-sm text-tertiary">
                No error cards generated. Solve crucible problems to export targeted misconception
                cards.
              </div>
            ) : (
              <div className="space-y-3">
                {generatedCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg border border-neutral-200/60 dark:border-(--hub-border)/60 bg-white/60 dark:bg-(--hub-panel)/60 p-3.5 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {card.tags.map((tag) => (
                          <Badge key={tag} tone="neutral" className="px-1.5 py-0 text-[10px]">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                      <Badge tone="success" className="text-[10px]">
                        Initial Stability: {card.suggestedInitialStability}d
                      </Badge>
                    </div>

                    <div className="rounded bg-white/60 dark:bg-(--hub-panel)/60 p-2.5 font-medium text-strong">
                      <Markdown>{card.front}</Markdown>
                    </div>

                    <div className="rounded border border-neutral-200/40 dark:border-(--hub-border)/40 bg-white/40 dark:bg-(--hub-panel)/40 p-2.5 text-tertiary leading-relaxed">
                      <Markdown>{card.back}</Markdown>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
