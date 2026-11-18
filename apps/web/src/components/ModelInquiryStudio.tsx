'use client'

import React, { useState } from 'react'
import {
  GEDANKEN_SCENARIOS,
  getGedankenScenario,
  perturbExtremeCase,
  simulateMentalAnimation,
  evaluateInquirySession,
  generateModelInquiryFsrsDeck,
  type GedankenScenario,
  type InquiryEvaluation,
  type GeneratedFSRSCard,
  type InquirySessionInput,
} from '@learning-hub/core/model-inquiry'
import { Panel } from '@/ui/Panel'
import { Button } from '@/ui/Button'
import { TextArea } from '@/ui/Field'
import { ModelInquiryHUD } from '@/ui/ModelInquiryHUD'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Layers,
  Maximize2,
  PlayCircle,
  Sparkles,
  Telescope,
  TrendingUp,
} from 'lucide-react'

export function ModelInquiryStudio() {
  const [activeScenario, setActiveScenario] = useState<GedankenScenario>(GEDANKEN_SCENARIOS[0]!)
  const [activePhase, setActivePhase] = useState<
    'initial_model' | 'extreme_perturbation' | 'simulative_animation' | 'bridging_synthesis'
  >('initial_model')

  // Phase 1: Initial Model state
  const [initialNotes, setInitialNotes] = useState<string>(
    'Initial intuitive intuition: heavy objects have more gravitational mass pulling them toward Earth, which seems like it should overcome inertia faster.',
  )

  // Phase 2: Extreme Case state
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    activeScenario.extremeCases[0]?.id || '',
  )
  const [casePredictions, setCasePredictions] = useState<Record<string, string>>({
    ec_feather_cannonball:
      'In a vacuum, the feather exerts zero aerodynamic drag; the composite falls at the exact same rate as the cannonball alone.',
    ec_split_identical_halves:
      'Two identical halves fall with identical velocity whether connected or separated by a vacuum.',
    ec_vacuum_medium: 'Removing the medium eliminates differential air resistance entirely.',
  })
  const [perturbationResults, setPerturbationResults] = useState<
    Record<string, { behavior: string; consequence: string }>
  >({})

  // Phase 3: Mental Animation state
  const [orderedStepIds, setOrderedStepIds] = useState<string[]>(
    activeScenario.simulativeSteps.map((s) => s.id),
  )
  const [simResults, setSimResults] = useState<{
    fidelity: number
    observations: string[]
    contradictions: string[]
  } | null>(null)

  // Phase 4: Bridging & Synthesis state
  const [selectedBridgeId, setSelectedBridgeId] = useState<string>(
    activeScenario.bridgingAnalogies[0]?.id || '',
  )
  const [bridgingExplanation, setBridgingExplanation] = useState<string>(
    'The symmetrical mass distribution of two adjacent identical bricks anchors the structural invariance: connecting them with a microscopic thread cannot change their downward acceleration.',
  )
  const [revisedHypothesis, setRevisedHypothesis] = useState<string>(
    'Gravitational mass equals inertial mass; all objects experience identical gravitational acceleration g = F/m regardless of total mass in the absence of aerodynamic drag.',
  )

  // Evaluation & Deck export state
  const [evaluation, setEvaluation] = useState<InquiryEvaluation | null>(null)
  const [generatedDeck, setGeneratedDeck] = useState<GeneratedFSRSCard[] | null>(null)
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false)

  // Handle scenario switch
  const handleSelectScenario = (scenario: GedankenScenario) => {
    setActiveScenario(scenario)
    setActivePhase('initial_model')
    setSelectedCaseId(scenario.extremeCases[0]?.id || '')
    setSelectedBridgeId(scenario.bridgingAnalogies[0]?.id || '')
    setOrderedStepIds(scenario.simulativeSteps.map((s) => s.id))
    setPerturbationResults({})
    setSimResults(null)
    setEvaluation(null)
    setGeneratedDeck(null)
    // Scenario switch must clear per-scenario evaluation inputs — the stale
    // Galileo predictions/bridging text otherwise leak into the new
    // scenario's ECDI and bridging-analogy scores.
    setCasePredictions({})
    setBridgingExplanation('')

    // Reset default text based on scenario
    if (scenario.id === 'galileo_falling_bodies') {
      setInitialNotes(
        'Initial intuition: heavier cannonball should fall faster than a light wooden ball.',
      )
      setRevisedHypothesis(
        'Gravitational mass equals inertial mass; all objects experience identical gravitational acceleration g = F/m regardless of total mass.',
      )
    } else if (scenario.id === 'maxwells_demon_entropy') {
      setInitialNotes(
        'Initial intuition: a frictionless microscopic trapdoor requires zero energy to sort particles.',
      )
      setRevisedHypothesis(
        "Landauer's Principle: Information is physical; resetting memory dissipates minimum heat k_B * T * ln(2), conserving the Second Law.",
      )
    } else if (scenario.id === 'einsteins_light_chaser') {
      setInitialNotes(
        'Initial intuition: running at velocity c should let you see a static frozen electromagnetic wave.',
      )
      setRevisedHypothesis(
        'Light speed c is invariant in all reference frames; Maxwell equations require dynamic induction; gravity curves spacetime.',
      )
    } else if (scenario.id === 'darwins_natural_selection') {
      setInitialNotes(
        'Initial intuition: purposeful adaptation requires either conscious striving or an external designer.',
      )
      setRevisedHypothesis(
        'Variation + Heritability + Differential Reproductive Fitness acts as an algorithmic environmental sieve across deep time.',
      )
    } else {
      setInitialNotes(
        'Initial intuition: any well-defined deterministic computer program can be analyzed for termination.',
      )
      setRevisedHypothesis(
        'Reductio ad absurdum via diagonal self-reference proves undecidability of the Halting Problem and formal computation limits.',
      )
    }
  }

  // Trigger Extreme Case Perturbation
  const handleRunPerturbation = (caseId: string) => {
    const res = perturbExtremeCase(activeScenario.id, caseId)
    if (res.valid) {
      setPerturbationResults((prev) => ({
        ...prev,
        [caseId]: {
          behavior: res.asymptoticBehavior,
          consequence: res.consequence,
        },
      }))
    }
  }

  // Trigger Simulative Mental Animation
  const handleRunSimulation = () => {
    const sim = simulateMentalAnimation(activeScenario.id, orderedStepIds)
    setSimResults({
      fidelity: sim.fidelityScore,
      observations: sim.observations,
      contradictions: sim.contradictionsExposed,
    })
  }

  // Trigger Full Session Evaluation & FSRS Generation
  const handleRunEvaluation = () => {
    setIsEvaluating(true)
    const input: InquirySessionInput = {
      scenarioId: activeScenario.id,
      initialModelNotes: initialNotes,
      selectedExtremeCaseIds:
        Object.keys(perturbationResults).length > 0
          ? Object.keys(perturbationResults)
          : activeScenario.extremeCases.map((e) => e.id),
      extremeCasePredictions: casePredictions,
      simulativeStepOrder: orderedStepIds,
      identifiedContradictions: simResults?.contradictions || [
        'Paradoxical branch contradiction revealed in thought experiment',
      ],
      selectedBridgingId: selectedBridgeId,
      bridgingExplanation: bridgingExplanation,
      revisedModelHypothesis: revisedHypothesis,
    }

    const evalResult = evaluateInquirySession(input)
    setEvaluation(evalResult)

    const deck = generateModelInquiryFsrsDeck(activeScenario.id, evalResult)
    setGeneratedDeck(deck)
    setIsEvaluating(false)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-500 font-semibold text-xs tracking-wider uppercase">
            <Telescope className="h-4 w-4" />
            Model-Based Inquiry & Gedankenexperiment Studio
          </div>
          <h1 className="text-2xl font-extrabold text-strong mt-1">
            Gedankenexperiment Simulation Workbench
          </h1>
          <p className="text-sm text-secondary mt-1">
            Grounded in Clement (2008), Nersessian (2002), and Johnson-Laird (1983). Construct,
            perturb, and evolve explanatory mental models.
          </p>
        </div>

        {/* Scenario Selector Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-tertiary">Scenario:</span>
          <select
            value={activeScenario.id}
            onChange={(e) => {
              const found = getGedankenScenario(e.target.value)
              if (found) handleSelectScenario(found)
            }}
            className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-semibold text-strong focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {GEDANKEN_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Real-Time Telemetry HUD if evaluated, or preview banner */}
      {evaluation ? (
        <ModelInquiryHUD
          evaluation={evaluation}
          scenarioTitle={activeScenario.title}
          activePhase={activePhase}
        />
      ) : (
        <Panel className="border-l-4 border-l-indigo-500/60 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase font-semibold text-tertiary">
                {activeScenario.historicalOrigin}
              </div>
              <h2 className="text-base font-bold text-strong mt-0.5">
                Target: {activeScenario.targetPhenomenon}
              </h2>
              <p className="text-xs text-secondary mt-1">
                Folk Intuition Barrier: &ldquo;{activeScenario.folkConception}&rdquo;
              </p>
            </div>
            <Button
              onClick={handleRunEvaluation}
              variant="primary"
              className="whitespace-nowrap flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Sparkles className="h-4 w-4" />
              Run Model Evaluation
            </Button>
          </div>
        </Panel>
      )}

      {/* 4-Phase Interactive Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 overflow-x-auto">
        <button
          onClick={() => setActivePhase('initial_model')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
            activePhase === 'initial_model'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
              : 'text-secondary hover:text-strong'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          1. Initial Model (M0)
        </button>

        <button
          onClick={() => setActivePhase('extreme_perturbation')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
            activePhase === 'extreme_perturbation'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
              : 'text-secondary hover:text-strong'
          }`}
        >
          <Maximize2 className="h-4 w-4" />
          2. Extreme Cases (EC)
        </button>

        <button
          onClick={() => setActivePhase('simulative_animation')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
            activePhase === 'simulative_animation'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
              : 'text-secondary hover:text-strong'
          }`}
        >
          <PlayCircle className="h-4 w-4" />
          3. Mental Simulation (SAF)
        </button>

        <button
          onClick={() => setActivePhase('bridging_synthesis')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
            activePhase === 'bridging_synthesis'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
              : 'text-secondary hover:text-strong'
          }`}
        >
          <GitBranch className="h-4 w-4" />
          4. Bridging & Canonical (Mk+1)
        </button>
      </div>

      {/* Phase 1: Initial Mental Model & Assumptions */}
      {activePhase === 'initial_model' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Panel className="space-y-4">
            <h3 className="text-base font-bold text-strong flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-500" />
              Folk Model & Initial Assumptions
            </h3>
            <p className="text-xs text-secondary leading-relaxed">
              Before perturbing the system with Gedankenexperimente, articulate the intuitive
              baseline assumptions that form the naive mental model:
            </p>

            <div className="space-y-2">
              {activeScenario.initialModelAssumptions.map((assumption, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs text-secondary flex items-start gap-2.5"
                >
                  <span className="font-bold text-tertiary">#{idx + 1}</span>
                  <span>{assumption}</span>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
              <span className="font-semibold">Intuitive Barrier: </span>
              {activeScenario.folkConception}
            </div>
          </Panel>

          <Panel className="space-y-4">
            <h3 className="text-base font-bold text-strong flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Your Initial Model Formulation (M0)
            </h3>
            <p className="text-xs text-secondary">
              Record your initial mechanistic explanation before running thought experiment boundary
              perturbations:
            </p>
            <TextArea
              label="Initial Mechanistic Model"
              value={initialNotes}
              onChange={(e) => setInitialNotes(e.target.value)}
              rows={6}
              placeholder="Explain how you currently imagine the physical or logical mechanism operating..."
              className="w-full text-xs"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => setActivePhase('extreme_perturbation')}
                variant="primary"
                className="flex items-center gap-1.5"
              >
                Proceed to Extreme Cases
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* Phase 2: Extreme Case Perturbation */}
      {activePhase === 'extreme_perturbation' && (
        <div className="space-y-6">
          <Panel className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-strong flex items-center gap-2">
                  <Maximize2 className="h-4 w-4 text-amber-500" />
                  Extreme Case Perturbation Workbench
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Perturb variables to their mathematical limits ($m \to 0$, $v \to c$, $\mu \to 0$)
                  to isolate causal invariants (Clement 2008).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeScenario.extremeCases.map((ec) => {
                const isSelected = selectedCaseId === ec.id
                const hasRun = Boolean(perturbationResults[ec.id])

                return (
                  <div
                    key={ec.id}
                    onClick={() => setSelectedCaseId(ec.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-indigo-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-strong">{ec.name}</span>
                      {hasRun && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </div>
                    <div className="text-[11px] text-tertiary mt-1">Unit: {ec.unit}</div>
                    <div className="mt-2 text-xs space-y-1">
                      <div className="text-secondary">
                        <span className="text-tertiary">Baseline: </span>
                        {ec.baselineValue}
                      </div>
                      <div className="font-semibold text-amber-600 dark:text-amber-400">
                        <span className="text-tertiary">Extreme Limit: </span>
                        {ec.extremeLimit}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* Active Extreme Case Detail & Prediction */}
          {selectedCaseId && (
            <Panel className="space-y-4 border-l-4 border-l-amber-500">
              {(() => {
                const ec = activeScenario.extremeCases.find((e) => e.id === selectedCaseId)
                if (!ec) return null
                const result = perturbationResults[ec.id]

                return (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-bold text-strong">{ec.name}</h4>
                        <p className="text-xs text-secondary mt-0.5">
                          Intuitive Expectation: &ldquo;{ec.intuitiveExpectation}&rdquo;
                        </p>
                      </div>
                      <Button
                        onClick={() => handleRunPerturbation(ec.id)}
                        variant="primary"
                        className="flex items-center gap-1.5 self-start sm:self-auto"
                      >
                        <PlayCircle className="h-4 w-4" />
                        Execute Asymptotic Run
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <TextArea
                        label="Predict boundary limit outcome"
                        value={casePredictions[ec.id] || ''}
                        onChange={(e) =>
                          setCasePredictions({
                            ...casePredictions,
                            [ec.id]: e.target.value,
                          })
                        }
                        rows={2}
                        placeholder="State what the physical outcome must be when this variable is pushed to the limit..."
                        className="w-full text-xs"
                      />
                    </div>

                    {result && (
                      <div className="p-3.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                          <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                          {result.behavior}
                        </div>
                        <div className="text-xs text-secondary leading-relaxed">
                          <span className="font-semibold text-strong">
                            Asymptotic Consequence:{' '}
                          </span>
                          {result.consequence}
                        </div>
                        <div className="text-[11px] text-tertiary">
                          <span className="font-semibold">Explanation: </span>
                          {ec.scientificExplanation}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </Panel>
          )}

          <div className="flex justify-between items-center">
            <Button
              onClick={() => setActivePhase('initial_model')}
              variant="secondary"
              className="text-xs"
            >
              Back to Initial Model
            </Button>
            <Button
              onClick={() => setActivePhase('simulative_animation')}
              variant="primary"
              className="flex items-center gap-1.5 text-xs"
            >
              Proceed to Simulative Animation
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Phase 3: Dynamic Mental Animation & Contradiction Crucible */}
      {activePhase === 'simulative_animation' && (
        <div className="space-y-6">
          <Panel className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-strong flex items-center gap-2">
                  <PlayCircle className="h-4 w-4 text-sky-500" />
                  Simulative Mental Animation (Johnson-Laird 1983)
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Step-by-step kinetic animation of internal mechanisms; identifying conceptual
                  contradictions.
                </p>
              </div>
              <Button
                onClick={handleRunSimulation}
                variant="primary"
                className="flex items-center gap-1.5 self-start sm:self-auto"
              >
                <PlayCircle className="h-4 w-4" />
                Run Simulative Step-Through
              </Button>
            </div>

            <div className="space-y-3">
              {activeScenario.simulativeSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-500 flex items-center gap-1.5">
                      <span className="h-5 w-5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[11px] font-bold">
                        {idx + 1}
                      </span>
                      Step {step.stepOrder}
                    </span>
                    {step.revealedContradiction && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-rose-500" />
                        Crucible Step
                      </span>
                    )}
                  </div>

                  <div className="text-xs font-semibold text-strong">{step.action}</div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="p-2 rounded bg-[var(--bg-subtle)] text-secondary">
                      <span className="font-semibold text-tertiary">Causal Mechanism: </span>
                      {step.causalMechanism}
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-subtle)] text-secondary">
                      <span className="font-semibold text-tertiary">Expected Observation: </span>
                      {step.expectedObservation}
                    </div>
                  </div>

                  {step.revealedContradiction && (
                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-400 font-medium">
                      <span className="font-bold">Contradiction Crucible: </span>
                      {step.revealedContradiction}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {simResults && (
              <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-500/10 space-y-2 mt-4">
                <div className="flex items-center justify-between text-xs font-bold text-sky-700 dark:text-sky-300">
                  <span>Mental Simulation Completed</span>
                  <span>Fidelity: {simResults.fidelity}%</span>
                </div>
                <div className="text-xs text-secondary leading-relaxed">
                  Revealed {simResults.contradictions.length} internal contradiction(s) in folk
                  model. The model must now be modified using bridging analogies.
                </div>
              </div>
            )}
          </Panel>

          <div className="flex justify-between items-center">
            <Button
              onClick={() => setActivePhase('extreme_perturbation')}
              variant="secondary"
              className="text-xs"
            >
              Back to Extreme Cases
            </Button>
            <Button
              onClick={() => setActivePhase('bridging_synthesis')}
              variant="primary"
              className="flex items-center gap-1.5 text-xs"
            >
              Proceed to Bridging & Canonical Model
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Phase 4: Bridging Analogy & Canonical Model Modification */}
      {activePhase === 'bridging_synthesis' && (
        <div className="space-y-6">
          <Panel className="space-y-4">
            <h3 className="text-base font-bold text-strong flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-purple-500" />
              Bridging Analogy Construction (Clement 2008)
            </h3>
            <p className="text-xs text-secondary">
              Connect an undeniable intuitive anchor to the counter-intuitive target domain via
              intermediate stepping-stone analogies:
            </p>

            <div className="space-y-4">
              {activeScenario.bridgingAnalogies.map((bridge) => {
                const isSelected = selectedBridgeId === bridge.id

                return (
                  <div
                    key={bridge.id}
                    onClick={() => setSelectedBridgeId(bridge.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all space-y-3 ${
                      isSelected
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-purple-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-strong">Analogical Bridge</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-purple-500" />}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-[var(--bg-subtle)] space-y-1">
                        <div className="text-[10px] uppercase font-bold text-tertiary">
                          Anchor Intuition
                        </div>
                        <div className="text-secondary leading-relaxed">
                          {bridge.anchorIntuition}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                        <div className="text-[10px] uppercase font-bold text-indigo-500">
                          Intermediate Stepping-Stone
                        </div>
                        <div className="text-strong leading-relaxed font-medium">
                          {bridge.intermediateBridge}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[var(--bg-subtle)] space-y-1">
                        <div className="text-[10px] uppercase font-bold text-tertiary">
                          Target System
                        </div>
                        <div className="text-secondary leading-relaxed">{bridge.targetSystem}</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-secondary">
                      <span className="font-semibold text-strong">
                        Resolving Structural Insight:{' '}
                      </span>
                      {bridge.resolvingInsight}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="space-y-1.5 pt-2">
              <TextArea
                label="Explain how this bridging analogy maps onto the target system"
                value={bridgingExplanation}
                onChange={(e) => setBridgingExplanation(e.target.value)}
                rows={2}
                className="w-full text-xs"
              />
            </div>
          </Panel>

          {/* Canonical Resolution & Revised Model Hypothesis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Panel className="space-y-4 border-l-4 border-l-emerald-500">
              <h3 className="text-base font-bold text-strong flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Canonical Resolution: {activeScenario.canonicalResolution.title}
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                {activeScenario.canonicalResolution.mechanism}
              </p>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-tertiary uppercase tracking-wider">
                  Key Invariant Principles:
                </span>
                {activeScenario.canonicalResolution.keyPrinciples.map((prin, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs text-secondary flex items-start gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{prin}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="space-y-4">
              <h3 className="text-base font-bold text-strong flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                Synthesize Revised Model (Mk+1)
              </h3>
              <p className="text-xs text-secondary">
                Articulate your revised causal model incorporating the extreme cases, resolved
                contradictions, and canonical principles:
              </p>
              <TextArea
                label="Revised Causal Model (Mk+1)"
                value={revisedHypothesis}
                onChange={(e) => setRevisedHypothesis(e.target.value)}
                rows={5}
                className="w-full text-xs"
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  onClick={handleRunEvaluation}
                  variant="primary"
                  disabled={isEvaluating}
                  className="flex items-center gap-1.5 text-xs font-bold"
                >
                  <Sparkles className="h-4 w-4" />
                  Evaluate & Generate FSRS Deck
                </Button>
              </div>
            </Panel>
          </div>

          {/* Generated FSRS-6 Deck Preview */}
          {generatedDeck && (
            <Panel className="space-y-4 border-l-4 border-l-indigo-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-strong flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-500" />
                    Calibrated FSRS-6 Review Deck ({generatedDeck.length} Cards)
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    Cards anchored to identified thought experiment contradictions, boundary cases,
                    and bridging analogs.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {generatedDeck.map((card) => (
                  <div
                    key={card.id}
                    className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-tertiary">
                      <span className="font-mono">{card.id}</span>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold">
                        Difficulty: {card.initialDifficulty}/10
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-strong">{card.front}</div>

                    <div className="p-2.5 rounded bg-[var(--bg-subtle)] text-xs text-secondary leading-relaxed border border-[var(--border-subtle)]">
                      {card.back}
                    </div>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {card.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-subtle)] text-tertiary"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <div className="flex justify-between items-center">
            <Button
              onClick={() => setActivePhase('simulative_animation')}
              variant="secondary"
              className="text-xs"
            >
              Back to Simulative Animation
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
