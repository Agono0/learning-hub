/**
 * Learning HUB — Productive Failure & Canonical Consolidation Studio
 *
 * Implements interactive two-phase Productive Failure learning grounded in:
 * 1. Manu Kapur (2008, 2012, 2016) - Unguided generation followed by canonical consolidation
 * 2. Tanmay Sinha & Manu Kapur (2021) - Explanatory predictor model of Productive Failure
 * 3. Katharina Loibl, Ido Roll & Nikol Rummel (2017) - Problem solving prior to instruction
 * 4. Free Spaced Repetition Scheduler (FSRS-6) integration
 */

import React, { useId, useMemo, useState } from 'react'
import {
  calculatePFMetrics,
  evaluateStudentRepresentation,
  generatePFFSRSCards,
  getCanonicalPFScenarios,
  type ImpasseAnalysis,
  type PFMetrics,
  type PFScenario,
  type StudentGeneratedRepresentation,
} from '@learning-hub/core/productive-failure'
import { Badge, Button, Panel, ProductiveFailureHUD, Tabs } from '@/ui'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Download,
  Flame,
  HelpCircle,
  Layers,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react'

export function ProductiveFailureStudio() {
  const [activeTab, setActiveTab] = useState<
    'exploration' | 'impasse' | 'consolidation' | 'transfer'
  >('exploration')

  // --- Scenario Selection ---
  const canonicalScenarios = useMemo(() => getCanonicalPFScenarios(), [])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(canonicalScenarios[0].id)
  const scenario: PFScenario = useMemo(() => {
    return canonicalScenarios.find((s) => s.id === selectedScenarioId) || canonicalScenarios[0]
  }, [canonicalScenarios, selectedScenarioId])

  // --- 1. Exploration & Generation State ---
  const [userRepresentations, setUserRepresentations] = useState<StudentGeneratedRepresentation[]>(
    [],
  )
  const [customTitle, setCustomTitle] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [customMechanism, setCustomMechanism] = useState('')
  const [customFeatures, setCustomFeatures] = useState('')
  const [activeExemplarId, setActiveExemplarId] = useState<string | null>(null)

  // --- 2. Impasse Analysis State ---
  const impasseEncountered = true
  const [failureMode, setFailureMode] = useState<string>('')
  const [testedBoundaries, setTestedBoundaries] = useState<string[]>([])
  const [knowledgeGap, setKnowledgeGap] = useState<string>('')
  const [affectiveRating, setAffectiveRating] = useState<number>(4)
  const [impasseDepth, setImpasseDepth] = useState<number>(75)

  // --- 3. Canonical Consolidation State ---
  const [featureAlignment, setFeatureAlignment] = useState<number>(85)
  const [parameterMapping, setParameterMapping] = useState<number>(80)
  const [invariantGrasp, setInvariantGrasp] = useState<number>(85)

  // --- 4. Adaptive Transfer State ---
  const [transferAnswers, setTransferAnswers] = useState<Record<string, string>>({})
  const [transferSubmitted, setTransferSubmitted] = useState<Record<string, boolean>>({})
  const [transferConfidences, setTransferConfidences] = useState<Record<string, number>>({})

  // --- 5. FSRS Deck State ---
  const [flippedCardIdx, setFlippedCardIdx] = useState<number | null>(null)
  const [deckExported, setDeckExported] = useState<boolean>(false)

  // Accessible IDs
  const titleInputId = useId()
  const descInputId = useId()
  const mechInputId = useId()
  const featInputId = useId()
  const failureInputId = useId()
  const gapInputId = useId()

  // Pre-load initial exemplar representations if empty
  const activeRepresentations: StudentGeneratedRepresentation[] = useMemo(() => {
    if (userRepresentations.length > 0) {
      return userRepresentations
    }
    return scenario.exemplarStudentRepresentations.slice(0, 2)
  }, [userRepresentations, scenario.exemplarStudentRepresentations])

  // --- Handlers ---
  const handleAddCustomRepresentation = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customTitle.trim()) return

    const parsedFeatures = customFeatures
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)

    const newRep = evaluateStudentRepresentation(scenario.id, {
      title: customTitle,
      description: customDescription,
      mechanism: customMechanism,
      structuralFeatures: parsedFeatures,
    })

    setUserRepresentations((prev) => [...prev, newRep])
    setCustomTitle('')
    setCustomDescription('')
    setCustomMechanism('')
    setCustomFeatures('')
  }

  const handleLoadExemplar = (rep: StudentGeneratedRepresentation) => {
    setActiveExemplarId(rep.id)
    if (!userRepresentations.some((r) => r.id === rep.id)) {
      setUserRepresentations((prev) => [...prev, rep])
    }
  }

  const handleToggleBoundary = (boundary: string) => {
    setTestedBoundaries((prev) =>
      prev.includes(boundary) ? prev.filter((b) => b !== boundary) : [...prev, boundary],
    )
  }

  const handleSelectTransferOption = (probeId: string, optionId: string) => {
    if (transferSubmitted[probeId]) return
    setTransferAnswers((prev) => ({ ...prev, [probeId]: optionId }))
    if (!transferConfidences[probeId]) {
      setTransferConfidences((prev) => ({ ...prev, [probeId]: 4 }))
    }
  }

  const handleSubmitTransferProbe = (probeId: string) => {
    setTransferSubmitted((prev) => ({ ...prev, [probeId]: true }))
  }

  const handleResetScenario = () => {
    setUserRepresentations([])
    setCustomTitle('')
    setCustomDescription('')
    setCustomMechanism('')
    setCustomFeatures('')
    setActiveExemplarId(null)
    setFailureMode('')
    setTestedBoundaries([])
    setKnowledgeGap('')
    setAffectiveRating(4)
    setImpasseDepth(75)
    setTransferAnswers({})
    setTransferSubmitted({})
    setTransferConfidences({})
    setFlippedCardIdx(null)
    setDeckExported(false)
  }

  // --- Dynamic Cognitive Metrics ---
  const metrics: PFMetrics = useMemo(() => {
    const impasseData: ImpasseAnalysis = {
      impasseEncountered,
      failureModeIdentified:
        failureMode || 'Recognized heuristic breakdown under non-standard distributions',
      boundaryConditionsTested:
        testedBoundaries.length > 0 ? testedBoundaries : ['Outlier distortion', 'Zero deviation'],
      knowledgeGapArticulated:
        knowledgeGap || 'Identified need for smooth quadratic invariance without sign cancellation',
      affectiveImpasseRating: affectiveRating,
      impasseDepthScore: impasseDepth,
    }

    const transferResults = scenario.transferProbes.map((probe) => {
      const selectedId = transferAnswers[probe.probeId]
      const submitted = transferSubmitted[probe.probeId]
      const isCorrect =
        submitted && probe.options.find((o) => o.id === selectedId)?.isCorrect === true
      const confidence = transferConfidences[probe.probeId] || 3
      return {
        probeId: probe.probeId,
        isCorrect: Boolean(isCorrect),
        confidence,
      }
    })

    return calculatePFMetrics({
      representations: activeRepresentations,
      impasse: impasseData,
      consolidationRatings: {
        featureAlignment,
        parameterMapping,
        invariantGrasp,
      },
      transferResults,
    })
  }, [
    activeRepresentations,
    impasseEncountered,
    failureMode,
    testedBoundaries,
    knowledgeGap,
    affectiveRating,
    impasseDepth,
    featureAlignment,
    parameterMapping,
    invariantGrasp,
    scenario.transferProbes,
    transferAnswers,
    transferSubmitted,
    transferConfidences,
  ])

  // --- Calibrated Spaced Repetition Cards ---
  const fsrsCards = useMemo(() => {
    return generatePFFSRSCards(scenario, metrics)
  }, [scenario, metrics])

  const handleExportDeck = () => {
    setDeckExported(true)
    setTimeout(() => setDeckExported(false), 3000)
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6">
      {/* Real-time Telemetry HUD */}
      <ProductiveFailureHUD metrics={metrics} activeScenarioTitle={scenario.title} />

      {/* Main Studio Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
        {/* Scenario Switcher */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="scenario-select"
            className="text-xs font-semibold text-secondary whitespace-nowrap"
          >
            Domain Challenge:
          </label>
          <select
            id="scenario-select"
            value={selectedScenarioId}
            onChange={(e) => {
              setSelectedScenarioId(e.target.value)
              handleResetScenario()
            }}
            className="text-xs font-medium rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-strong px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {canonicalScenarios.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.title} ({sc.domain})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={handleResetScenario}
            className="text-xs px-2.5 py-1 text-secondary flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Trajectory
          </Button>
        </div>
      </div>

      {/* Tabs Interface */}
      <Tabs
        label="Productive Failure Phases"
        value={activeTab}
        onChange={(k) =>
          setActiveTab(k as 'exploration' | 'impasse' | 'consolidation' | 'transfer')
        }
        items={[
          {
            key: 'exploration',
            label: '1. Exploration & Generation',
          },
          {
            key: 'impasse',
            label: '2. Impasse Crucible',
          },
          {
            key: 'consolidation',
            label: '3. Canonical Consolidation',
          },
          {
            key: 'transfer',
            label: '4. Adaptive Transfer & Cards',
          },
        ]}
      />

      {/* TAB 1: UNGUIDED EXPLORATION & GENERATION */}
      {activeTab === 'exploration' && (
        <div className="space-y-6">
          {/* Challenge Brief Panel */}
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-600 dark:text-amber-400">
                  Phase 1: Unguided Problem Solving
                </span>
                <h2 className="text-base font-bold text-strong">{scenario.title}</h2>
                <p className="text-xs text-secondary">{scenario.subtitle}</p>
              </div>
              <Badge tone="accent" className="text-xs">
                {scenario.domain}
              </Badge>
            </div>

            <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2)/60 border border-neutral-200 dark:border-(--hub-border) space-y-2">
              <span className="text-xs font-semibold text-strong flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                The First-Principles Challenge
              </span>
              <p className="text-xs text-secondary leading-relaxed whitespace-pre-line font-sans">
                {scenario.challengePrompt}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-secondary">
                Intuitive Heuristic Starters (Prior Knowledge Activation):
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {scenario.intuitiveStarterPrompts.map((prompt, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-xs text-secondary flex items-start gap-2"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{prompt}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Student Representations Showcase & Builder */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Exemplar Intuitive Representations from Cognitive Research */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  Canonical Student Hypotheses (Kapur 2012)
                </h3>
                <span className="text-xs text-tertiary">Click to adopt & inspect</span>
              </div>

              <div className="space-y-3">
                {scenario.exemplarStudentRepresentations.map((rep) => {
                  const isAdopted =
                    activeRepresentations.some((r) => r.id === rep.id) ||
                    activeExemplarId === rep.id
                  return (
                    <Panel
                      key={rep.id}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isAdopted
                          ? 'border-indigo-500/50 bg-indigo-50/20 dark:bg-indigo-950/20'
                          : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) hover:border-neutral-300'
                      }`}
                      onClick={() => handleLoadExemplar(rep)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-strong">{rep.title}</h4>
                            {isAdopted && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold">
                                Active in Model
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-secondary mt-1">{rep.description}</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-strong shrink-0">
                          {rep.intuitivePlausibilityScore}% plausibility
                        </span>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-(--hub-border)/60 space-y-1.5">
                        <div className="text-[11px] text-tertiary">
                          <strong className="text-secondary">Mechanism: </strong>
                          <code className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2) font-mono text-[10px]">
                            {rep.mechanism}
                          </code>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {rep.structuralFeaturesIdentified.map((f, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary"
                            >
                              #{f}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Panel>
                  )
                })}
              </div>
            </div>

            {/* Right: Author Custom Student Representation */}
            <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
              <div className="border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Generate Your Own Solution Model
                </h3>
                <p className="text-xs text-secondary">
                  Invent a mathematical heuristic or architectural algorithm from scratch.
                </p>
              </div>

              <form onSubmit={handleAddCustomRepresentation} className="space-y-3">
                <div>
                  <label
                    htmlFor={titleInputId}
                    className="block text-xs font-medium text-secondary mb-1"
                  >
                    Model / Metric Name:
                  </label>
                  <input
                    id={titleInputId}
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Mean Deviation with Absolute Values"
                    className="w-full text-xs rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2) text-strong px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor={descInputId}
                    className="block text-xs font-medium text-secondary mb-1"
                  >
                    Conceptual Hypothesis:
                  </label>
                  <textarea
                    id={descInputId}
                    rows={2}
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    placeholder="Describe the intuition behind your approach..."
                    className="w-full text-xs rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2) text-strong px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor={mechInputId}
                    className="block text-xs font-medium text-secondary mb-1"
                  >
                    Formal Mechanism / Formula:
                  </label>
                  <input
                    id={mechInputId}
                    type="text"
                    value={customMechanism}
                    onChange={(e) => setCustomMechanism(e.target.value)}
                    placeholder="e.g. Metric = Σ|x_i - μ| / N"
                    className="w-full text-xs rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2) text-strong px-3 py-2 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor={featInputId}
                    className="block text-xs font-medium text-secondary mb-1"
                  >
                    Structural Features (comma-separated):
                  </label>
                  <input
                    id={featInputId}
                    type="text"
                    value={customFeatures}
                    onChange={(e) => setCustomFeatures(e.target.value)}
                    placeholder="e.g. symmetry, outlier penalty, differentiability"
                    className="w-full text-xs rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2) text-strong px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!customTitle.trim()}
                    className="w-full text-xs py-2 flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Add Hypothesis to Trajectory
                  </Button>
                </div>
              </form>

              {userRepresentations.length > 0 && (
                <div className="pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
                  <span className="text-xs font-semibold text-secondary">
                    Your Registered Hypotheses ({userRepresentations.length}):
                  </span>
                  <div className="mt-2 space-y-1.5">
                    {userRepresentations.map((r) => (
                      <div
                        key={r.id}
                        className="p-2 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) text-xs flex items-center justify-between text-strong"
                      >
                        <span className="font-medium truncate">{r.title}</span>
                        <span className="text-[10px] text-tertiary font-mono">
                          {r.structuralFeaturesIdentified.join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* Phase 1 Completion Next Step CTA */}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => setActiveTab('impasse')}
              className="text-xs px-4 py-2 flex items-center gap-1.5"
            >
              Proceed to Impasse Crucible
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* TAB 2: IMPASSE CRUCIBLE & BOUNDARY STRESS-TESTING */}
      {activeTab === 'impasse' && (
        <div className="space-y-6">
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-rose-600 dark:text-rose-400">
                  Phase 1 Crucible: Epistemic Impasse
                </span>
                <h2 className="text-base font-bold text-strong">
                  Stress-Testing Heuristic Breakdown Points
                </h2>
                <p className="text-xs text-secondary">
                  Examine where intuitive approaches fail, experience the boundary impasse, and
                  articulate the knowledge gap.
                </p>
              </div>
              <Badge tone="warning" className="text-xs">
                Affective Impasse: {affectiveRating}/5
              </Badge>
            </div>

            {/* Boundary Condition Test Grid */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-strong flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Select Boundary Conditions Tested:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {[
                  'Extreme Outliers (Flukes / Spikes)',
                  'Zero / Identical Value Balance',
                  'Cancellation of Negative Numbers',
                  'Single Point of Server / Process Failure',
                  'Cyclic Compression / Thermal State Reset',
                  'Hardware Block Memory / Storage Mismatch',
                  'Presymptomatic Viral Shedding Waves',
                  'Non-Differentiable Absolute Value Cusps',
                ].map((boundary) => {
                  const isChecked = testedBoundaries.includes(boundary)
                  return (
                    <button
                      key={boundary}
                      type="button"
                      onClick={() => handleToggleBoundary(boundary)}
                      className={`p-2.5 rounded-lg border text-left text-xs transition-colors flex items-center gap-2 ${
                        isChecked
                          ? 'border-rose-500/50 bg-rose-50/30 dark:bg-rose-950/20 text-strong font-medium'
                          : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:border-neutral-300'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isChecked
                            ? 'bg-rose-500 border-rose-500 text-white'
                            : 'border-neutral-300 dark:border-neutral-600'
                        }`}
                      >
                        {isChecked && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                      <span className="truncate">{boundary}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Failure Mode Diagnostic Input */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label
                  htmlFor={failureInputId}
                  className="block text-xs font-semibold text-secondary mb-1"
                >
                  Identified Failure Mode / Edge Case:
                </label>
                <textarea
                  id={failureInputId}
                  rows={3}
                  value={failureMode}
                  onChange={(e) => setFailureMode(e.target.value)}
                  placeholder="e.g. Summing differences from the mean produces exactly 0 due to center-of-gravity balance..."
                  className="w-full text-xs rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2) text-strong p-2.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div>
                <label
                  htmlFor={gapInputId}
                  className="block text-xs font-semibold text-secondary mb-1"
                >
                  Articulated Knowledge Gap (Need to Know):
                </label>
                <textarea
                  id={gapInputId}
                  rows={3}
                  value={knowledgeGap}
                  onChange={(e) => setKnowledgeGap(e.target.value)}
                  placeholder="e.g. We need a mathematical operation that eliminates negative signs without creating non-differentiable absolute value corners..."
                  className="w-full text-xs rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2) text-strong p-2.5 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* Affective Impasse Slider (Sinha & Kapur 2021) */}
            <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2)/60 border border-neutral-200 dark:border-(--hub-border) space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-strong flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                  Affective Cognitive Friction Rating:
                </span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  Tier {affectiveRating}:{' '}
                  {affectiveRating === 1
                    ? 'Mild Surprise'
                    : affectiveRating === 2
                      ? 'Noticeable Friction'
                      : affectiveRating === 3
                        ? 'Productive Struggle'
                        : affectiveRating === 4
                          ? 'Deep Cognitive Impasse'
                          : 'Severe Epistemic Dissonance'}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={affectiveRating}
                onChange={(e) => setAffectiveRating(Number(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <p className="text-[11px] text-tertiary">
                Kapur (2016) demonstrated that learners who experience authentic epistemic impasse
                prior to direct instruction achieve 2.4x greater conceptual integration.
              </p>
            </div>
          </Panel>

          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              onClick={() => setActiveTab('exploration')}
              className="text-xs px-3 py-1.5 text-secondary"
            >
              Back to Exploration
            </Button>
            <Button
              variant="primary"
              onClick={() => setActiveTab('consolidation')}
              className="text-xs px-4 py-2 flex items-center gap-1.5"
            >
              Reveal Canonical Consolidation
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* TAB 3: CANONICAL CONSOLIDATION & JUXTAPOSITION MATRIX */}
      {activeTab === 'consolidation' && (
        <div className="space-y-6">
          {/* Formal Principle Showcase */}
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                  Phase 2: Canonical Assembly
                </span>
                <h2 className="text-base font-bold text-strong">
                  {scenario.canonicalConsolidation.expertPrincipleTitle}
                </h2>
                <p className="text-xs text-secondary">
                  Expert formalization resolving structural invariants
                </p>
              </div>
              <Badge tone="success" className="text-xs">
                Canonical Model
              </Badge>
            </div>

            {/* Formal Formula Box */}
            <div className="p-4 rounded-xl bg-neutral-900 text-neutral-100 dark:bg-black border border-neutral-800 space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400">
                Formal Mathematical & Architectural Model:
              </span>
              <div className="font-mono text-sm sm:text-base font-bold text-amber-300 overflow-x-auto py-1">
                {scenario.canonicalConsolidation.formalFormulaOrModel}
              </div>
            </div>

            {/* Formal Parameters Decomposition */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-strong">
                Formal Parameter Decomposition:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {scenario.canonicalConsolidation.formalParameters.map((param, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-(--hub-panel-2) text-strong">
                        {param.symbol}
                      </span>
                      <span className="text-[10px] text-tertiary">{param.name}</span>
                    </div>
                    <p className="text-xs text-strong font-medium">{param.meaning}</p>
                    <p className="text-[10px] text-secondary leading-tight">
                      {param.cognitiveRole}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Juxtaposition & Comparison Matrix */}
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="border-b border-neutral-200 dark:border-(--hub-border) pb-2">
              <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-indigo-500" />
                SGR vs CER Juxtaposition Matrix (Loibl et al. 2017)
              </h3>
              <p className="text-xs text-secondary">
                Direct side-by-side contrast between intuitive constructs and expert formulations.
              </p>
            </div>

            <div className="space-y-3">
              {scenario.canonicalConsolidation.juxtapositionMappings.map((mapping, idx) => {
                const alignmentTones: Record<
                  typeof mapping.alignmentStatus,
                  'success' | 'warning' | 'neutral'
                > = {
                  convergent: 'success',
                  incomplete: 'neutral',
                  divergent: 'warning',
                }
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2)/40 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 dark:border-(--hub-border)/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-strong">
                          Intuitive: &quot;{mapping.studentConcept}&quot;
                        </span>
                        <span className="text-xs text-secondary">vs</span>
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          Canonical: &quot;{mapping.canonicalConcept}&quot;
                        </span>
                      </div>
                      <Badge
                        tone={alignmentTones[mapping.alignmentStatus]}
                        className="text-[10px] uppercase font-mono"
                      >
                        {mapping.alignmentStatus}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-secondary">
                          Pedagogical Mapping:
                        </span>
                        <p className="text-secondary leading-relaxed">{mapping.explanation}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-strong">
                          Contrastive Insight:
                        </span>
                        <p className="text-strong leading-relaxed bg-amber-500/10 p-2 rounded border border-amber-500/20">
                          {mapping.contrastiveInsight}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Why Intuition Failed vs How Expert Model Solves It */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/20 space-y-1.5">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  Why Intuition Failed:
                </span>
                <p className="text-xs text-secondary leading-relaxed">
                  {scenario.canonicalConsolidation.whyIntuitionFailed}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/20 space-y-1.5">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  How Expert Model Solves It:
                </span>
                <p className="text-xs text-secondary leading-relaxed">
                  {scenario.canonicalConsolidation.howExpertModelSolvesIt}
                </p>
              </div>
            </div>
          </Panel>

          {/* Consolidation Self-Evaluation Sliders */}
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <h3 className="text-sm font-bold text-strong">
              Consolidation Integration Self-Rating (CIG):
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-secondary">Feature Alignment:</span>
                  <span className="font-mono font-bold text-strong">{featureAlignment}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={featureAlignment}
                  onChange={(e) => setFeatureAlignment(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-secondary">Parameter Mapping:</span>
                  <span className="font-mono font-bold text-strong">{parameterMapping}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={parameterMapping}
                  onChange={(e) => setParameterMapping(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-secondary">Structural Invariant:</span>
                  <span className="font-mono font-bold text-strong">{invariantGrasp}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={invariantGrasp}
                  onChange={(e) => setInvariantGrasp(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          </Panel>

          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              onClick={() => setActiveTab('impasse')}
              className="text-xs px-3 py-1.5 text-secondary"
            >
              Back to Impasse
            </Button>
            <Button
              variant="primary"
              onClick={() => setActiveTab('transfer')}
              className="text-xs px-4 py-2 flex items-center gap-1.5"
            >
              Test Adaptive Transfer Probes
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* TAB 4: ADAPTIVE TRANSFER & FSRS-6 DECK */}
      {activeTab === 'transfer' && (
        <div className="space-y-6">
          {/* Transfer Probes Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-status-success-text" />
                  Adaptive Transfer Crucible (Near, Medium, Far)
                </h3>
                <p className="text-xs text-secondary">
                  Validate that you acquired the deep structural invariant rather than shallow
                  procedural memorization.
                </p>
              </div>
              <Badge tone="neutral" className="text-xs">
                Score: {metrics.adaptiveTransferScore}%
              </Badge>
            </div>

            <div className="space-y-4">
              {scenario.transferProbes.map((probe, idx) => {
                const isSubmitted = transferSubmitted[probe.probeId]
                const selectedOptionId = transferAnswers[probe.probeId]
                const distanceColors: Record<
                  typeof probe.transferDistance,
                  'neutral' | 'accent' | 'warning'
                > = {
                  near: 'neutral',
                  medium: 'accent',
                  far: 'warning',
                }

                return (
                  <Panel
                    key={probe.probeId}
                    className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-strong">
                          Probe {idx + 1}: {probe.targetDomain}
                        </span>
                        <Badge
                          tone={distanceColors[probe.transferDistance]}
                          className="text-[10px] uppercase font-mono"
                        >
                          {probe.transferDistance} transfer
                        </Badge>
                      </div>

                      {isSubmitted && (
                        <div className="flex items-center gap-1.5">
                          {probe.options.find((o) => o.id === selectedOptionId)?.isCorrect ? (
                            <span className="text-xs font-semibold text-status-success-text flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Invariant Validated
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" />
                              Surface Trap Triggered
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-strong leading-relaxed">{probe.problemStatement}</p>

                    {/* Options list */}
                    <div className="space-y-2">
                      {probe.options.map((opt) => {
                        const isSelected = selectedOptionId === opt.id
                        let optionStyle =
                          'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) hover:border-neutral-300'
                        if (isSubmitted) {
                          if (opt.isCorrect) {
                            optionStyle =
                              'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200'
                          } else if (isSelected && !opt.isCorrect) {
                            optionStyle =
                              'border-rose-500 bg-rose-50/30 dark:bg-rose-950/20 text-rose-950 dark:text-rose-200'
                          }
                        } else if (isSelected) {
                          optionStyle = 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20'
                        }

                        return (
                          <div
                            key={opt.id}
                            onClick={() => handleSelectTransferOption(probe.probeId, opt.id)}
                            className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${optionStyle}`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="font-mono font-bold text-secondary shrink-0 mt-0.5">
                                {opt.label}.
                              </span>
                              <div className="space-y-1">
                                <p className="text-strong">{opt.text}</p>
                                {isSubmitted && (
                                  <p className="text-[11px] text-secondary leading-normal">
                                    {opt.explanation}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {!isSubmitted && (
                      <div className="flex justify-end pt-1">
                        <Button
                          variant="primary"
                          disabled={!selectedOptionId}
                          onClick={() => handleSubmitTransferProbe(probe.probeId)}
                          className="text-xs px-3 py-1.5"
                        >
                          Evaluate Transfer Answer
                        </Button>
                      </div>
                    )}

                    {isSubmitted && (
                      <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-[11px] space-y-1">
                        <div>
                          <strong className="text-strong">Deep Structural Invariant: </strong>
                          <span className="text-secondary">{probe.deepStructuralInvariant}</span>
                        </div>
                        <div>
                          <strong className="text-strong">Surface Feature Variation: </strong>
                          <span className="text-secondary">{probe.surfaceFeaturesDifference}</span>
                        </div>
                      </div>
                    )}
                  </Panel>
                )
              })}
            </div>
          </div>

          {/* FSRS-6 Calibrated Spaced Repetition Flashcards */}
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-600 dark:text-amber-400">
                  Long-Term Consolidation
                </span>
                <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  Calibrated FSRS-6 Flashcards ({fsrsCards.length})
                </h3>
                <p className="text-xs text-secondary">
                  Initial stability S₀ = {fsrsCards[0]?.initialStabilityDays}d | Difficulty D₀ ={' '}
                  {fsrsCards[0]?.initialDifficulty}
                </p>
              </div>

              <Button
                variant="secondary"
                onClick={handleExportDeck}
                className="text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                {deckExported ? 'Deck Synchronized!' : 'Export to Review Deck'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {fsrsCards.map((card, idx) => {
                const isFlipped = flippedCardIdx === idx
                return (
                  <div
                    key={idx}
                    onClick={() => setFlippedCardIdx(isFlipped ? null : idx)}
                    className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel-2)/50 hover:border-neutral-300 dark:hover:border-neutral-700 cursor-pointer transition-all space-y-2 min-h-[140px] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-tertiary mb-1">
                        <span className="font-mono uppercase font-bold text-secondary">
                          {card.conceptualDepth}
                        </span>
                        <span>Click to flip</span>
                      </div>
                      <p className="text-xs font-semibold text-strong leading-relaxed">
                        {isFlipped ? card.back : card.front}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-neutral-100 dark:border-(--hub-border)/60 flex items-center justify-between text-[10px] text-tertiary">
                      <span className="truncate">{card.targetFactor}</span>
                      <span className="font-mono">S₀: {card.initialStabilityDays}d</span>
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
