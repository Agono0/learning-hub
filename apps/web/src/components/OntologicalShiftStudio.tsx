/**
 * Learning HUB — Conceptual Change & Ontological Category Shift Studio
 *
 * Grounded in:
 * - Michelene T. H. Chi (1992, 2008, 2013): Ontological Category Shift Framework
 * - Stella Vosniadou (1994, 2002): Framework Theory & Synthetic Mental Models
 * - Andrea diSessa (1988, 1993): Knowledge in Pieces & Phenomenological Primitives
 * - Posner, Strike, Hewson & Gertzog (1982): Accommodation Conditions (D, I, P, F)
 */

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  CALIBRATED_MISCONCEPTION_SCENARIOS,
  CANONICAL_ATTRIBUTE_CATALOG,
  CANONICAL_PPRIM_CATALOG,
  type ConceptualMisconceptionScenario,
  type OntologicalBranch,
  type OntologicalDiagnosisResult,
  type PosnerConditions,
  type ProcessAttribute,
  type ProcessAttributeCategory,
  calculateConceptualChangeReadiness,
  calculateOntologicalDiscrepancyGap,
  detectSyntheticCompromiseRisk,
  generateFSRSConceptualShiftCards,
} from '@learning-hub/core/conceptual-change'
import { Badge, Button, IconButton, OntologicalShiftHUD, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight } from '../platform/haptics'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Copy,
  GitBranch,
  HelpCircle,
  Layers,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react'

type StudioTab = 'attribute_crucible' | 'tree_remapping' | 'posner_refutation' | 'fsrs_deck'

export function OntologicalShiftStudio() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    'evolution_natural_selection',
  )
  const [tab, setTab] = useState<StudioTab>('attribute_crucible')

  const scenario: ConceptualMisconceptionScenario = useMemo(() => {
    return (
      CALIBRATED_MISCONCEPTION_SCENARIOS.find((s) => s.id === selectedScenarioId) ??
      CALIBRATED_MISCONCEPTION_SCENARIOS[0]
    )
  }, [selectedScenarioId])

  // Learner's selected attributes per dimension
  const [selectedAttributes, setSelectedAttributes] = useState<
    Record<ProcessAttributeCategory, ProcessAttribute>
  >({
    agency: 'distinct_agent',
    intentionality: 'intentional_purpose',
    control: 'centralized_control',
    temporality: 'sequential_stages',
    hierarchy: 'unequal_status',
    causation: 'proportional_effect',
  })

  // Learner's classified ontological branch
  const [selectedBranch, setSelectedBranch] = useState<OntologicalBranch>('direct_process')

  // Posner conditions
  const [posnerConditions, setPosnerConditions] = useState<PosnerConditions>({
    dissatisfaction: 0.2,
    intelligibility: 0.5,
    plausibility: 0.4,
    fruitfulness: 0.3,
  })

  // Selected anomaly inspection index
  const [inspectedAnomalyIdx, setInspectedAnomalyIdx] = useState<number | null>(null)

  // Simulation step state for Emergence micro-sim
  const [simStep, setSimStep] = useState<number>(0)
  const [isSimRunning, setIsSimRunning] = useState<boolean>(false)

  // Card deck copy state
  const [isDeckCopied, setIsDeckCopied] = useState<boolean>(false)

  // Reset states when scenario changes
  useEffect(() => {
    setTab('attribute_crucible')
    setSelectedBranch(scenario.naiveOntologicalBranch)
    setSelectedAttributes({
      agency: scenario.attributeContrasts[0].directAttribute,
      intentionality: scenario.attributeContrasts[1].directAttribute,
      control: scenario.attributeContrasts[2].directAttribute,
      temporality: scenario.attributeContrasts[3].directAttribute,
      hierarchy: scenario.attributeContrasts[4].directAttribute,
      causation: scenario.attributeContrasts[5].directAttribute,
    })
    setPosnerConditions({
      dissatisfaction: 0.2,
      intelligibility: 0.5,
      plausibility: 0.4,
      fruitfulness: 0.3,
    })
    setInspectedAnomalyIdx(null)
    setSimStep(0)
    setIsSimRunning(false)
    setIsDeckCopied(false)
  }, [selectedScenarioId, scenario])

  // Audio tone helper
  const playTone = (freq: number, type: OscillatorType = 'sine', duration: number = 0.15) => {
    void getSharedAudioContext()
      .then((ctx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, ctx.currentTime)
        gain.gain.setValueAtTime(0.08, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + duration)
      })
      .catch(() => {})
  }

  // Calculate quantitative diagnostics
  const currentAttributeList = useMemo(() => {
    return Object.values(selectedAttributes)
  }, [selectedAttributes])

  const discrepancyGap = useMemo(() => {
    return calculateOntologicalDiscrepancyGap({
      selectedAttributes: currentAttributeList,
      scenario,
    })
  }, [currentAttributeList, scenario])

  const posnerAccommodationIndex = useMemo(() => {
    return (
      0.35 * posnerConditions.dissatisfaction +
      0.25 * posnerConditions.intelligibility +
      0.25 * posnerConditions.plausibility +
      0.15 * posnerConditions.fruitfulness
    )
  }, [posnerConditions])

  const syntheticCompromiseRisk = useMemo(() => {
    return detectSyntheticCompromiseRisk({
      discrepancyGap,
      posnerConditions,
    })
  }, [discrepancyGap, posnerConditions])

  const conceptualShiftReadiness = useMemo(() => {
    return calculateConceptualChangeReadiness({
      posnerIndex: posnerAccommodationIndex,
      discrepancyGap,
      syntheticRisk: syntheticCompromiseRisk,
    })
  }, [posnerAccommodationIndex, discrepancyGap, syntheticCompromiseRisk])

  const diagnosisResult: OntologicalDiagnosisResult = useMemo(() => {
    let stage: 'initial_naive_model' | 'synthetic_compromise_model' | 'scientific_emergent_model' =
      'initial_naive_model'
    if (conceptualShiftReadiness >= 0.75 && selectedBranch === 'emergent_process') {
      stage = 'scientific_emergent_model'
    } else if (syntheticCompromiseRisk > 0.5) {
      stage = 'synthetic_compromise_model'
    }

    return {
      scenarioId: scenario.id,
      learnerBranch: selectedBranch,
      targetBranch: scenario.targetOntologicalBranch,
      isOntologicalMismatch: selectedBranch !== scenario.targetOntologicalBranch,
      discrepancyGap,
      detectedPPrim: scenario.dominantPPrim,
      mentalModelStage: stage,
      posnerAccommodationIndex,
      syntheticCompromiseRisk,
      conceptualShiftReadiness,
    }
  }, [
    scenario.id,
    scenario.targetOntologicalBranch,
    scenario.dominantPPrim,
    selectedBranch,
    discrepancyGap,
    posnerAccommodationIndex,
    syntheticCompromiseRisk,
    conceptualShiftReadiness,
  ])

  // Generated FSRS conceptual shift cards
  const shiftCards = useMemo(() => {
    return generateFSRSConceptualShiftCards(scenario, diagnosisResult)
  }, [scenario, diagnosisResult])

  // Handler: Select an attribute
  const handleSelectAttribute = (
    dimension: ProcessAttributeCategory,
    attribute: ProcessAttribute,
  ) => {
    setSelectedAttributes((prev) => ({
      ...prev,
      [dimension]: attribute,
    }))

    const isEmergent = CANONICAL_ATTRIBUTE_CATALOG[attribute].branch === 'emergent_process'
    if (isEmergent) {
      // Shifting toward emergent increases plausibility & intelligibility
      setPosnerConditions((prev) => ({
        ...prev,
        intelligibility: Math.min(1.0, prev.intelligibility + 0.08),
        plausibility: Math.min(1.0, prev.plausibility + 0.08),
      }))
      playTone(523.25, 'sine', 0.15)
      hapticLight()
    } else {
      playTone(329.63, 'sine', 0.15)
      hapticLight()
    }
  }

  // Handler: Inspect an empirical anomaly (drives Posner dissatisfaction)
  const handleInspectAnomaly = (idx: number) => {
    setInspectedAnomalyIdx(idx)
    setPosnerConditions((prev) => ({
      ...prev,
      dissatisfaction: Math.min(1.0, prev.dissatisfaction + 0.25),
      fruitfulness: Math.min(1.0, prev.fruitfulness + 0.15),
    }))
    playTone(440, 'triangle', 0.2)
    hapticHeavy()
  }

  // Handler: Shift Ontological Branch
  const handleShiftBranch = (branch: OntologicalBranch) => {
    setSelectedBranch(branch)
    if (branch === 'emergent_process') {
      playTone(659.25, 'sine', 0.25)
      hapticHeavy()
    } else {
      playTone(261.63, 'sine', 0.15)
      hapticLight()
    }
  }

  // Micro-simulation ticker
  useEffect(() => {
    if (!isSimRunning) return
    const timer = setInterval(() => {
      setSimStep((prev) => (prev + 1) % 100)
    }, 120)
    return () => clearInterval(timer)
  }, [isSimRunning])

  // Handler: Copy FSRS Deck
  const handleCopyDeck = () => {
    const text = shiftCards
      .map(
        (c, i) =>
          `Card ${i + 1} [${c.attributeDimension.toUpperCase()}]:\n${c.prompt}\n\nNaive Misconception:\n${c.naiveTrap}\n\nScientific Solution:\n${c.answer}\n\nChi Shift Rule:\n${c.ontologicalShiftRule}\n`,
      )
      .join('\n---\n\n')

    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setIsDeckCopied(true)
        hapticLight()
        setTimeout(() => setIsDeckCopied(false), 2500)
      })
      .catch(() => {})
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header & Scenario Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary">
              Ontological Category Shift Studio
            </span>
            <Badge tone="accent">Michelene Chi · Stella Vosniadou · Andrea diSessa</Badge>
          </div>
          <h1 className="text-2xl font-bold text-strong tracking-tight">
            Conceptual Change &amp; Emergence Engine
          </h1>
          <p className="text-sm text-secondary mt-1">
            Reassign robust science misconceptions from intuitive Direct-Process / Matter schemas to
            decentralized Emergent-System models through Posner accommodation and attribute
            refutation.
          </p>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {CALIBRATED_MISCONCEPTION_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setSelectedScenarioId(sc.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                sc.id === selectedScenarioId
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-ac-text dark:text-ac-text shadow-xs'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:text-strong'
              }`}
            >
              {sc.domain === 'evolutionary_bio' && 'Natural Selection'}
              {sc.domain === 'thermodynamics' && 'Thermal Conduction'}
              {sc.domain === 'electromagnetism' && 'DC Electric Current'}
              {sc.domain === 'cellular_biophysics' && 'Diffusion & Osmosis'}
              {sc.domain === 'microeconomics' && 'Market Price Discovery'}
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Ontological Shift HUD */}
      <OntologicalShiftHUD
        diagnosis={diagnosisResult}
        posnerConditions={posnerConditions}
        scenarioTitle={scenario.title}
      />

      {/* Studio Navigation Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setTab('attribute_crucible')}
          className={`p-3 rounded-xl text-left border transition-all ${
            tab === 'attribute_crucible'
              ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-900 dark:text-violet-200 shadow-xs'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:text-strong'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-ac-text" />
            <span className="text-xs font-bold">1. Attribute Crucible</span>
          </div>
          <p className="text-[11px] text-tertiary">Chi 6 Process Dimensions</p>
        </button>

        <button
          type="button"
          onClick={() => setTab('tree_remapping')}
          className={`p-3 rounded-xl text-left border transition-all ${
            tab === 'tree_remapping'
              ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-900 dark:text-violet-200 shadow-xs'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:text-strong'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-4 h-4 text-ac-text" />
            <span className="text-xs font-bold">2. Ontological Tree</span>
          </div>
          <p className="text-[11px] text-tertiary">Category Re-Mapping</p>
        </button>

        <button
          type="button"
          onClick={() => setTab('posner_refutation')}
          className={`p-3 rounded-xl text-left border transition-all ${
            tab === 'posner_refutation'
              ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-900 dark:text-violet-200 shadow-xs'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:text-strong'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-ac-text" />
            <span className="text-xs font-bold">3. Posner Refutation</span>
          </div>
          <p className="text-[11px] text-tertiary">Anomalies &amp; P-Prims</p>
        </button>

        <button
          type="button"
          onClick={() => setTab('fsrs_deck')}
          className={`p-3 rounded-xl text-left border transition-all ${
            tab === 'fsrs_deck'
              ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-900 dark:text-violet-200 shadow-xs'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:text-strong'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-ac-text" />
            <span className="text-xs font-bold">4. FSRS Shift Deck</span>
          </div>
          <p className="text-[11px] text-tertiary">Spaced Contrast Cards</p>
        </button>
      </div>

      {/* Tab 1: Attribute Crucible (Chi 2013) */}
      {tab === 'attribute_crucible' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="accent">Chi (2013) Process Attribute Diagnostic</Badge>
                <span className="text-xs text-secondary">
                  Contrast Direct-Process Biases with Emergent Realities
                </span>
              </div>
              <h2 className="text-lg font-bold text-strong">{scenario.title}</h2>
              <p className="text-xs text-secondary mt-1">{scenario.phenomenon}</p>
            </div>

            <Button variant="primary" onClick={() => setTab('tree_remapping')}>
              Continue to Tree Re-Mapping
              <ChevronRight className="w-4 h-4 ml-1 inline" />
            </Button>
          </div>

          {/* Naive Belief Anchor Card */}
          <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 dark:text-status-warning-text flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-status-warning-text" />
                Naive Intuitive Model (Matter / Direct-Process Trap)
              </span>
              <Badge tone="warning">Heuristic Impetus</Badge>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              &ldquo;{scenario.naiveBeliefStatement}&rdquo;
            </p>
          </div>

          {/* 6 Attribute Contrast Dimensions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-strong flex items-center gap-2">
                <Layers className="w-4 h-4 text-ac-text" />
                Select Process Attributes Across 6 Dimensions
              </h3>
              <span className="text-xs text-secondary">
                {
                  currentAttributeList.filter(
                    (a) => CANONICAL_ATTRIBUTE_CATALOG[a].branch === 'emergent_process',
                  ).length
                }
                /6 Emergent Attributes Identified
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenario.attributeContrasts.map((contrast) => {
                const currentSelected = selectedAttributes[contrast.dimension]
                const isEmergentSelected = currentSelected === contrast.emergentAttribute
                const directMeta = CANONICAL_ATTRIBUTE_CATALOG[contrast.directAttribute]
                const emergentMeta = CANONICAL_ATTRIBUTE_CATALOG[contrast.emergentAttribute]

                return (
                  <div
                    key={contrast.dimension}
                    className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/60 dark:bg-(--hub-panel-2)/40 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                        Dimension: {contrast.dimension}
                      </span>
                      {isEmergentSelected ? (
                        <Badge tone="success">Scientific Emergent</Badge>
                      ) : (
                        <Badge tone="danger">Naive Direct</Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {/* Direct Attribute Option */}
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectAttribute(contrast.dimension, contrast.directAttribute)
                        }
                        className={`p-3 rounded-lg text-left transition-all border ${
                          currentSelected === contrast.directAttribute
                            ? 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/30 shadow-xs'
                            : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) hover:border-neutral-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-rose-900 dark:text-danger-text">
                            {directMeta.label}
                          </span>
                          <span className="text-[10px] text-tertiary">Direct Process</span>
                        </div>
                        <p className="text-[11px] text-secondary leading-snug">
                          {contrast.directDescription}
                        </p>
                      </button>

                      {/* Emergent Attribute Option */}
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectAttribute(contrast.dimension, contrast.emergentAttribute)
                        }
                        className={`p-3 rounded-lg text-left transition-all border ${
                          currentSelected === contrast.emergentAttribute
                            ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30 shadow-xs'
                            : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) hover:border-neutral-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-emerald-900 dark:text-status-success-text">
                            {emergentMeta.label}
                          </span>
                          <span className="text-[10px] text-status-success-text dark:text-status-success-text font-semibold">
                            Emergent System
                          </span>
                        </div>
                        <p className="text-[11px] text-secondary leading-snug">
                          {contrast.emergentDescription}
                        </p>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Panel>
      )}

      {/* Tab 2: Ontological Tree Re-Mapping */}
      {tab === 'tree_remapping' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="violet">Chi (1992, 2013) Tree of Ontological Categories</Badge>
                <span className="text-xs text-secondary">
                  Lateral Branch Shift vs Radical Incommensurable Shift
                </span>
              </div>
              <h2 className="text-lg font-bold text-strong">
                Reassign Phenomenon to the Emergent Branch
              </h2>
              <p className="text-xs text-secondary mt-1">
                A radical ontological category shift moves the concept from the &ldquo;Direct
                Process&rdquo; or &ldquo;Matter&rdquo; branch into the &ldquo;Emergent
                Process&rdquo; branch.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setTab('attribute_crucible')}>
                Back to Attributes
              </Button>
              <Button variant="primary" onClick={() => setTab('posner_refutation')}>
                Inspect Posner Refutations
                <ChevronRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          {/* 3 Ontological Branches Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Branch 1: Matter / Entity */}
            <div
              onClick={() => handleShiftBranch('matter_entity')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedBranch === 'matter_entity'
                  ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/30 ring-2 ring-rose-500/20'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 hover:border-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-rose-950 dark:text-rose-200">
                  Branch A: Matter / Entity
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                Substances, fluids, or localized material objects (e.g. caloric heat fluid,
                electricity fuel, ink particles marching to breathe).
              </p>
              <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-(--hub-border)">
                <span className="text-[10px] text-tertiary block mb-1">Naive Presupposition:</span>
                <span className="text-[11px] font-semibold text-danger-text dark:text-danger-text">
                  Can be contained, poured, stored, or consumed.
                </span>
              </div>
            </div>

            {/* Branch 2: Direct Process */}
            <div
              onClick={() => handleShiftBranch('direct_process')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedBranch === 'direct_process'
                  ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 ring-2 ring-amber-500/20'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 hover:border-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                  Branch B: Direct Process
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                Agent-commanded, intentional, sequential pipeline where an actor intentionally
                produces a proportional effect on a recipient.
              </p>
              <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-(--hub-border)">
                <span className="text-[10px] text-tertiary block mb-1">Direct Presupposition:</span>
                <span className="text-[11px] font-semibold text-status-warning-text dark:text-status-warning-text">
                  Needs a conductor, master agent, or purposeful intent.
                </span>
              </div>
            </div>

            {/* Branch 3: Emergent Process (Target) */}
            <div
              onClick={() => handleShiftBranch('emergent_process')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedBranch === 'emergent_process'
                  ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20'
                  : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 hover:border-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                  Branch C: Emergent System
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                Decentralized, simultaneous interactions between uniform, leaderless components
                producing statistical macro-patterns.
              </p>
              <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-(--hub-border)">
                <span className="text-[10px] text-tertiary block mb-1">
                  Scientific Presupposition:
                </span>
                <span className="text-[11px] font-semibold text-status-success-text dark:text-status-success-text">
                  Self-organization via the law of large numbers.
                </span>
              </div>
            </div>
          </div>

          {/* Vosniadou Synthetic Compromise Warning */}
          {syntheticCompromiseRisk > 0.45 && selectedBranch !== 'emergent_process' && (
            <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-status-warning-text" />
                  Vosniadou Synthetic Model Alert
                </span>
                <Badge tone="warning">Risk: {(syntheticCompromiseRisk * 100).toFixed(0)}%</Badge>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                <strong className="text-strong">Synthetic Compromise Detected:</strong>{' '}
                {scenario.syntheticModelCompromise}
              </p>
              <p className="text-[11px] text-tertiary">
                Notice: grafting scientific terms onto a direct-agent schema creates a flawed
                hybrid. You must completely abandon the assumption of a central commanding agent!
              </p>
            </div>
          )}

          {/* Decentralized Emergence Micro-Simulation */}
          <div className="p-4 rounded-xl bg-neutral-900 text-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-status-warning-text" />
                <span className="text-xs font-bold">
                  Decentralized Emergence Simulation (Step {simStep + 1}/100)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSimRunning((p) => !p)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all"
                >
                  {isSimRunning ? 'Pause Sim' : 'Run Micro-Sim'}
                </button>
                <IconButton
                  label="Reset micro-simulation"
                  size="sm"
                  variant="bare"
                  onClick={() => {
                    setSimStep(0)
                    setIsSimRunning(false)
                  }}
                  className="rounded-lg text-white bg-white/10 hover:bg-white/20"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            </div>

            {/* SVG Particle Aggregation Canvas */}
            <div className="w-full h-36 rounded-lg bg-black/60 relative overflow-hidden flex items-center justify-center border border-white/10">
              <svg className="w-full h-full" viewBox="0 0 400 120">
                {/* 40 stochastic autonomous particles */}
                {Array.from({ length: 40 }).map((_, i) => {
                  const seedX = ((i * 37 + simStep * (1 + (i % 3))) % 380) + 10
                  const seedY = ((i * 23 + Math.sin(simStep * 0.1 + i) * 30) % 90) + 15
                  const isEquilibrated = simStep > 30

                  return (
                    <circle
                      key={i}
                      cx={seedX}
                      cy={seedY}
                      r="3.5"
                      fill={isEquilibrated ? '#10b981' : '#f59e0b'}
                      opacity="0.85"
                    />
                  )
                })}

                {/* Macro-level trend line emerging from particles */}
                <line
                  x1="20"
                  y1={60 + Math.sin(simStep * 0.05) * 8}
                  x2="380"
                  y2={60 - Math.sin(simStep * 0.05) * 8}
                  stroke="#818cf8"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>

              <div className="absolute bottom-2 left-3 text-[10px] text-tertiary">
                Micro: Stochastic independent components · Macro: Statistical steady-state pattern
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              <strong className="text-white">Emergent Mechanism:</strong>{' '}
              {scenario.emergenceMechanismSummary}
            </p>
          </div>
        </Panel>
      )}

      {/* Tab 3: Posner Refutation & Anomaly Crucible */}
      {tab === 'posner_refutation' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="accent">Posner et al. (1982) Conceptual Accommodation</Badge>
                <span className="text-xs text-secondary">
                  Dissatisfaction · Intelligibility · Plausibility · Fruitfulness
                </span>
              </div>
              <h2 className="text-lg font-bold text-strong">
                Falsifying Direct Heuristics with Empirical Anomalies
              </h2>
              <p className="text-xs text-secondary mt-1">
                Conceptual accommodation occurs when learners experience dissatisfaction with their
                naive model after confronting undeniable empirical anomalies.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setTab('tree_remapping')}>
                Back to Tree
              </Button>
              <Button variant="primary" onClick={() => setTab('fsrs_deck')}>
                View FSRS Shift Deck
                <ChevronRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          {/* 3 Refutational Anomalies */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-strong flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-ac-text" />
              Confront Empirical Anomalies (Click to Drive Dissatisfaction)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {scenario.refutationalAnomalies.map((anomaly, idx) => {
                const isInspected = inspectedAnomalyIdx === idx

                return (
                  <div
                    key={idx}
                    onClick={() => handleInspectAnomaly(idx)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isInspected
                        ? 'border-violet-500 bg-violet-50/70 dark:bg-violet-950/30 ring-2 ring-violet-500/20'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-strong">Anomaly {idx + 1}</span>
                      {isInspected ? (
                        <CheckCircle2 className="w-4 h-4 text-status-success-text" />
                      ) : (
                        <HelpCircle className="w-4 h-4 text-tertiary" />
                      )}
                    </div>
                    <p className="text-xs text-secondary leading-relaxed">{anomaly}</p>
                    <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
                      <span className="text-[10px] text-ac-text dark:text-ac-text font-semibold">
                        {isInspected
                          ? 'Dissatisfaction triggered (+25%)'
                          : 'Click to inspect refutation'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Scientific Emergent Target Schema Card */}
          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-900/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-status-success-text" />
                Target Scientific Emergent Schema (Chi 2013)
              </span>
              <Badge tone="success">
                Readiness: {(conceptualShiftReadiness * 100).toFixed(0)}%
              </Badge>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              {scenario.scientificEmergentExplanation}
            </p>
          </div>

          {/* diSessa P-Prim Recontextualization Card */}
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-2">
            <span className="text-xs font-bold text-strong flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-status-warning-text" />
              diSessa P-Prim Recontextualization:{' '}
              {CANONICAL_PPRIM_CATALOG[scenario.dominantPPrim].name}
            </span>
            <p className="text-xs text-secondary leading-relaxed">
              <strong className="text-strong">Naive Application:</strong>{' '}
              {CANONICAL_PPRIM_CATALOG[scenario.dominantPPrim].naiveApplication}
            </p>
            <p className="text-xs text-secondary leading-relaxed">
              <strong className="text-strong">Scientific Recontextualization:</strong>{' '}
              {CANONICAL_PPRIM_CATALOG[scenario.dominantPPrim].scientificRecontextualization}
            </p>
          </div>
        </Panel>
      )}

      {/* Tab 4: FSRS Conceptual Shift Flashcards Deck */}
      {tab === 'fsrs_deck' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="success">FSRS-6 Ontological Contrast Bridge</Badge>
                <span className="text-xs text-secondary">
                  Spaced Retrieval Cards ({shiftCards.length} generated)
                </span>
              </div>
              <h2 className="text-lg font-bold text-strong">Ontological Contrast Flashcard Deck</h2>
              <p className="text-xs text-secondary mt-1">
                Commit Chi&rsquo;s 6 ontological contrast rules and Posner refutations to long-term
                memory using FSRS-6 spaced repetition.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleCopyDeck}>
                <Copy className="w-3.5 h-3.5 mr-1.5 inline" />
                {isDeckCopied ? 'Deck Copied!' : 'Copy Cards'}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setTab('attribute_crucible')
                  setSelectedScenarioId(
                    selectedScenarioId === 'evolution_natural_selection'
                      ? 'thermodynamics_heat_conduction'
                      : 'evolution_natural_selection',
                  )
                }}
              >
                Next Misconception Scenario
                <ArrowRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shiftCards.map((card, idx) => (
              <div
                key={card.id}
                className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-violet-500/10 dark:bg-violet-500/20 text-ac-text dark:text-ac-text font-bold text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-strong uppercase">
                      Dimension: {card.attributeDimension}
                    </span>
                  </div>
                  <Badge tone="violet">FSRS-6 Card</Badge>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold text-tertiary block">PROMPT:</span>
                  <p className="text-xs font-semibold text-strong leading-snug">{card.prompt}</p>
                </div>

                <div className="p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30">
                  <span className="text-[10px] font-bold text-danger-text dark:text-danger-text block mb-0.5">
                    NAIVE TRAP:
                  </span>
                  <p className="text-[11px] text-secondary leading-snug">{card.naiveTrap}</p>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30">
                  <span className="text-[10px] font-bold text-status-success-text dark:text-status-success-text block mb-0.5">
                    SCIENTIFIC SHIFT:
                  </span>
                  <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-line">
                    {card.answer}
                  </p>
                </div>

                <div className="pt-2 border-t border-neutral-200 dark:border-(--hub-border) flex items-center justify-between text-[10px] text-tertiary">
                  <span>{card.ontologicalShiftRule}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
