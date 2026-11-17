'use client'

/**
 * @file SelfExplanationStudio.tsx
 * @description Generative Self-Explanation & Schema Inversion Studio.
 *
 * Implements:
 * - Michelene T. H. Chi et al. (1989) Principle-Based Self-Explanation vs Paraphrasing
 * - Vincent Aleven & Kenneth R. Koedinger (2002) Cognitive Tutor Rule Naming
 * - Alexander Renkl (2002) Schema Inversion & Boundary Condition Counterfactual Testing
 * - FSRS Spaced Repetition Derivation Stability Scaling
 */

import React, { useMemo, useState } from 'react'
import {
  CALIBRATED_EXPLANATION_PROBLEMS,
  exportSelfExplanationToFSRSCards,
  FSRSSelfExplanationCard,
  SelfExplanationDerivationProblem,
  SelfExplanationSession,
} from '@learning-hub/core/explanation/self-explanation-engine'
import { Badge, Button, Markdown, Panel, SelfExplanationHUD } from '@/ui'
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
  Layers,
  RotateCcw,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'

export interface SelfExplanationStudioProps {
  initialProblems?: Record<string, SelfExplanationDerivationProblem>
  onExportCards?: (cards: FSRSSelfExplanationCard[]) => void
}

type StudioTab = 'derivation_workbench' | 'schema_inversion' | 'proof_chain' | 'fsrs_deck'

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

export function SelfExplanationStudio({
  initialProblems = CALIBRATED_EXPLANATION_PROBLEMS,
  onExportCards,
}: SelfExplanationStudioProps) {
  const [session, setSession] = useState(() => new SelfExplanationSession(initialProblems))
  const [activeTab, setActiveTab] = useState<StudioTab>('derivation_workbench')

  // User input states
  const [userText, setUserText] = useState<string>('')
  const [selectedRule, setSelectedRule] = useState<string | null>(null)
  const [selectedInversionId, setSelectedInversionId] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const sessionState = session.getState()
  const currentProblem = session.getCurrentProblem()
  const currentStep = session.getCurrentStep()
  const currentTelemetry = currentStep
    ? (sessionState.stepHistory[currentStep.stepId] ?? null)
    : null

  // Generated FSRS Cards
  const fsrsCards = useMemo(() => {
    return exportSelfExplanationToFSRSCards(session)
  }, [session, Object.keys(sessionState.stepHistory).length])

  // All available rules for active step (target rule + distractors shuffled)
  const availableRules = useMemo(() => {
    if (!currentStep) return []
    return [currentStep.governingRuleName, ...currentStep.distractorRules].sort()
  }, [currentStep])

  // Handle problem selection
  const handleSelectProblem = (id: string) => {
    hapticLight()
    session.selectProblem(id)
    setUserText('')
    setSelectedRule(null)
    setSelectedInversionId(null)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Handle step selection
  const handleSelectStep = (idx: number) => {
    hapticLight()
    session.selectStep(idx)
    const newStep = session.getCurrentStep()
    const hist = newStep ? sessionState.stepHistory[newStep.stepId] : null
    setUserText(hist ? sessionState.userJustificationText : '')
    setSelectedRule(null)
    setSelectedInversionId(null)
    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Handle rule click
  const handleRuleClick = (rule: string) => {
    hapticLight()
    setSelectedRule(rule)
    session.setRule(rule)
  }

  // Evaluate attempt
  const handleEvaluateAttempt = () => {
    if (!currentStep || !userText.trim()) return

    session.setRule(selectedRule)
    session.setJustificationText(userText.trim())
    session.setInversionOption(selectedInversionId)

    const telemetry = session.evaluateCurrentStep()

    if (telemetry.justificationType === 'principle_based' && telemetry.ruleNamingAccuracy) {
      hapticHeavy()
      playStudioAudio(784, 0.25, 'triangle') // G5 celebration chime
    } else if (telemetry.justificationType === 'goal_operator') {
      hapticMedium()
      playStudioAudio(659.25, 0.2, 'sine') // E5 chime
    } else {
      hapticLight()
      playStudioAudio(330, 0.2, 'sawtooth')
    }

    setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
  }

  // Advance to next step
  const handleAdvanceStep = () => {
    hapticMedium()
    const advanced = session.advanceToNextStep()
    if (advanced) {
      setUserText('')
      setSelectedRule(null)
      setSelectedInversionId(null)
      playStudioAudio(587.33, 0.15, 'sine')
      setSession(Object.assign(Object.create(Object.getPrototypeOf(session)), session))
    }
  }

  // Copy FSRS JSON
  const handleCopyCards = () => {
    hapticMedium()
    navigator.clipboard.writeText(JSON.stringify(fsrsCards, null, 2))
    setCopyStatus('Copied Self-Explanation JSON to clipboard!')
    setTimeout(() => setCopyStatus(null), 3000)
  }

  // Export to Review Engine
  const handleExportDeck = () => {
    hapticHeavy()
    if (onExportCards) {
      onExportCards(fsrsCards)
    }
    setCopyStatus(`Exported ${fsrsCards.length} explanation cards to review engine!`)
    setTimeout(() => setCopyStatus(null), 3500)
  }

  if (!currentProblem || !currentStep) return null

  return (
    <div className="flex flex-col gap-6">
      {/* Top HUD Telemetry */}
      <SelfExplanationHUD
        telemetry={currentTelemetry}
        currentStepNumber={currentStep.stepNumber}
        totalSteps={currentProblem.steps.length}
        activeRuleName={selectedRule ?? currentStep.governingRuleName}
      />

      {/* Main Studio Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-2">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={activeTab === 'derivation_workbench' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('derivation_workbench')
            }}
          >
            <Brain className="mr-1.5 h-4 w-4 text-primary" /> Derivation Workbench
          </Button>

          <Button
            variant={activeTab === 'schema_inversion' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('schema_inversion')
            }}
          >
            <Zap className="mr-1.5 h-4 w-4 text-amber-500" /> Boundary Inversion
          </Button>

          <Button
            variant={activeTab === 'proof_chain' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('proof_chain')
            }}
          >
            <Layers className="mr-1.5 h-4 w-4 text-emerald-500" /> Proof Chain
          </Button>

          <Button
            variant={activeTab === 'fsrs_deck' ? 'primary' : 'ghost'}
            onClick={() => {
              hapticLight()
              setActiveTab('fsrs_deck')
            }}
          >
            <Sparkles className="mr-1.5 h-4 w-4 text-violet-500" /> FSRS Deck ({fsrsCards.length})
          </Button>
        </div>

        {/* Problem Selector Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Derivation:</span>
          <select
            className="rounded-lg border border-border/80 bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            value={currentProblem.id}
            onChange={(e) => handleSelectProblem(e.target.value)}
          >
            {Object.keys(initialProblems).map((id) => (
              <option key={id} value={id}>
                {initialProblems[id]?.title ?? id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* WORKSPACE 1: DERIVATION WORKBENCH */}
      {activeTab === 'derivation_workbench' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Derivation Step & User Justification Input (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Step Selector Ribbon */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {currentProblem.steps.map((st, idx) => {
                const isSelected = idx === sessionState.currentStepIndex
                const isDone = Boolean(sessionState.stepHistory[st.stepId])
                return (
                  <button
                    key={st.stepId}
                    type="button"
                    onClick={() => handleSelectStep(idx)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                        : isDone
                          ? 'border-emerald-500/40 bg-card text-emerald-600 dark:text-emerald-400'
                          : 'border-border/60 bg-card text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    )}
                    <span>Step {st.stepNumber}</span>
                  </button>
                )
              })}
            </div>

            {/* Active Step Derivation Card */}
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Badge tone="cyan">Step {currentStep.stepNumber}</Badge>
                  <span className="text-xs font-semibold text-foreground">
                    {currentStep.ruleCategory.toUpperCase()} DERIVATION
                  </span>
                </div>
                <Badge tone="neutral">{currentProblem.domain.replace('_', ' ')}</Badge>
              </div>

              {/* Statement & Notation */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground/90 leading-relaxed">
                  {currentStep.claimOrStatement}
                </p>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 font-mono text-xs text-foreground tracking-wide overflow-x-auto">
                  {currentStep.mathematicalNotation}
                </div>
              </div>

              {/* Aleven & Koedinger (2002) Rule Naming Section */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-primary" /> Name the Governing Principle or
                  Invariant:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableRules.map((rule) => {
                    const isSelected = selectedRule === rule
                    return (
                      <button
                        key={rule}
                        type="button"
                        onClick={() => handleRuleClick(rule)}
                        className={`rounded-lg border p-2.5 text-left text-xs transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary/40'
                            : 'border-border/60 bg-card text-foreground hover:bg-muted/30'
                        }`}
                      >
                        {rule}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Free-Text Self-Explanation Input */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Generative Self-Explanation (Why is this step valid?):</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {userText.length} chars
                  </span>
                </label>
                <textarea
                  rows={4}
                  className="w-full rounded-xl border border-border/80 bg-background p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                  placeholder="Explain the causal mechanics: Because [axiom/invariant], this guarantees that [sub-goal consequence]..."
                  value={userText}
                  onChange={(e) => setUserText(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUserText('')
                    setSelectedRule(null)
                  }}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear
                </Button>

                <Button
                  variant="primary"
                  disabled={!userText.trim() || !selectedRule}
                  onClick={handleEvaluateAttempt}
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> Evaluate Justification
                </Button>
              </div>
            </Panel>
          </div>

          {/* Right Column: Feedback, Canonical Comparison & Deficiencies (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {currentTelemetry ? (
              <Panel className="p-5 border-l-4 border-l-primary space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentTelemetry.justificationType === 'principle_based' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    )}
                    <span className="text-sm font-semibold text-foreground">
                      {currentTelemetry.justificationType.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <Badge
                    tone={currentTelemetry.justificationDepthScore >= 75 ? 'success' : 'warning'}
                  >
                    {currentTelemetry.justificationDepthScore}/100 Depth
                  </Badge>
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed">
                  {currentTelemetry.feedbackMessage}
                </p>

                {/* Canonical Principle Comparison */}
                <div className="space-y-1.5 pt-2 border-t border-border/40">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                    Canonical Expert Principle Grounding:
                  </span>
                  <div className="rounded-lg bg-background p-3 text-xs text-foreground/90 border border-border/50 leading-relaxed">
                    <Markdown>{currentStep.canonicalPrincipleJustification}</Markdown>
                  </div>
                </div>

                {/* Sub-goal Purpose */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                    Mechanistic Sub-Goal (Catrambone 1998):
                  </span>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currentStep.goalOperatorPurpose}
                  </p>
                </div>

                {/* Deficiencies Checklist if any */}
                {currentTelemetry.identifiedDeficiencies.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border/30">
                    <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider">
                      Identified Reasoning Gaps:
                    </span>
                    <div className="space-y-1">
                      {currentTelemetry.identifiedDeficiencies.map((d, i) => (
                        <div
                          key={i}
                          className="rounded bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300"
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Advance Step Button */}
                {sessionState.currentStepIndex < currentProblem.steps.length - 1 && (
                  <Button variant="primary" className="w-full mt-2" onClick={handleAdvanceStep}>
                    Advance to Next Derivation Step <ChevronRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
              </Panel>
            ) : (
              <Panel className="p-5 flex flex-col items-center justify-center text-center space-y-3 min-h-[220px]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">Self-Explanation Primer</h4>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Select the governing rule and explain why this step holds. Merely rereading the
                  formula creates an illusion of competence; articulating the underlying axiom
                  builds durable schemas.
                </p>
              </Panel>
            )}

            {/* Theorem Overview Panel */}
            <Panel className="p-4 space-y-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                Full Theorem Statement
              </span>
              <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                {currentProblem.theoremStatement}
              </p>
            </Panel>
          </div>
        </div>
      )}

      {/* WORKSPACE 2: SCHEMA INVERSION & BOUNDARY CRUCIBLE */}
      {activeTab === 'schema_inversion' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Counterfactual Invariant Diagnostic (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <Panel className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Alexander Renkl (2002) Schema Inversion Test
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Test the boundary conditions: What breaks if the governing invariant is
                    violated?
                  </p>
                </div>
                <Badge tone="warning">
                  {currentStep.inversionChallenge.violationType.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>

              {/* Counterfactual Premise Box */}
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider">
                  Counterfactual Mutation Premise:
                </span>
                <p className="text-xs font-semibold text-foreground leading-relaxed">
                  {currentStep.inversionChallenge.counterfactualPremise}
                </p>
              </div>

              {/* Diagnostic Question */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-foreground">
                  {currentStep.inversionChallenge.diagnosticPrompt}
                </h5>

                {/* Multiple Choice Options */}
                <div className="space-y-2">
                  {currentStep.inversionChallenge.options.map((opt) => {
                    const isSelected = selectedInversionId === opt.id
                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          hapticLight()
                          setSelectedInversionId(opt.id)
                          session.setInversionOption(opt.id)
                        }}
                        className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                          isSelected
                            ? opt.isCorrect
                              ? 'border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/40'
                              : 'border-rose-500 bg-rose-500/10 shadow-xs ring-1 ring-rose-500/40'
                            : 'border-border/60 bg-card hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                              isSelected
                                ? opt.isCorrect
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-rose-500 bg-rose-500 text-white'
                                : 'border-muted-foreground/40'
                            }`}
                          >
                            {isSelected && (opt.isCorrect ? '✓' : '✕')}
                          </span>
                          <div className="space-y-1">
                            <p className="text-xs text-foreground font-medium leading-relaxed">
                              {opt.text}
                            </p>
                            {isSelected && (
                              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                                {opt.rationale}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Panel>
          </div>

          {/* Right Column: Failure Consequence & Necessary Conditions (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Panel className="p-4 space-y-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                Catastrophic Failure Consequence
              </span>
              <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                {currentStep.inversionChallenge.failureConsequence}
              </p>
            </Panel>

            <Panel className="p-4 space-y-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                Required Invariant
              </span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {currentStep.governingRuleName}
                </span>
                <Badge tone="cyan">{currentStep.ruleCategory.toUpperCase()}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Inversion testing forces recognition of necessary and sufficient conditions,
                preventing shallow pattern matching.
              </p>
            </Panel>
          </div>
        </div>
      )}

      {/* WORKSPACE 3: PROOF CHAIN VISUALIZER */}
      {activeTab === 'proof_chain' && (
        <div className="flex flex-col gap-4">
          <Panel className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Derivation Chain: {currentProblem.title}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Complete sequential progression from axioms to final theorem proof.
                </p>
              </div>
              <Badge tone="cyan">{currentProblem.steps.length} Sequential Steps</Badge>
            </div>

            {/* Proof Steps Timeline */}
            <div className="space-y-4 pt-2">
              {currentProblem.steps.map((st, idx) => {
                const telemetry = sessionState.stepHistory[st.stepId]
                const isSelected = idx === sessionState.currentStepIndex
                return (
                  <div
                    key={st.stepId}
                    onClick={() => {
                      hapticLight()
                      handleSelectStep(idx)
                      setActiveTab('derivation_workbench')
                    }}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary/40'
                        : 'border-border/60 bg-card hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {st.stepNumber}
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {st.governingRuleName}
                        </span>
                      </div>
                      {telemetry ? (
                        <Badge
                          tone={telemetry.justificationDepthScore >= 75 ? 'success' : 'warning'}
                        >
                          {telemetry.justificationDepthScore}/100 JDS
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Unverified</Badge>
                      )}
                    </div>

                    <p className="text-xs text-foreground/80 leading-relaxed mb-2">
                      {st.claimOrStatement}
                    </p>

                    <div className="rounded-lg bg-background p-2 font-mono text-[11px] text-foreground/90 border border-border/40">
                      {st.mathematicalNotation}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* WORKSPACE 4: FSRS REVIEW DECK & EXPORTER */}
      {activeTab === 'fsrs_deck' && (
        <div className="flex flex-col gap-4">
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  FSRS Self-Explanation &amp; Schema Inversion Review Deck
                </h4>
                <p className="text-xs text-muted-foreground">
                  Cards generated with initial stability scaled by the Chi Justification Depth
                  Index.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleCopyCards} disabled={fsrsCards.length === 0}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy JSON
                </Button>
                <Button
                  variant="primary"
                  onClick={handleExportDeck}
                  disabled={fsrsCards.length === 0}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export to Review Engine
                </Button>
              </div>
            </div>

            {copyStatus && (
              <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {copyStatus}
              </div>
            )}

            {/* Cards Grid */}
            {fsrsCards.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Brain className="h-6 w-6" />
                </div>
                <h5 className="text-sm font-semibold text-foreground">No Explanation Cards Yet</h5>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Complete derivation steps and self-explanations in the Derivation Workbench. Each
                  evaluated step synthesizes both a Rule-Naming and a Boundary Inversion card!
                </p>
                <Button
                  variant="primary"
                  onClick={() => {
                    hapticLight()
                    setActiveTab('derivation_workbench')
                  }}
                >
                  Start First Derivation Step <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {fsrsCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 shadow-2xs hover:border-primary/50 transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <Badge tone="violet">{card.tags[0]?.replace('-', ' ').toUpperCase()}</Badge>
                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          Initial S: {card.suggestedInitialStability}d
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                          Front Stimulus
                        </div>
                        <div className="text-xs text-foreground/90 font-medium">
                          <Markdown>{card.front}</Markdown>
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-border/30">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                          Back Explanation
                        </div>
                        <div className="text-xs text-foreground/80">
                          <Markdown>{card.back}</Markdown>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                      <div className="flex flex-wrap gap-1">
                        {card.tags.map((t) => (
                          <span key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                            #{t}
                          </span>
                        ))}
                      </div>
                      <span className="font-mono text-primary font-bold">
                        {card.metadata.retentionMultiplier}x Boost
                      </span>
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
