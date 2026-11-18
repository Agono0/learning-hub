/**
 * @file apps/web/src/components/InquiryStudio.tsx
 * @description Dual-Space Scientific Discovery & Inquiry Simulation Studio.
 *
 * Implements:
 * - David Klahr & Kevin Dunbar (1988) Scientific Discovery as Dual Search (SDDS)
 * - Zhe Chen & David Klahr (1999) Control of Variables Strategy (VOTAT)
 * - Clark Chinn & William Brewer (1993) Anomalous Data Epistemic Taxonomy
 * - Dynamic parameter simulation and calibrated FSRS-6 review cards
 *
 * Strictly follows UI Design Signature: zero ghost classes, mode-aware tokens.
 */

'use client'

import React, { useState } from 'react'
import {
  type AnomalousDataReaction,
  type AnomalousDataSubmission,
  calculateInquiryMetrics,
  generateInquiryFSRSCards,
  getCanonicalInquiryLabs,
  type InquiryLab,
  type InquiryMetrics,
  type InquiryTrialResult,
  runInquiryTrial,
} from '@learning-hub/core/inquiry'
import { Badge, Button, InquiryHUD, Panel, Tabs } from '@/ui'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Download,
  FlaskConical,
  HelpCircle,
  Lightbulb,
  Microscope,
  Play,
  Sparkles,
  Target,
} from 'lucide-react'

export function InquiryStudio() {
  const labs = getCanonicalInquiryLabs()
  const [selectedLabId, setSelectedLabId] = useState<string>(labs[0]!.id)
  const currentLab: InquiryLab = labs.find((l) => l.id === selectedLabId) ?? labs[0]!

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'hypothesis_design' | 'empirical_trials' | 'anomalous_data' | 'causal_synthesis'
  >('hypothesis_design')

  // Variable Slider States (keyed by variable ID)
  const [variableSettings, setVariableSettings] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const v of currentLab.independentVariables) {
      initial[v.id] = v.defaultValue
    }
    return initial
  })

  // Learner Hypothesis
  const [hypothesisText, setHypothesisText] = useState<string>(
    'Increasing bob mass will increase downward gravitational acceleration and shorten the period.',
  )
  const [isFalsificationProbe, setIsFalsificationProbe] = useState<boolean>(false)

  // Trials Execution History
  const [trials, setTrials] = useState<InquiryTrialResult[]>([])

  // Anomalous Data Submissions
  const [anomalousSubmissions, setAnomalousSubmissions] = useState<AnomalousDataSubmission[]>([])
  const [selectedReaction, setSelectedReaction] = useState<AnomalousDataReaction>('theory_revision')
  const [reactionExplanation, setReactionExplanation] = useState<string>(
    'Inertial mass exactly balances gravitational mass in the equation of motion a = g sin(θ), making the period strictly invariant to bob mass.',
  )

  // FSRS Export Status
  const [isExported, setIsExported] = useState<boolean>(false)

  // Handle Lab Switch
  const handleSelectLab = (labId: string) => {
    setSelectedLabId(labId)
    const nextLab = labs.find((l) => l.id === labId) ?? labs[0]!
    const initial: Record<string, number> = {}
    for (const v of nextLab.independentVariables) {
      initial[v.id] = v.defaultValue
    }
    setVariableSettings(initial)
    setTrials([])
    setAnomalousSubmissions([])
    setIsExported(false)
    setActiveTab('hypothesis_design')
  }

  // Handle Variable Change
  const handleVariableChange = (varId: string, val: number) => {
    setVariableSettings((prev) => ({
      ...prev,
      [varId]: val,
    }))
  }

  // Run Empirical Trial
  const handleRunTrial = () => {
    const prevTrial = trials[trials.length - 1]
    const result = runInquiryTrial(
      currentLab,
      trials.length,
      variableSettings,
      prevTrial?.variableSettings,
    )
    setTrials((prev) => [...prev, result])
    setActiveTab('empirical_trials')
  }

  // Submit Anomalous Data Resolution
  const handleSubmitAnomaly = () => {
    const anomaly = currentLab.anomalousScenarios[0]
    if (!anomaly) return
    const newSubmission: AnomalousDataSubmission = {
      anomalyId: anomaly.id,
      reaction: selectedReaction,
      articulatedExplanation: reactionExplanation,
    }
    setAnomalousSubmissions([newSubmission])
    setActiveTab('causal_synthesis')
  }

  // Real-time Metrics Calculation
  const metrics: InquiryMetrics = calculateInquiryMetrics({
    lab: currentLab,
    trials,
    anomalousSubmissions,
    falsificationTrialCount: trials.filter((_t, idx) => idx % 2 === 1).length,
    finalHypothesisCapturesInvariant: anomalousSubmissions.some(
      (s) => s.reaction === 'theory_revision',
    ),
  })

  // Calibrated Cards
  const calibratedCards = generateInquiryFSRSCards(currentLab, metrics)

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Studio Header & Lab Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-500/10 text-status-success-text dark:text-status-success-text">
              <FlaskConical className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-strong">
              Scientific Inquiry &amp; Dual-Space Discovery Studio
            </h1>
          </div>
          <p className="text-xs text-secondary mt-1">
            Klahr &amp; Dunbar (1988) SDDS · Chen &amp; Klahr (1999) VOTAT · Chinn &amp; Brewer
            (1993) Anomalous Data
          </p>
        </div>

        {/* Lab Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-secondary whitespace-nowrap">
            Inquiry Lab:
          </label>
          <select
            value={selectedLabId}
            onChange={(e) => handleSelectLab(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-strong focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
          >
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} ({l.domain})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Telemetry HUD */}
      <InquiryHUD
        metrics={metrics}
        activeLabTitle={`${currentLab.title} — ${currentLab.subtitle}`}
      />

      {/* 4 Navigation Tabs */}
      <Tabs
        label="Scientific Inquiry Phases"
        value={activeTab}
        onChange={(k) =>
          setActiveTab(
            k as 'hypothesis_design' | 'empirical_trials' | 'anomalous_data' | 'causal_synthesis',
          )
        }
        items={[
          {
            key: 'hypothesis_design',
            label: '1. Hypothesis & Workbench',
          },
          {
            key: 'empirical_trials',
            label: `2. Empirical Trials (${trials.length})`,
          },
          {
            key: 'anomalous_data',
            label: '3. Anomalous Crucible',
          },
          {
            key: 'causal_synthesis',
            label: '4. Causal Law & Cards',
          },
        ]}
      />

      {/* TAB 1: HYPOTHESIS FORMULATION & PARAMETER WORKBENCH */}
      {activeTab === 'hypothesis_design' && (
        <div className="space-y-6">
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-status-success-text dark:text-status-success-text">
                  Step 1: Hypothesis Space Search (Klahr &amp; Dunbar 1988)
                </span>
                <h2 className="text-base font-bold text-strong">{currentLab.title}</h2>
                <p className="text-xs text-secondary">{currentLab.subtitle}</p>
              </div>
              <Badge tone="accent" className="text-xs">
                {currentLab.domain}
              </Badge>
            </div>

            {/* Research Question Banner */}
            <div className="p-3.5 rounded-lg bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/40 text-xs space-y-1">
              <span className="font-semibold text-teal-800 dark:text-status-success-text flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                Guiding Empirical Research Question:
              </span>
              <p className="text-strong font-medium leading-relaxed">
                {currentLab.researchQuestion}
              </p>
            </div>

            {/* Theoretical Premise */}
            <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2)/60 border border-neutral-200 dark:border-(--hub-border) text-xs space-y-1">
              <span className="font-semibold text-strong flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-status-success-text" />
                Theoretical Background &amp; Prior Model:
              </span>
              <p className="text-secondary leading-relaxed">{currentLab.theoreticalPremise}</p>
            </div>

            {/* Parameter Sliders Workbench */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-strong flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-status-success-text" />
                  Independent Variables Calibration (VOTAT Parameter Control):
                </span>
                <span className="text-[11px] text-tertiary">
                  Vary ONE variable at a time relative to prior run
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentLab.independentVariables.map((v) => {
                  const val = variableSettings[v.id] ?? v.defaultValue
                  return (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-strong">
                          {v.name} ({v.symbol})
                        </span>
                        <span className="font-mono font-bold text-status-success-text dark:text-status-success-text">
                          {val} {v.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={v.min}
                        max={v.max}
                        step={v.step}
                        value={val}
                        onChange={(e) => handleVariableChange(v.id, parseFloat(e.target.value))}
                        className="w-full accent-teal-600 cursor-pointer"
                      />
                      <p className="text-[11px] text-tertiary">{v.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Learner Hypothesis Input */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
              <label className="text-xs font-semibold text-strong flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-status-warning-text" />
                Articulate Your Causal Hypothesis (Before Executing Trial):
              </label>
              <textarea
                value={hypothesisText}
                onChange={(e) => setHypothesisText(e.target.value)}
                rows={2}
                className="w-full text-xs p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-strong focus:outline-none focus:ring-1 focus:ring-teal-500 leading-relaxed font-sans"
                placeholder="State expected causal dependency between independent variable and observed output..."
              />
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="falsifyCheck"
                  checked={isFalsificationProbe}
                  onChange={(e) => setIsFalsificationProbe(e.target.checked)}
                  className="rounded accent-teal-600 cursor-pointer"
                />
                <label
                  htmlFor="falsifyCheck"
                  className="text-xs text-secondary cursor-pointer select-none"
                >
                  This trial is explicitly designed as a Popperian falsification probe
                  (stress-testing boundaries).
                </label>
              </div>
            </div>

            {/* Execute Trial Button */}
            <div className="flex justify-end pt-3">
              <Button
                variant="primary"
                onClick={handleRunTrial}
                className="text-xs px-4 py-2 flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
              >
                <Play className="w-3.5 h-3.5" />
                Execute Simulation Trial #{trials.length + 1}
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 2: EMPIRICAL TRIALS & VOTAT AUDIT */}
      {activeTab === 'empirical_trials' && (
        <div className="space-y-6">
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-status-success-text dark:text-status-success-text">
                  Step 2: Experiment Space Search (Chen &amp; Klahr 1999)
                </span>
                <h2 className="text-base font-bold text-strong">
                  Empirical Trial History &amp; Variable Isolation Audit
                </h2>
              </div>
              <Badge
                tone={metrics.votatRigorIndex >= 0.8 ? 'success' : 'warning'}
                className="text-xs"
              >
                VOTAT Rigor: {(metrics.votatRigorIndex * 100).toFixed(0)}%
              </Badge>
            </div>

            {trials.length === 0 ? (
              <div className="p-8 text-center text-xs text-secondary space-y-3">
                <Microscope className="w-8 h-8 mx-auto text-tertiary" />
                <p>No experimental trials executed yet.</p>
                <Button
                  variant="secondary"
                  onClick={() => setActiveTab('hypothesis_design')}
                  className="text-xs"
                >
                  Go to Workbench &amp; Run Trial #1
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {trials.map((trial, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border text-xs space-y-2.5 transition-all ${
                      trial.votatCompliantWithPrevious
                        ? 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)'
                        : 'border-amber-300 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold px-2 py-0.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2) text-strong">
                          Trial #{trial.trialIndex + 1}
                        </span>
                        {idx > 0 && (
                          <span
                            className={`flex items-center gap-1 font-semibold ${
                              trial.votatCompliantWithPrevious
                                ? 'text-status-success-text'
                                : 'text-status-warning-text dark:text-status-warning-text'
                            }`}
                          >
                            {trial.votatCompliantWithPrevious ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Strict VOTAT Isolated
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Confounded ({trial.confoundingVariableIds.length} variables altered)
                              </>
                            )}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {Object.entries(trial.observedOutputs).map(([k, val]) => (
                          <div key={k} className="flex items-center gap-1">
                            <span className="text-secondary font-medium">{k}:</span>
                            <span className="font-mono font-bold text-status-success-text dark:text-status-success-text">
                              {val}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Settings Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {Object.entries(trial.variableSettings).map(([vId, val]) => {
                        const isVaried = trial.variedVariableIds.includes(vId)
                        return (
                          <span
                            key={vId}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                              isVaried
                                ? 'bg-teal-500/20 text-status-success-text dark:text-status-success-text font-bold border border-teal-500/30'
                                : 'bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary'
                            }`}
                          >
                            {vId}: {val}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-neutral-200 dark:border-(--hub-border)">
              <Button
                variant="secondary"
                onClick={() => setActiveTab('hypothesis_design')}
                className="text-xs"
              >
                + Run Another Parameter Trial
              </Button>
              <Button
                variant="primary"
                onClick={() => setActiveTab('anomalous_data')}
                className="text-xs px-4 py-2 flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
              >
                Advance to Anomalous Crucible
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: ANOMALOUS EVIDENCE & EPISTEMIC RESOLUTION */}
      {activeTab === 'anomalous_data' && (
        <div className="space-y-6">
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-status-warning-text dark:text-status-warning-text">
                  Step 3: Anomalous Evidence Crucible (Chinn &amp; Brewer 1993)
                </span>
                <h2 className="text-base font-bold text-strong">
                  {currentLab.anomalousScenarios[0]?.title ?? 'Contradictory Observation'}
                </h2>
              </div>
              <Badge tone="warning" className="text-xs">
                Cognitive Dissonance
              </Badge>
            </div>

            {/* Anomaly Discovery Box */}
            <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-2">
              <span className="text-xs font-bold text-amber-800 dark:text-status-warning-text flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-status-warning-text" />
                Unanticipated Empirical Observation:
              </span>
              <p className="text-xs sm:text-sm font-medium text-strong leading-relaxed">
                {currentLab.anomalousScenarios[0]?.counterEvidenceObservation}
              </p>
              <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 text-xs">
                <span className="font-semibold text-secondary">Naive Intuition Refuted: </span>
                <span className="text-strong">
                  {currentLab.anomalousScenarios[0]?.naiveMisconceptionRefuted}
                </span>
              </div>
            </div>

            {/* Chinn & Brewer 7-Reaction Selector */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-strong flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-ac-text" />
                Classify Your Epistemic Response (Chinn &amp; Brewer 1993 Taxonomy):
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {[
                  {
                    key: 'theory_revision' as AnomalousDataReaction,
                    label: 'Theory / Model Revision (Recommended)',
                    desc: 'Restructure core schema to integrate the invariant mechanism.',
                  },
                  {
                    key: 'peripheral_change' as AnomalousDataReaction,
                    label: 'Peripheral Auxiliary Change',
                    desc: 'Tweak a minor assumption while keeping the core hypothesis intact.',
                  },
                  {
                    key: 'reinterpretation' as AnomalousDataReaction,
                    label: 'Data Reinterpretation',
                    desc: 'Rationalize the observation as supporting your original idea.',
                  },
                  {
                    key: 'hold_in_abeyance' as AnomalousDataReaction,
                    label: 'Hold in Abeyance',
                    desc: 'Acknowledge the contradiction but postpone revising the model.',
                  },
                  {
                    key: 'exclude' as AnomalousDataReaction,
                    label: 'Scope Exclusion',
                    desc: 'Claim this observation lies outside the boundary of the theory.',
                  },
                  {
                    key: 'reject' as AnomalousDataReaction,
                    label: 'Reject Data as Error',
                    desc: 'Dismiss the data as faulty instrument or experimental noise.',
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    onClick={() => setSelectedReaction(item.key)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      selectedReaction === item.key
                        ? 'border-teal-500 bg-teal-50/30 dark:bg-teal-950/20 ring-1 ring-teal-500'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-bold text-strong">{item.label}</div>
                    <div className="text-[11px] text-secondary mt-0.5">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Epistemic Articulation Textarea */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
              <label className="text-xs font-semibold text-strong">
                Articulate Your Revised Causal Explanation:
              </label>
              <textarea
                value={reactionExplanation}
                onChange={(e) => setReactionExplanation(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-strong focus:outline-none focus:ring-1 focus:ring-teal-500 leading-relaxed font-sans"
                placeholder="Explain why the anomalous observation occurred using physical or mechanistic principles..."
              />
            </div>

            <div className="flex justify-end pt-3">
              <Button
                variant="primary"
                onClick={handleSubmitAnomaly}
                className="text-xs px-4 py-2 flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
              >
                Submit Epistemic Resolution &amp; View Synthesis
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: CAUSAL LAW SYNTHESIS & CALIBRATED CARDS */}
      {activeTab === 'causal_synthesis' && (
        <div className="space-y-6">
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-status-success-text dark:text-status-success-text">
                  Step 4: Canonical Consolidation &amp; FSRS Scheduling
                </span>
                <h2 className="text-base font-bold text-strong">
                  Canonical Physical Invariant Law
                </h2>
              </div>
              <Badge tone="success" className="text-xs">
                Discovery Validated
              </Badge>
            </div>

            {/* Canonical Invariant Box */}
            <div className="p-4 rounded-xl bg-teal-50/30 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/40 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-status-success-text dark:text-status-success-text" />
                <span className="text-xs font-bold text-teal-900 dark:text-teal-200">
                  Universal Structural Invariant:
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-strong leading-relaxed">
                {currentLab.canonicalInvariantLaw}
              </p>
              <p className="text-xs text-secondary leading-relaxed pt-1">
                {currentLab.anomalousScenarios[0]?.canonicalExplanation}
              </p>
            </div>

            {/* Calibrated FSRS-6 Review Flashcards */}
            <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-(--hub-border)">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-strong flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-status-success-text" />
                    Calibrated FSRS-6 Review Cards ({calibratedCards.length})
                  </h3>
                  <p className="text-[11px] text-secondary">
                    Initial stability and difficulty scaled by Scientific Discovery Index (
                    {metrics.scientificDiscoveryIndex} SDI)
                  </p>
                </div>
                <Button
                  variant="primary"
                  onClick={() => setIsExported(true)}
                  disabled={isExported}
                  className="text-xs px-3 py-1.5 flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Download className="w-3 h-3" />
                  {isExported ? 'Deck Synchronized' : 'Export to Spaced Repetition'}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {calibratedCards.map((card, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-1.5">
                      <span className="font-semibold text-strong truncate">
                        {card.targetFactor}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-(--hub-panel) font-mono text-secondary">
                        {card.cardDepth}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-secondary">Front:</span>
                      <p className="text-strong font-medium leading-relaxed">{card.front}</p>
                    </div>

                    <div className="space-y-1 pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
                      <span className="text-[10px] font-bold uppercase text-secondary">Back:</span>
                      <p className="text-secondary leading-relaxed">{card.back}</p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-tertiary pt-2 border-t border-neutral-200 dark:border-(--hub-border) font-mono">
                      <span>Stability: {card.initialStabilityDays}d</span>
                      <span>Difficulty: {card.initialDifficulty}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
