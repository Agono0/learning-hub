'use client'

/**
 * @file InterleavingStudio.tsx
 * @description Interactive Interleaved Problem Solving & Structural Invariance Studio.
 *
 * Implements:
 * - Rohrer & Taylor (2007) Category Discrimination under Shuffled Sequences
 * - Kornell & Bjork (2008) Inductive Category Learning via Juxtaposition
 * - Chi, Feltovich & Glaser (1981) Novice Surface Decoys vs Expert Structural Invariants
 * - FSRS-6 Spaced Retrieval Card Synthesis
 */

import React, { useMemo, useState } from 'react'
import {
  CALIBRATED_INTERLEAVED_PROBLEMS,
  exportInterleavedToFSRSCards,
  FSRSInterleavedCard,
  InterleavedDiscriminationSession,
  InterleavedProblemDefinition,
  InterleavingMode,
  ProblemCategory,
} from '@learning-hub/core/interleaving/structural-invariance-engine'
import { Badge, Button, InterleavingHUD, Markdown, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Grid,
  Layers,
  Shuffle,
  Sliders,
  Sparkles,
  Target,
} from 'lucide-react'

export interface InterleavingStudioProps {
  initialProblems?: Record<string, InterleavedProblemDefinition>
  onExportCards?: (cards: FSRSInterleavedCard[]) => void
}

type StudioTab = 'discrimination_arena' | 'invariance_mutator' | 'confusion_matrix' | 'fsrs_deck'

function playStudioAudio(freq: number, duration = 0.15, type: OscillatorType = 'sine') {
  void getSharedAudioContext()
    .then((ctx) => {
      if (!ctx) return
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
      // Audio fallback
    })
}

export function InterleavingStudio({
  initialProblems = CALIBRATED_INTERLEAVED_PROBLEMS,
  onExportCards,
}: InterleavingStudioProps) {
  const [session, setSession] = useState(
    () => new InterleavedDiscriminationSession(initialProblems, 'adaptive_contrast'),
  )
  const [activeTab, setActiveTab] = useState<StudioTab>('discrimination_arena')

  // User input states
  const [selectedCategory, setSelectedCategory] = useState<ProblemCategory | null>(null)
  const [learnerJustification, setLearnerJustification] = useState<string>('')
  const [confidenceRating, setConfidenceRating] = useState<number>(4)
  const [showCounterexample, setShowCounterexample] = useState<boolean>(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  // Invariance mutator interactive toggles
  const [mutatorDivisibility, setMutatorDivisibility] = useState<'discrete' | 'continuous'>(
    'discrete',
  )
  const [mutatorEdgeWeights, setMutatorEdgeWeights] = useState<'non_negative' | 'has_negative'>(
    'non_negative',
  )

  const sessionState = session.getState()
  const currentProblem = session.getCurrentProblem()
  const currentTelemetry = currentProblem
    ? (sessionState.evaluations[currentProblem.id] ?? null)
    : null

  // Generated FSRS Cards
  const fsrsCards = useMemo(() => {
    return exportInterleavedToFSRSCards(session)
  }, [session, Object.keys(sessionState.evaluations).length])

  // Candidates for category selection (correct + decoy + 2 distractors)
  const candidateCategories = useMemo(() => {
    if (!currentProblem) return []
    const all = [
      currentProblem.correctCategory,
      currentProblem.decoyTrap.decoyCategory,
      'linear_selection_quickselect' as ProblemCategory,
      'interval_scheduling_greedy' as ProblemCategory,
    ]
    return Array.from(new Set(all)).sort()
  }, [currentProblem])

  // Handle mode change
  const handleModeChange = (mode: InterleavingMode) => {
    hapticMedium()
    session.setMode(mode)
    setSelectedCategory(null)
    setLearnerJustification('')
    setShowCounterexample(false)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Handle problem selection
  const handleSelectProblem = (id: string) => {
    hapticLight()
    session.selectProblem(id)
    setSelectedCategory(null)
    setLearnerJustification('')
    setShowCounterexample(false)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Submit discrimination attempt
  const handleSubmitAttempt = () => {
    if (!currentProblem || !selectedCategory) return

    const telemetry = session.recordAttempt({
      problemId: currentProblem.id,
      selectedCategory,
      selectedStrategyName:
        selectedCategory === currentProblem.correctCategory
          ? currentProblem.canonicalStrategyName
          : currentProblem.decoyTrap.decoyStrategyName,
      learnerJustification,
      confidenceRating,
      timeSpentMs: 12000,
    })

    if (telemetry?.isCategoryCorrect) {
      hapticMedium()
      playStudioAudio(587.33, 0.2, 'sine') // D5 chime
    } else if (telemetry?.isDecoyTrapped) {
      hapticHeavy()
      playStudioAudio(261.63, 0.25, 'sawtooth') // Decoy buzz
    } else {
      hapticLight()
      playStudioAudio(330, 0.2, 'triangle')
    }

    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Advance to next problem
  const handleAdvance = () => {
    hapticMedium()
    const advanced = session.advance()
    if (advanced) {
      setSelectedCategory(null)
      setLearnerJustification('')
      setShowCounterexample(false)
      playStudioAudio(523.25, 0.15, 'sine')
      setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
    }
  }

  // Copy FSRS cards to clipboard
  const handleCopyCards = () => {
    hapticMedium()
    navigator.clipboard.writeText(JSON.stringify(fsrsCards, null, 2))
    setCopyStatus('Copied Interleaved FSRS JSON to clipboard!')
    setTimeout(() => setCopyStatus(null), 3000)
  }

  // Export to parent engine
  const handleExportDeck = () => {
    hapticHeavy()
    if (onExportCards) {
      onExportCards(fsrsCards)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Real-time Telemetry HUD */}
      <InterleavingHUD
        metrics={sessionState.overallMetrics}
        currentProblemIndex={sessionState.currentProblemIndex}
        totalProblems={sessionState.problemIds.length}
        activeCategoryName={currentProblem?.correctCategory}
        activeMode={sessionState.mode}
      />

      {/* Mode Selector & Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Practice Sequence Mode Controls */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => handleModeChange('adaptive_contrast')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              sessionState.mode === 'adaptive_contrast'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
            <span>Adaptive Contrast</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('interleaved')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              sessionState.mode === 'interleaved'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Shuffle className="h-3.5 w-3.5 text-cyan-300" />
            <span>Shuffled (Rohrer)</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('blocked')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              sessionState.mode === 'blocked'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-amber-300" />
            <span>Blocked (Illusion)</span>
          </button>
        </div>

        {/* Workspace Tabs */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              hapticLight()
              setActiveTab('discrimination_arena')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'discrimination_arena'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="h-3.5 w-3.5 text-sky-400" />
            <span>Discrimination Arena</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hapticLight()
              setActiveTab('invariance_mutator')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'invariance_mutator'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3.5 w-3.5 text-violet-400" />
            <span>Invariance Mutator</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hapticLight()
              setActiveTab('confusion_matrix')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'confusion_matrix'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="h-3.5 w-3.5 text-emerald-400" />
            <span>Confusion Matrix</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hapticLight()
              setActiveTab('fsrs_deck')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'fsrs_deck'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>FSRS Contrast Deck ({fsrsCards.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DISCRIMINATION ARENA */}
      {activeTab === 'discrimination_arena' && currentProblem && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Problem Narrative & Surface Context */}
          <div className="flex flex-col gap-5 lg:col-span-7">
            <Panel className="p-6">
              {/* Problem Heading */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="cyan" className="text-[10px]">
                      {currentProblem.domain.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      Theme: {currentProblem.surfaceContext.storyTheme}
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-bold text-slate-100">{currentProblem.title}</h2>
                </div>

                {/* Problem Quick Jumper */}
                <select
                  aria-label="Select Problem"
                  value={currentProblem.id}
                  onChange={(e) => handleSelectProblem(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {sessionState.problemIds.map((id, idx) => (
                    <option key={id} value={id}>
                      #{idx + 1}: {initialProblems[id]?.title ?? id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Problem Narrative Statement */}
              <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  Problem Description
                </span>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {currentProblem.problemStatement}
                </p>
              </div>

              {/* Formal Parameters & Surface Keywords */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-3">
                  <span className="text-xs font-semibold text-slate-400">
                    Formal Parameter Constraints
                  </span>
                  <ul className="mt-2 space-y-1 text-xs text-slate-300">
                    {Object.entries(currentProblem.formalParameters).map(([k, v]) => (
                      <li key={k} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                        <span className="font-mono text-slate-400">{k}:</span>
                        <span className="font-mono text-sky-300">{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-3">
                  <span className="text-xs font-semibold text-slate-400">
                    Surface Narrative Elements
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {currentProblem.surfaceContext.superficialKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="rounded-md border border-slate-800 bg-slate-800/50 px-2 py-0.5 text-[11px] text-slate-300"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Key Discriminative Questions */}
              <div className="mt-4 rounded-xl border border-sky-900/30 bg-sky-950/15 p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-sky-300">
                  <Brain className="h-3.5 w-3.5 text-sky-400" />
                  <span>Kornell-Bjork Diagnostic Probing:</span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">
                  {currentProblem.keyDiscriminativeQuestions.map((q, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-sky-400 font-bold">{idx + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>

          {/* Right Column: Strategy Discrimination & Invariant Classification */}
          <div className="flex flex-col gap-5 lg:col-span-5">
            <Panel className="p-6">
              <h3 className="text-sm font-bold tracking-wider text-slate-300 uppercase">
                Category Discrimination Choice
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Identify the deep mathematical/algorithmic schema governing this problem. Beware of
                superficial story traps!
              </p>

              {/* Category Options Radio List */}
              <div className="mt-4 space-y-2.5">
                {candidateCategories.map((cat) => {
                  const isSelected = selectedCategory === cat
                  const isEvaluated = !!currentTelemetry
                  const isCorrectAnswer = cat === currentProblem.correctCategory
                  const isDecoy = cat === currentProblem.decoyTrap.decoyCategory

                  let borderStyle = 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                  if (isSelected && !isEvaluated) {
                    borderStyle = 'border-violet-500 bg-violet-950/30 ring-1 ring-violet-500/50'
                  } else if (isEvaluated) {
                    if (isCorrectAnswer) {
                      borderStyle =
                        'border-emerald-500 bg-emerald-950/30 text-emerald-300 ring-1 ring-emerald-500/50'
                    } else if (isSelected && isDecoy) {
                      borderStyle =
                        'border-rose-500 bg-rose-950/30 text-rose-300 ring-1 ring-rose-500/50'
                    } else {
                      borderStyle = 'border-slate-800/40 bg-slate-950/20 opacity-50'
                    }
                  }

                  return (
                    <button
                      key={cat}
                      type="button"
                      disabled={isEvaluated}
                      onClick={() => {
                        hapticLight()
                        setSelectedCategory(cat)
                      }}
                      className={`flex w-full items-start justify-between rounded-xl border p-3.5 text-left transition-all ${borderStyle}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-100">
                            {cat.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          {isEvaluated && isCorrectAnswer && (
                            <Badge tone="success" className="text-[10px]">
                              Governing Invariant
                            </Badge>
                          )}
                          {isEvaluated && isDecoy && (
                            <Badge tone="danger" className="text-[10px]">
                              Novice Surface Decoy
                            </Badge>
                          )}
                        </div>
                        <span className="mt-1 block text-xs text-slate-400">
                          {cat === currentProblem.correctCategory
                            ? currentProblem.canonicalStrategyName
                            : cat === currentProblem.decoyTrap.decoyCategory
                              ? currentProblem.decoyTrap.decoyStrategyName
                              : 'Standard alternative algorithmic template'}
                        </span>
                      </div>

                      <div className="mt-0.5">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                            isSelected
                              ? 'border-violet-500 bg-violet-500 text-white'
                              : 'border-slate-700'
                          }`}
                        >
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Justification Textarea */}
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-300">
                  Mechanistic Justification & Boundary Proof:
                </label>
                <textarea
                  value={learnerJustification}
                  onChange={(e) => setLearnerJustification(e.target.value)}
                  disabled={!!currentTelemetry}
                  placeholder="Explain why this category applies and what exact mathematical condition invalidates the decoy strategy..."
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {/* Confidence Rating Bar */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">Discrimination Confidence:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      disabled={!!currentTelemetry}
                      onClick={() => {
                        hapticLight()
                        setConfidenceRating(lvl)
                      }}
                      className={`h-6 w-6 rounded-md text-xs font-bold transition-all ${
                        confidenceRating === lvl
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex items-center gap-3">
                {!currentTelemetry ? (
                  <Button
                    onClick={handleSubmitAttempt}
                    disabled={!selectedCategory || learnerJustification.trim().length === 0}
                    className="w-full gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Evaluate Discrimination</span>
                  </Button>
                ) : (
                  <Button
                    onClick={handleAdvance}
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5"
                  >
                    <span>Next Interleaved Challenge</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Evaluation Feedback & Counterexample Reveal */}
              {currentTelemetry && (
                <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">Evaluation Result:</span>
                    <Badge
                      tone={
                        currentTelemetry.isCategoryCorrect
                          ? 'success'
                          : currentTelemetry.isDecoyTrapped
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      Score: {currentTelemetry.structuralDiscriminationScore}/100
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300">{currentTelemetry.feedbackMessage}</p>

                  {/* Surface Decoy Counterexample Accordion */}
                  <div className="mt-2 border-t border-slate-800/80 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        hapticLight()
                        setShowCounterexample(!showCounterexample)
                      }}
                      className="flex w-full items-center justify-between text-xs font-semibold text-rose-400 hover:text-rose-300"
                    >
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                        <span>Decoy Trap Concrete Counterexample</span>
                      </div>
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${
                          showCounterexample ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {showCounterexample && (
                      <div className="mt-3 space-y-2 rounded-lg bg-slate-900/90 p-3 text-xs text-slate-300 border border-slate-800">
                        <p className="font-semibold text-slate-200">
                          {currentProblem.decoyTrap.counterexampleExplanation}
                        </p>
                        <div className="font-mono text-[11px] text-slate-400">
                          <strong>Input:</strong> {currentProblem.decoyTrap.counterexampleInput}
                        </div>
                        <div className="font-mono text-[11px] text-emerald-400">
                          <strong>Expected ({currentProblem.correctCategory}):</strong>{' '}
                          {currentProblem.decoyTrap.counterexampleExpectedOutput}
                        </div>
                        <div className="font-mono text-[11px] text-rose-400">
                          <strong>Decoy Trap ({currentProblem.decoyTrap.decoyCategory}):</strong>{' '}
                          {currentProblem.decoyTrap.counterexampleDecoyOutput}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 2: INVARIANCE MUTATOR */}
      {activeTab === 'invariance_mutator' && (
        <Panel className="p-6">
          <div className="border-b border-slate-800/80 pb-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-violet-400" />
              <span>Structural Invariance Deconstruction Workbench</span>
            </h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Chi, Feltovich & Glaser (1981) demonstrated that novices fixate on surface storylines
              (e.g. &apos;cargo transport&apos; vs &apos;fiber latency&apos;), while experts focus
              strictly on deep constraints. Toggle parameters below to observe how algorithmic
              governance shifts dynamically while narrative remains identical.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Mutator Experiment 1: Knapsack Divisibility */}
            <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/40 p-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold text-slate-300 uppercase">
                  Case 1: Payload Allocation Constraint
                </span>
                <Badge tone={mutatorDivisibility === 'discrete' ? 'violet' : 'cyan'}>
                  {mutatorDivisibility === 'discrete' ? 'Dynamic Programming' : 'Greedy Matroid'}
                </Badge>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs text-slate-400">Item Divisibility:</span>
                <button
                  type="button"
                  onClick={() => {
                    hapticMedium()
                    setMutatorDivisibility('discrete')
                    playStudioAudio(440, 0.15, 'sine')
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    mutatorDivisibility === 'discrete'
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Discrete Integer (0/1)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticMedium()
                    setMutatorDivisibility('continuous')
                    playStudioAudio(523.25, 0.15, 'sine')
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    mutatorDivisibility === 'continuous'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Continuous Fluid
                </button>
              </div>

              <div className="mt-4 rounded-lg bg-slate-900/80 p-3.5 text-xs text-slate-300 border border-slate-800">
                <div className="font-semibold text-slate-100">
                  {mutatorDivisibility === 'discrete'
                    ? '0/1 Discrete Knapsack Invariant:'
                    : 'Fractional Continuous Knapsack Invariant:'}
                </div>
                <p className="mt-1.5 leading-relaxed text-slate-400">
                  {mutatorDivisibility === 'discrete'
                    ? 'Items cannot be divided. Greedy density ordering fails because selecting an early item can strand unused capacity that combinations of smaller items could fill with higher sum. Time Complexity: O(N * W) pseudo-polynomial.'
                    : 'Any continuous fraction of item mass can be poured. The greedy choice property guarantees optimal global value without stranded capacity. Time Complexity: O(N log N) sorting only.'}
                </p>
              </div>
            </div>

            {/* Mutator Experiment 2: Edge Weight Non-Negativity */}
            <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/40 p-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold text-slate-300 uppercase">
                  Case 2: Shortest Path Edge Weight Invariant
                </span>
                <Badge tone={mutatorEdgeWeights === 'non_negative' ? 'cyan' : 'warning'}>
                  {mutatorEdgeWeights === 'non_negative'
                    ? 'Dijkstra Priority Queue'
                    : 'Bellman-Ford Relaxation'}
                </Badge>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs text-slate-400">Weight Range:</span>
                <button
                  type="button"
                  onClick={() => {
                    hapticMedium()
                    setMutatorEdgeWeights('non_negative')
                    playStudioAudio(440, 0.15, 'sine')
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    mutatorEdgeWeights === 'non_negative'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Non-Negative Only (w &ge; 0)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticMedium()
                    setMutatorEdgeWeights('has_negative')
                    playStudioAudio(330, 0.15, 'sawtooth')
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    mutatorEdgeWeights === 'has_negative'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Arbitrary / Negative Logs
                </button>
              </div>

              <div className="mt-4 rounded-lg bg-slate-900/80 p-3.5 text-xs text-slate-300 border border-slate-800">
                <div className="font-semibold text-slate-100">
                  {mutatorEdgeWeights === 'non_negative'
                    ? 'Monotonic Prefix Invariant (Dijkstra):'
                    : 'Subpath Relaxation Invariant (Bellman-Ford):'}
                </div>
                <p className="mt-1.5 leading-relaxed text-slate-400">
                  {mutatorEdgeWeights === 'non_negative'
                    ? 'Because edge weights are non-negative, once the minimum-distance vertex is extracted from the priority queue, its distance can never decrease. Settled in O((V + E) log V).'
                    : 'Negative edges break greedy settlement: visiting an edge later can reduce already "settled" vertices. Requires V-1 relaxation passes to guarantee correctness and detect negative cycles. Complexity: O(V * E).'}
                </p>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* TAB 3: CONFUSION MATRIX */}
      {activeTab === 'confusion_matrix' && (
        <Panel className="p-6">
          <div className="border-b border-slate-800/80 pb-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Grid className="h-4 w-4 text-emerald-400" />
              <span>Category Confusion Matrix & Discrimination Heatmap</span>
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Tracks classification error correlations across the session. Shuffled practice
              isolates and eliminates cross-category confusion pairs.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="p-3">True Category</th>
                  <th className="p-3">Dynamic Prog</th>
                  <th className="p-3">Greedy Choice</th>
                  <th className="p-3">Dijkstra</th>
                  <th className="p-3">Bellman-Ford</th>
                  <th className="p-3">Quickselect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {[
                  'dynamic_programming',
                  'greedy_choice',
                  'shortest_path_dijkstra',
                  'shortest_path_bellman_ford',
                  'linear_selection_quickselect',
                ].map((trueCat) => (
                  <tr key={trueCat} className="hover:bg-slate-800/20">
                    <td className="p-3 font-semibold text-slate-200">
                      {trueCat.replace(/_/g, ' ')}
                    </td>
                    {[
                      'dynamic_programming',
                      'greedy_choice',
                      'shortest_path_dijkstra',
                      'shortest_path_bellman_ford',
                      'linear_selection_quickselect',
                    ].map((predCat) => {
                      const count = sessionState.confusionMatrix[trueCat]?.[predCat] ?? 0
                      const isDiagonal = trueCat === predCat
                      let cellColor = 'text-slate-500'
                      if (count > 0) {
                        cellColor = isDiagonal
                          ? 'text-emerald-400 font-bold bg-emerald-950/20'
                          : 'text-rose-400 font-bold bg-rose-950/20'
                      }

                      return (
                        <td key={predCat} className={`p-3 text-center ${cellColor}`}>
                          {count}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* TAB 4: FSRS REVIEW DECK */}
      {activeTab === 'fsrs_deck' && (
        <Panel className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span>FSRS Interleaved Review Deck</span>
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Dual-sided contrast flashcards produced from interleaved practice. Stability values
                are scaled by your Rohrer Discrimination Index (RDI).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleCopyCards}
                disabled={fsrsCards.length === 0}
                className="gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-2"
              >
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span>Copy JSON</span>
              </Button>
              <Button
                onClick={handleExportDeck}
                disabled={fsrsCards.length === 0}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export to Review Engine</span>
              </Button>
            </div>
          </div>

          {copyStatus && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-300">
              {copyStatus}
            </div>
          )}

          {fsrsCards.length === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <BookOpen className="h-10 w-10 text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-slate-300">No Evaluated Problems Yet</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                Complete discrimination challenges in the Discrimination Arena to generate
                contrasting FSRS flashcards with scaled initial memory stability.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {fsrsCards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
                    <Badge tone="cyan" className="text-[10px]">
                      Stability: {card.suggestedStabilityDays} days
                    </Badge>
                    <span className="text-[10px] text-slate-500 font-mono">
                      vs {card.pairedContrastCategory.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="mt-3 flex-1 text-xs">
                    <div className="font-semibold text-slate-300 mb-1">Front Prompt:</div>
                    <div className="rounded-lg bg-slate-900/60 p-2.5 text-slate-300 border border-slate-800/60">
                      <Markdown>{card.front}</Markdown>
                    </div>

                    <div className="font-semibold text-slate-300 mt-3 mb-1">Back Solution:</div>
                    <div className="rounded-lg bg-slate-900/60 p-2.5 text-slate-300 border border-slate-800/60">
                      <Markdown>{card.back}</Markdown>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
