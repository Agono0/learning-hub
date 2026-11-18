/**
 * Learning HUB — Dynamic Assessment & Zone of Proximal Development Studio
 *
 * Implements interactive dynamic testing, mediated learning experience (MLE),
 * and transfer distance evaluations grounded in:
 * 1. Lev Vygotsky (1978) - Actual (ADL) vs Potential (PDL) Developmental Levels
 * 2. Reuven Feuerstein (1979, 1980) - Learning Potential Assessment Device (LPAD) & SCM
 * 3. Joseph Campione & Ann Brown (1987) - 5-Tier Graduated Prompting Hierarchy
 * 4. Milton Budoff (1987) - Learning Potential Score (LPS) Gain Ratio
 * 5. Robert Sternberg & Elena Grigorenko (2002) - Dynamic Testing & Transfer Gradients
 * 6. Free Spaced Repetition Scheduler (FSRS-6) integration
 */

import React, { useId, useMemo, useState } from 'react'
import {
  calculateZpdMetrics,
  CANONICAL_ZPD_SCENARIOS,
  generateFSRSZpdDeck,
  getGraduatedPromptAtTier,
  type DynamicAssessmentScenario,
  type FSRSZpdFlashcard,
  type GraduatedPrompt,
  type PromptAttemptEvent,
  type ZpdMetrics,
} from '@learning-hub/core/dynamic-assessment'
import { Badge, Button, DynamicAssessmentHUD, Panel, Tabs } from '@/ui'
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Compass,
  HelpCircle,
  Layers,
  Lightbulb,
  RotateCcw,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react'

export function DynamicAssessmentStudio() {
  const [activeTab, setActiveTab] = useState<
    'sandwich_workbench' | 'zpd_radar' | 'transfer_crucible' | 'fsrs_deck'
  >('sandwich_workbench')

  // --- Scenario Selection ---
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    CANONICAL_ZPD_SCENARIOS[0].id,
  )
  const scenario: DynamicAssessmentScenario = useMemo(() => {
    return (
      CANONICAL_ZPD_SCENARIOS.find((s) => s.id === selectedScenarioId) || CANONICAL_ZPD_SCENARIOS[0]
    )
  }, [selectedScenarioId])

  // --- 1. Sandwich Testing Workbench State ---
  const [activeStep, setActiveStep] = useState<'pre_test' | 'mediated' | 'post_test'>('pre_test')
  const [preTestAnswer, setPreTestAnswer] = useState<number | null>(null)
  const [preTestSubmitted, setPreTestSubmitted] = useState<boolean>(false)

  // Mediated Phase State
  const [currentPromptTier, setCurrentPromptTier] = useState<number>(0) // 0 = no prompts yet, 1..5
  const [revealedPrompts, setRevealedPrompts] = useState<GraduatedPrompt[]>([])
  const [promptEvents, setPromptEvents] = useState<PromptAttemptEvent[]>([])
  const [mediatedAnswer, setMediatedAnswer] = useState<number | null>(null)
  const [mediatedSubmitted, setMediatedSubmitted] = useState<boolean>(false)
  const [promptStartTime, setPromptStartTime] = useState<number>(Date.now())

  // Post-Test Phase State
  const [postTestAnswer, setPostTestAnswer] = useState<number | null>(null)
  const [postTestSubmitted, setPostTestSubmitted] = useState<boolean>(false)

  // --- 2. Transfer Crucible State ---
  const [transferAnswers, setTransferAnswers] = useState<Record<string, number>>({})
  const [transferSubmitted, setTransferSubmitted] = useState<Record<string, boolean>>({})

  // --- 3. Spaced Repetition Card Deck State ---
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null)
  const [deckExported, setDeckExported] = useState<boolean>(false)

  // --- Derived Scores & ZPD Metrics ---
  const preScore = useMemo(() => {
    if (!preTestSubmitted || preTestAnswer === null) return 25 // default baseline estimate
    return preTestAnswer === scenario.preTestProblem.correctOptionIndex ? 85 : 20
  }, [preTestSubmitted, preTestAnswer, scenario.preTestProblem.correctOptionIndex])

  const postScore = useMemo(() => {
    if (!postTestSubmitted || postTestAnswer === null) return preScore + 15
    return postTestAnswer === scenario.postTestProblem.correctOptionIndex ? 90 : 40
  }, [postTestSubmitted, postTestAnswer, scenario.postTestProblem.correctOptionIndex, preScore])

  const transferScores = useMemo(() => {
    const scores: number[] = []
    for (const probe of scenario.transferProbes) {
      if (transferSubmitted[probe.id]) {
        const isCorrect = transferAnswers[probe.id] === probe.correctOptionIndex
        scores.push(isCorrect ? 100 : 25)
      }
    }
    return scores.length > 0 ? scores : [60]
  }, [scenario.transferProbes, transferAnswers, transferSubmitted])

  const metrics: ZpdMetrics = useMemo(() => {
    return calculateZpdMetrics(
      preScore,
      postScore,
      revealedPrompts.length,
      transferScores,
      promptEvents,
    )
  }, [preScore, postScore, revealedPrompts.length, transferScores, promptEvents])

  const flashcards: FSRSZpdFlashcard[] = useMemo(() => {
    return generateFSRSZpdDeck(scenario, metrics)
  }, [scenario, metrics])

  // --- Handlers ---
  const handleRevealNextPrompt = () => {
    if (currentPromptTier >= 5) return
    const nextTier = currentPromptTier + 1
    const prompt = getGraduatedPromptAtTier(scenario.mediatedProblem, nextTier)
    if (prompt) {
      const now = Date.now()
      const timeSpent = now - promptStartTime
      setRevealedPrompts((prev) => [...prev, prompt])
      setCurrentPromptTier(nextTier)
      setPromptEvents((prev) => [
        ...prev,
        { tierLevel: nextTier, timestamp: now, timeSpentMs: timeSpent },
      ])
      setPromptStartTime(now)
    }
  }

  const handleResetWorkbench = () => {
    setPreTestAnswer(null)
    setPreTestSubmitted(false)
    setCurrentPromptTier(0)
    setRevealedPrompts([])
    setPromptEvents([])
    setMediatedAnswer(null)
    setMediatedSubmitted(false)
    setPostTestAnswer(null)
    setPostTestSubmitted(false)
    setTransferAnswers({})
    setTransferSubmitted({})
    setActiveStep('pre_test')
    setPromptStartTime(Date.now())
  }

  const uniqueId = useId()

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. Multidisciplinary Scenario Selector */}
      <Panel className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-2.5">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-ac-text" />
            <span className="text-xs font-bold uppercase tracking-wider text-secondary">
              Select Assessment Domain
            </span>
          </div>
          <span className="text-xs text-secondary font-mono">
            {CANONICAL_ZPD_SCENARIOS.length} Multidisciplinary Frameworks
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {CANONICAL_ZPD_SCENARIOS.map((sc) => {
            const isSelected = sc.id === selectedScenarioId
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => {
                  setSelectedScenarioId(sc.id)
                  handleResetWorkbench()
                }}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all min-h-[44px] ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 text-strong ring-1 ring-indigo-500'
                    : 'border-neutral-200 dark:border-(--hub-border) hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2) text-secondary'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 truncate w-full">
                  {sc.domain.split('&')[0]}
                </span>
                <span className="text-xs font-bold text-strong truncate w-full mt-0.5">
                  {sc.title}
                </span>
              </button>
            )
          })}
        </div>
      </Panel>

      {/* 2. Real-Time Dynamic Assessment Telemetry HUD */}
      <DynamicAssessmentHUD metrics={metrics} activeScenarioTitle={scenario.title} />

      {/* 3. Main Multi-Tab Navigation */}
      <Tabs
        value={activeTab}
        onChange={(val) => setActiveTab(val)}
        label="Dynamic Assessment Studio Modes"
        items={[
          {
            key: 'sandwich_workbench',
            label: 'Test-Mediate-Retest Workbench',
            icon: <Activity className="w-4 h-4" />,
          },
          {
            key: 'zpd_radar',
            label: 'ZPD Radar & Modifiability',
            icon: <Layers className="w-4 h-4" />,
          },
          {
            key: 'transfer_crucible',
            label: 'Transfer Distance Crucible',
            icon: <Compass className="w-4 h-4" />,
          },
          {
            key: 'fsrs_deck',
            label: 'FSRS-6 Mediated Deck',
            icon: <Zap className="w-4 h-4" />,
          },
        ]}
      />

      {/* ========================================================================= */}
      {/* TAB 1: SANDWICH TEST-TRAIN-RETEST WORKBENCH                               */}
      {/* ========================================================================= */}
      {activeTab === 'sandwich_workbench' && (
        <div className="space-y-6">
          {/* Step Progress Pill Indicator */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)">
            <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveStep('pre_test')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[44px] transition-all ${
                  activeStep === 'pre_test'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                  1
                </span>
                <span>Pre-Test (ADL Baseline)</span>
                {preTestSubmitted && (
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1 text-status-success-text" />
                )}
              </button>

              <ChevronRight className="w-4 h-4 text-tertiary shrink-0" />

              <button
                type="button"
                onClick={() => setActiveStep('mediated')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[44px] transition-all ${
                  activeStep === 'mediated'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                  2
                </span>
                <span>Graduated Mediation (MLE)</span>
                {mediatedSubmitted && (
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1 text-status-success-text" />
                )}
              </button>

              <ChevronRight className="w-4 h-4 text-tertiary shrink-0" />

              <button
                type="button"
                onClick={() => setActiveStep('post_test')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[44px] transition-all ${
                  activeStep === 'post_test'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                  3
                </span>
                <span>Post-Test (PDL Gain)</span>
                {postTestSubmitted && (
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1 text-status-success-text" />
                )}
              </button>
            </div>

            <Button
              variant="ghost"
              onClick={handleResetWorkbench}
              className="text-xs px-2.5 py-1 text-secondary hover:text-strong"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset Workbench
            </Button>
          </div>

          {/* PHASE 1: PRE-TEST (ADL) */}
          {activeStep === 'pre_test' && (
            <Panel className="p-6 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral" className="text-[10px]">
                      Phase 1: Diagnostic Pre-Test
                    </Badge>
                    <span className="text-xs font-mono text-tertiary">
                      Zero Hints Allowed • Evaluates ADL
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-strong">
                    {scenario.preTestProblem.title}
                  </h3>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-xs text-secondary leading-relaxed">
                <strong className="text-strong block mb-1">Context:</strong>
                {scenario.preTestProblem.context}
              </div>

              <div className="text-sm font-semibold text-strong">
                {scenario.preTestProblem.question}
              </div>

              {/* Options */}
              <div className="space-y-2.5">
                {scenario.preTestProblem.options.map((opt, idx) => {
                  const isSelected = preTestAnswer === idx
                  const isCorrect = idx === scenario.preTestProblem.correctOptionIndex
                  let optionClass =
                    'border-neutral-200 dark:border-(--hub-border) hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2)'
                  if (preTestSubmitted) {
                    if (isCorrect) {
                      optionClass =
                        'border-status-success-text bg-emerald-50/50 dark:bg-emerald-950/20 text-status-success-text'
                    } else if (isSelected) {
                      optionClass =
                        'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-danger-text dark:text-danger-text'
                    }
                  } else if (isSelected) {
                    optionClass =
                      'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={preTestSubmitted}
                      onClick={() => setPreTestAnswer(idx)}
                      className={`w-full flex items-start gap-3 p-3.5 rounded-lg border text-left text-xs transition-all min-h-[44px] ${optionClass}`}
                    >
                      <span className="font-mono font-bold w-5 h-5 rounded-full bg-neutral-200 dark:bg-(--hub-panel-2) flex items-center justify-center shrink-0 text-strong">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-strong leading-normal">{opt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Submit & Navigation */}
              <div className="flex items-center justify-between pt-2">
                {!preTestSubmitted ? (
                  <Button
                    variant="primary"
                    disabled={preTestAnswer === null}
                    onClick={() => setPreTestSubmitted(true)}
                  >
                    Submit Independent Answer
                  </Button>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <div className="text-xs text-secondary flex items-center gap-1.5">
                      {preTestAnswer === scenario.preTestProblem.correctOptionIndex ? (
                        <span className="text-status-success-text font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Correct baseline diagnosis!
                        </span>
                      ) : (
                        <span className="text-status-warning-text dark:text-status-warning-text font-semibold flex items-center gap-1">
                          <HelpCircle className="w-4 h-4" /> Baseline gap identified. Proceed to
                          Mediation.
                        </span>
                      )}
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => setActiveStep('mediated')}
                      className="flex items-center gap-1.5"
                    >
                      <span>Proceed to Mediated Learning</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {preTestSubmitted && (
                <div className="p-4 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 text-xs space-y-1.5">
                  <span className="font-bold text-strong block">Structural Concept Analysis:</span>
                  <p className="text-secondary leading-relaxed">
                    {scenario.preTestProblem.explanation}
                  </p>
                </div>
              )}
            </Panel>
          )}

          {/* PHASE 2: MEDIATED PROBLEM & GRADUATED PROMPTS */}
          {activeStep === 'mediated' && (
            <div className="space-y-6">
              <Panel className="p-6 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge tone="accent" className="text-[10px]">
                        Phase 2: Feuerstein-Brown Graduated Mediation
                      </Badge>
                      <span className="text-xs font-mono text-secondary">
                        Tier {currentPromptTier}/5 Unlocked
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-strong">
                      {scenario.mediatedProblem.title}
                    </h3>
                  </div>

                  <Button
                    variant="secondary"
                    disabled={currentPromptTier >= 5 || mediatedSubmitted}
                    onClick={handleRevealNextPrompt}
                    className="flex items-center gap-1.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 text-xs px-2.5 py-1"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-status-warning-text" />
                    <span>
                      {currentPromptTier === 0
                        ? 'Request Level 1 Hint'
                        : `Reveal Next Hint (Tier ${currentPromptTier + 1})`}
                    </span>
                  </Button>
                </div>

                <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-xs text-secondary leading-relaxed">
                  <strong className="text-strong block mb-1">Context:</strong>
                  {scenario.mediatedProblem.context}
                </div>

                <div className="text-sm font-semibold text-strong">
                  {scenario.mediatedProblem.question}
                </div>

                {/* Graduated Prompt Cascade Display */}
                {revealedPrompts.length > 0 && (
                  <div className="space-y-3 pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-ac-text" />
                      <span>Mediated Scaffolding Cascade ({revealedPrompts.length} Active):</span>
                    </div>

                    <div className="space-y-2.5">
                      {revealedPrompts.map((prompt) => (
                        <div
                          key={prompt.tierLevel}
                          className="p-3.5 rounded-lg border border-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/10 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-mono">
                                {prompt.tierLevel}
                              </span>
                              {prompt.title}
                            </span>
                            <span className="text-[10px] font-mono text-tertiary">
                              Cognitive Load: {prompt.cognitiveLoadImpact}/10
                            </span>
                          </div>
                          <p className="text-strong font-medium">{prompt.promptText}</p>
                          <div className="text-[11px] text-secondary flex items-center gap-2 pt-1 border-t border-indigo-200/40 dark:border-indigo-800/20">
                            <span className="font-semibold text-tertiary">Mediator Rationale:</span>
                            <span>{prompt.mediatorRationale}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mediated Options */}
                <div className="space-y-2.5">
                  {scenario.mediatedProblem.options.map((opt, idx) => {
                    const isSelected = mediatedAnswer === idx
                    const isCorrect = idx === scenario.mediatedProblem.correctOptionIndex
                    let optionClass =
                      'border-neutral-200 dark:border-(--hub-border) hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2)'
                    if (mediatedSubmitted) {
                      if (isCorrect) {
                        optionClass =
                          'border-status-success-text bg-emerald-50/50 dark:bg-emerald-950/20 text-status-success-text'
                      } else if (isSelected) {
                        optionClass =
                          'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-danger-text dark:text-danger-text'
                      }
                    } else if (isSelected) {
                      optionClass =
                        'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={mediatedSubmitted}
                        onClick={() => setMediatedAnswer(idx)}
                        className={`w-full flex items-start gap-3 p-3.5 rounded-lg border text-left text-xs transition-all min-h-[44px] ${optionClass}`}
                      >
                        <span className="font-mono font-bold w-5 h-5 rounded-full bg-neutral-200 dark:bg-(--hub-panel-2) flex items-center justify-center shrink-0 text-strong">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-strong leading-normal">{opt}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Submission & Proceed */}
                <div className="flex items-center justify-between pt-2">
                  {!mediatedSubmitted ? (
                    <Button
                      variant="primary"
                      disabled={mediatedAnswer === null}
                      onClick={() => setMediatedSubmitted(true)}
                    >
                      Commit Mediated Solution
                    </Button>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="text-xs text-secondary flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-status-success-text" />
                        <span>
                          Mediation cycle complete. Evaluated {revealedPrompts.length} prompt(s).
                        </span>
                      </div>
                      <Button
                        variant="primary"
                        onClick={() => setActiveStep('post_test')}
                        className="flex items-center gap-1.5"
                      >
                        <span>Advance to Post-Test (PDL)</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          )}

          {/* PHASE 3: POST-TEST (PDL) */}
          {activeStep === 'post_test' && (
            <Panel className="p-6 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge tone="success" className="text-[10px]">
                      Phase 3: Independent Post-Test
                    </Badge>
                    <span className="text-xs font-mono text-tertiary">
                      Evaluates Potential Developmental Level (PDL)
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-strong">
                    {scenario.postTestProblem.title}
                  </h3>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-xs text-secondary leading-relaxed">
                <strong className="text-strong block mb-1">Context:</strong>
                {scenario.postTestProblem.context}
              </div>

              <div className="text-sm font-semibold text-strong">
                {scenario.postTestProblem.question}
              </div>

              {/* Options */}
              <div className="space-y-2.5">
                {scenario.postTestProblem.options.map((opt, idx) => {
                  const isSelected = postTestAnswer === idx
                  const isCorrect = idx === scenario.postTestProblem.correctOptionIndex
                  let optionClass =
                    'border-neutral-200 dark:border-(--hub-border) hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2)'
                  if (postTestSubmitted) {
                    if (isCorrect) {
                      optionClass =
                        'border-status-success-text bg-emerald-50/50 dark:bg-emerald-950/20 text-status-success-text'
                    } else if (isSelected) {
                      optionClass =
                        'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-danger-text dark:text-danger-text'
                    }
                  } else if (isSelected) {
                    optionClass =
                      'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={postTestSubmitted}
                      onClick={() => setPostTestAnswer(idx)}
                      className={`w-full flex items-start gap-3 p-3.5 rounded-lg border text-left text-xs transition-all min-h-[44px] ${optionClass}`}
                    >
                      <span className="font-mono font-bold w-5 h-5 rounded-full bg-neutral-200 dark:bg-(--hub-panel-2) flex items-center justify-center shrink-0 text-strong">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-strong leading-normal">{opt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Submit & Next Step */}
              <div className="flex items-center justify-between pt-2">
                {!postTestSubmitted ? (
                  <Button
                    variant="primary"
                    disabled={postTestAnswer === null}
                    onClick={() => setPostTestSubmitted(true)}
                  >
                    Commit Post-Test Assessment
                  </Button>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <div className="text-xs text-status-success-text font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Post-test completed! Learning Potential Score calculated.</span>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => setActiveTab('transfer_crucible')}
                      className="flex items-center gap-1.5"
                    >
                      <span>Advance to Transfer Crucible</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {postTestSubmitted && (
                <div className="p-4 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 text-xs space-y-1.5">
                  <span className="font-bold text-strong block">
                    Comprehensive Post-Test Explanation:
                  </span>
                  <p className="text-secondary leading-relaxed">
                    {scenario.postTestProblem.explanation}
                  </p>
                </div>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ZPD RADAR & MODIFIABILITY VISUALIZER                                */}
      {/* ========================================================================= */}
      {activeTab === 'zpd_radar' && (
        <div className="space-y-6">
          <Panel className="p-6 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
            <div className="border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <h3 className="text-base font-bold text-strong">
                Vygotskian Zone of Proximal Development Radar
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Dynamic visual boundary mapping from independent mastery (ADL) through mediated
                scaffolding (ZPD) to cognitive overload (Frustration Horizon).
              </p>
            </div>

            {/* Interactive SVG Zone Visualization */}
            <div className="w-full flex flex-col items-center p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40">
              <svg
                viewBox="0 0 600 240"
                className="w-full max-w-2xl h-auto overflow-visible select-none"
              >
                <defs>
                  <linearGradient id={`zpdGradient-${uniqueId}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.45" />
                  </linearGradient>
                  <linearGradient id={`frustGradient-${uniqueId}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.4" />
                  </linearGradient>
                </defs>

                {/* Background Axis Track */}
                <rect x="50" y="80" width="500" height="40" rx="8" fill="#e2e8f0" opacity="0.4" />

                {/* 1. Comfort Zone [0 .. ADL] */}
                <rect
                  x="50"
                  y="80"
                  width={Math.max(10, metrics.actualDevelopmentalLevel * 5)}
                  height="40"
                  rx="6"
                  fill="#94a3b8"
                  opacity="0.5"
                />

                {/* 2. Active ZPD Zone [ADL .. PDL] */}
                <rect
                  x={50 + metrics.actualDevelopmentalLevel * 5}
                  y="74"
                  width={Math.max(
                    10,
                    (metrics.potentialDevelopmentalLevel - metrics.actualDevelopmentalLevel) * 5,
                  )}
                  height="52"
                  rx="8"
                  fill={`url(#zpdGradient-${uniqueId})`}
                  stroke="#6366f1"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />

                {/* 3. Frustration Zone [> Frustration Horizon] */}
                <rect
                  x={50 + metrics.frustrationHorizon * 5}
                  y="80"
                  width={Math.max(10, (100 - metrics.frustrationHorizon) * 5)}
                  height="40"
                  rx="6"
                  fill={`url(#frustGradient-${uniqueId})`}
                />

                {/* Markers & Pins */}
                {/* ADL Marker */}
                <line
                  x1={50 + metrics.actualDevelopmentalLevel * 5}
                  y1="50"
                  x2={50 + metrics.actualDevelopmentalLevel * 5}
                  y2="145"
                  stroke="#475569"
                  strokeWidth="2"
                />
                <circle
                  cx={50 + metrics.actualDevelopmentalLevel * 5}
                  cy="50"
                  r="5"
                  fill="#475569"
                />
                <text
                  x={50 + metrics.actualDevelopmentalLevel * 5}
                  y="40"
                  textAnchor="middle"
                  fill="#475569"
                  fontSize="11"
                  fontWeight="bold"
                >
                  ADL: {metrics.actualDevelopmentalLevel}%
                </text>

                {/* PDL Marker */}
                <line
                  x1={50 + metrics.potentialDevelopmentalLevel * 5}
                  y1="40"
                  x2={50 + metrics.potentialDevelopmentalLevel * 5}
                  y2="155"
                  stroke="#10b981"
                  strokeWidth="2.5"
                />
                <circle
                  cx={50 + metrics.potentialDevelopmentalLevel * 5}
                  cy="40"
                  r="6"
                  fill="#10b981"
                />
                <text
                  x={50 + metrics.potentialDevelopmentalLevel * 5}
                  y="30"
                  textAnchor="middle"
                  fill="#10b981"
                  fontSize="12"
                  fontWeight="bold"
                >
                  PDL: {metrics.potentialDevelopmentalLevel}%
                </text>

                {/* Frustration Horizon Marker */}
                <line
                  x1={50 + metrics.frustrationHorizon * 5}
                  y1="55"
                  x2={50 + metrics.frustrationHorizon * 5}
                  y2="145"
                  stroke="#f43f5e"
                  strokeWidth="2"
                  strokeDasharray="2 2"
                />
                <text
                  x={50 + metrics.frustrationHorizon * 5}
                  y="45"
                  textAnchor="middle"
                  fill="#f43f5e"
                  fontSize="11"
                  fontWeight="bold"
                >
                  Overload: ~{metrics.frustrationHorizon}%
                </text>

                {/* Zone Labels below */}
                <text
                  x={50 + metrics.actualDevelopmentalLevel * 2.5}
                  y="165"
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="10"
                >
                  Comfort Zone (Autonomous)
                </text>
                <text
                  x={
                    50 +
                    (metrics.actualDevelopmentalLevel + metrics.potentialDevelopmentalLevel) * 2.5
                  }
                  y="180"
                  textAnchor="middle"
                  fill="#6366f1"
                  fontSize="12"
                  fontWeight="bold"
                >
                  ⚡ Active ZPD Bandwidth (+{metrics.zpdBandwidth}%)
                </text>
                <text
                  x={50 + (metrics.frustrationHorizon + 100) * 2.5}
                  y="165"
                  textAnchor="middle"
                  fill="#f43f5e"
                  fontSize="10"
                >
                  Frustration Horizon
                </text>
              </svg>
            </div>

            {/* Feuerstein Mediated Learning Criteria Accordion */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/30 space-y-1.5 text-xs">
                <span className="font-bold text-indigo-600 dark:text-indigo-400 block">
                  1. Intentionality & Reciprocity
                </span>
                <p className="text-secondary leading-relaxed">
                  The mediator deliberately directs the learner attention toward core structural
                  invariants, transforming passive perception into purposeful inquiry.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/30 space-y-1.5 text-xs">
                <span className="font-bold text-indigo-600 dark:text-indigo-400 block">
                  2. Meaning Transcendence
                </span>
                <p className="text-secondary leading-relaxed">
                  Mediation extends beyond the immediate problem instance to universal relational
                  principles capable of isomorphic transfer to distant fields.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/30 space-y-1.5 text-xs">
                <span className="font-bold text-indigo-600 dark:text-indigo-400 block">
                  3. Mediation of Competence
                </span>
                <p className="text-secondary leading-relaxed">
                  Systematic scaffolding decay rewards learner autonomy, building durable
                  self-efficacy through graduated prompt withdrawal.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TRANSFER DISTANCE CRUCIBLE                                         */}
      {/* ========================================================================= */}
      {activeTab === 'transfer_crucible' && (
        <div className="space-y-6">
          <Panel className="p-6 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <h3 className="text-base font-bold text-strong">
                  Sternberg-Campione Transfer Distance Crucible
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Evaluates abstract schema generalizability across Near, Medium, and Far
                  cross-disciplinary transfer gradients.
                </p>
              </div>
              <Badge tone="accent" className="text-xs font-mono">
                Autonomy Score: {(metrics.transferAutonomyScore * 100).toFixed(0)}%
              </Badge>
            </div>

            <div className="space-y-6">
              {scenario.transferProbes.map((probe) => {
                const isSubmitted = transferSubmitted[probe.id] || false
                const selectedIdx = transferAnswers[probe.id]
                const isCorrect = selectedIdx === probe.correctOptionIndex

                const distanceBadge: Record<
                  string,
                  { label: string; tone: 'neutral' | 'accent' | 'warning' }
                > = {
                  near: { label: 'Near Transfer (Surface Change)', tone: 'neutral' },
                  medium: { label: 'Medium Transfer (Context Shift)', tone: 'accent' },
                  far: { label: 'Far Transfer (Cross-Domain Isomorphism)', tone: 'warning' },
                }

                return (
                  <div
                    key={probe.id}
                    className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/40 dark:bg-(--hub-panel-2)/20 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-2.5">
                      <div className="flex items-center gap-2">
                        <Badge tone={distanceBadge[probe.distance].tone} className="text-[10px]">
                          {distanceBadge[probe.distance].label}
                        </Badge>
                        <h4 className="text-sm font-bold text-strong">{probe.title}</h4>
                      </div>
                      {isSubmitted && (
                        <span
                          className={`text-xs font-bold flex items-center gap-1 ${
                            isCorrect ? 'text-status-success-text' : 'text-danger-text'
                          }`}
                        >
                          {isCorrect ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" /> Solved Autonomously
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4" /> Transfer Gap
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-secondary space-y-1">
                      <div>
                        <strong className="text-strong">Domain Setting:</strong>{' '}
                        {probe.surfaceContext}
                      </div>
                      <div>
                        <strong className="text-indigo-600 dark:text-indigo-400">
                          Isomorphic Relational Principle:
                        </strong>{' '}
                        {probe.isomorphicPrinciple}
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-strong">{probe.question}</div>

                    {/* Transfer Options */}
                    <div className="space-y-2">
                      {probe.options.map((opt, optIdx) => {
                        const isOptSelected = selectedIdx === optIdx
                        let optStyle =
                          'border-neutral-200 dark:border-(--hub-border) hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2)'
                        if (isSubmitted) {
                          if (optIdx === probe.correctOptionIndex) {
                            optStyle =
                              'border-status-success-text bg-emerald-50/50 dark:bg-emerald-950/20 text-status-success-text'
                          } else if (isOptSelected) {
                            optStyle =
                              'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-danger-text dark:text-danger-text'
                          }
                        } else if (isOptSelected) {
                          optStyle =
                            'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                        }

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            disabled={isSubmitted}
                            onClick={() =>
                              setTransferAnswers((prev) => ({ ...prev, [probe.id]: optIdx }))
                            }
                            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left text-xs transition-all min-h-[44px] ${optStyle}`}
                          >
                            <span className="font-mono font-bold w-5 h-5 rounded-full bg-neutral-200 dark:bg-(--hub-panel-2) flex items-center justify-center shrink-0 text-strong">
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <span className="text-strong leading-normal">{opt}</span>
                          </button>
                        )
                      })}
                    </div>

                    {!isSubmitted ? (
                      <Button
                        variant="secondary"
                        disabled={selectedIdx === undefined}
                        onClick={() =>
                          setTransferSubmitted((prev) => ({ ...prev, [probe.id]: true }))
                        }
                        className="text-xs px-2.5 py-1"
                      >
                        Verify Transfer Solution
                      </Button>
                    ) : (
                      <div className="p-3 rounded-lg bg-neutral-100 dark:bg-(--hub-panel-2) text-xs text-secondary leading-relaxed border border-neutral-200 dark:border-(--hub-border)">
                        <strong className="text-strong block mb-0.5">Transfer Resolution:</strong>
                        {probe.explanation}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: FSRS-6 MEDIATED SPACED REPETITION DECK                             */}
      {/* ========================================================================= */}
      {activeTab === 'fsrs_deck' && (
        <div className="space-y-6">
          <Panel className="p-6 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <h3 className="text-base font-bold text-strong">
                  FSRS-6 Calibrated Spaced Repetition Deck
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Initial review stability (S₀) dynamically modulated by your Learning Potential
                  Score (LPS) and Transfer Autonomy Score (TAS).
                </p>
              </div>

              <Button
                variant="primary"
                onClick={() => setDeckExported(true)}
                disabled={deckExported}
                className="flex items-center gap-1.5"
              >
                <Zap className="w-4 h-4 text-status-warning-text" />
                <span>
                  {deckExported ? 'Deck Synchronized with FSRS' : 'Export Deck to Review Queue'}
                </span>
              </Button>
            </div>

            {deckExported && (
              <div className="p-3.5 rounded-lg border border-status-success-text/40 bg-emerald-50/50 dark:bg-emerald-950/20 text-status-success-text text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Successfully synchronized {flashcards.length} mediated review cards into your
                  active FSRS-6 memory queue! Initial stability intervals calibrated to cognitive
                  modifiability.
                </span>
              </div>
            )}

            {/* Flashcard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {flashcards.map((card) => {
                const isFlipped = flippedCardId === card.id
                return (
                  <div
                    key={card.id}
                    onClick={() => setFlippedCardId(isFlipped ? null : card.id)}
                    className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/60 dark:bg-(--hub-panel-2)/30 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer flex flex-col justify-between min-h-[190px] select-none"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-secondary">
                          {card.concept}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                            S₀: {card.recommendedStabilityDays}d
                          </span>
                        </div>
                      </div>

                      <div className="text-xs font-semibold text-strong leading-relaxed pt-1">
                        {!isFlipped ? (
                          card.front
                        ) : (
                          <div className="space-y-2 text-indigo-900 dark:text-indigo-200">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-ac-text block">
                              Target Schema Resolution:
                            </span>
                            <p className="whitespace-pre-line">{card.back}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-neutral-200 dark:border-(--hub-border) text-[11px] text-tertiary">
                      <span>Click to {isFlipped ? 'view prompt' : 'reveal resolution'}</span>
                      <div className="flex gap-1">
                        {card.tags.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-(--hub-panel-2) text-[10px]"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
