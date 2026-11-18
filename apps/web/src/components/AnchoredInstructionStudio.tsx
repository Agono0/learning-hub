/**
 * @file apps/web/src/components/AnchoredInstructionStudio.tsx
 * @description Interactive Workbench for Anchored Instruction & Situated Problem Solving.
 *
 * Implements:
 * - 4 interactive tabs:
 *   1. Macrocontext Narrative & Embedded Clues
 *   2. Sub-Goal Hierarchy & Parameter Extraction
 *   3. What-If Sensitivity & Constraint Stress-Testing
 *   4. Mission Decision & Calibrated FSRS Deck
 *
 * Grounded in Cognition and Technology Group at Vanderbilt (CTGV 1990) and Catrambone (1998).
 * Adheres strictly to UI Signature: mode-aware tokens, zero ghost classes, kit-first.
 */

'use client'

import React, { useState } from 'react'
import {
  CANONICAL_MACROCONTEXT_CASES,
  evaluateAnchoredSolution,
  simulateAnchoredSensitivity,
  generateAnchoredFSRSDeck,
  type MacrocontextCase,
  type AnchoredEvaluation,
  type CalibratedAnchoredDeck,
} from '@learning-hub/core/anchored'
import { apiSend } from '@/lib/transport'
import { AnchoredInstructionHUD, Badge, Button, Panel, Tabs } from '@/ui'
import {
  Activity,
  Anchor,
  CheckCircle2,
  Compass,
  FileCheck,
  Flame,
  Layers,
  Sliders,
  Sparkles,
} from 'lucide-react'

export function AnchoredInstructionStudio() {
  const [selectedCaseId, setSelectedCaseId] = useState<string>(CANONICAL_MACROCONTEXT_CASES[0]!.id)
  const [activeTab, setActiveTab] = useState<'anchor' | 'subgoals' | 'sensitivity' | 'synthesis'>(
    'anchor',
  )

  const activeCase: MacrocontextCase =
    CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === selectedCaseId) ??
    CANONICAL_MACROCONTEXT_CASES[0]!

  // Learner inputs
  const [extractedValues, setExtractedValues] = useState<Record<string, number>>({
    'data-dist-oneway': 120,
    'data-cruising-speed': 100,
    'data-headwind': 20,
    'data-fuel-burn': 8.0,
    'data-total-fuel': 36,
    'data-reserve-required': 5,
    'data-ground-time': 0.5,
    'data-departure-time': 16.0,
    'data-sunset-time': 18.75,
  })

  const [subGoalSequence, setSubGoalSequence] = useState<string[]>([
    'sg-outbound-groundspeed',
    'sg-outbound-time',
    'sg-inbound-groundspeed',
    'sg-inbound-time',
    'sg-total-flight-time',
    'sg-total-mission-time',
    'sg-fuel-consumed',
    'sg-fuel-remaining',
  ])

  const [subGoalOutputs, setSubGoalOutputs] = useState<Record<string, number>>({
    'sg-outbound-groundspeed': 80,
    'sg-outbound-time': 1.5,
    'sg-inbound-groundspeed': 120,
    'sg-inbound-time': 1.0,
    'sg-total-flight-time': 2.5,
    'sg-total-mission-time': 19.0,
    'sg-fuel-consumed': 20.0,
    'sg-fuel-remaining': 16.0,
  })

  const [finalDecision, setFinalDecision] = useState<string>('delay_or_reroute')
  const [justification, setJustification] = useState<string>(
    'The flight has 16 gallons remaining which satisfies the minimum touchdown fuel reserve of 5.0 gallons; however, the mission arrival time is 19:00 (7:00 PM), which breaches the sunset daylight deadline of 18:45 (6:45 PM) by 15 minutes. Departure must occur earlier or turnaround must be compressed.',
  )

  // Sensitivity simulation state
  const [variedParamId, setVariedParamId] = useState<string>('data-headwind')
  const [variedValue, setVariedValue] = useState<number>(30)

  // Real-time evaluation
  const currentEvaluation: AnchoredEvaluation = evaluateAnchoredSolution(activeCase, {
    caseId: activeCase.id,
    extractedDataValues: extractedValues,
    subGoalSequence,
    calculatedSubGoalOutputs: subGoalOutputs,
    finalDecisionChoice: finalDecision,
    decisionJustification: justification,
  })

  // FSRS Deck State
  const [generatedDeck, setGeneratedDeck] = useState<CalibratedAnchoredDeck | null>(null)
  const [isExporting, setIsExporting] = useState<boolean>(false)

  // Reset handler when switching cases
  const handleCaseSelect = (caseId: string) => {
    setSelectedCaseId(caseId)
    const newCase =
      CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === caseId) ?? CANONICAL_MACROCONTEXT_CASES[0]!

    // Populate initial extracted values from first few data points
    const initExtracted: Record<string, number> = {}
    newCase.embeddedData.slice(0, 4).forEach((d) => {
      initExtracted[d.id] = d.value
    })
    setExtractedValues(initExtracted)

    // Populate default subgoals
    setSubGoalSequence(newCase.subGoalHierarchy.map((sg) => sg.id))
    const initOutputs: Record<string, number> = {}
    newCase.subGoalHierarchy.forEach((sg) => {
      initOutputs[sg.id] = sg.expectedValue
    })
    setSubGoalOutputs(initOutputs)

    setFinalDecision('pending')
    setJustification('Analyzing situated constraints and sub-goal dependencies.')
    setGeneratedDeck(null)
  }

  // Handle FSRS deck generation via API or local fallback
  const handleGenerateDeck = async () => {
    setIsExporting(true)
    try {
      const result = await apiSend<CalibratedAnchoredDeck>('/api/anchored', 'POST', {
        action: 'generate_deck',
        caseId: activeCase.id,
        submission: {
          caseId: activeCase.id,
          extractedDataValues: extractedValues,
          subGoalSequence,
          calculatedSubGoalOutputs: subGoalOutputs,
          finalDecisionChoice: finalDecision,
          decisionJustification: justification,
        },
      })
      if (result) {
        setGeneratedDeck(result)
      } else {
        setGeneratedDeck(generateAnchoredFSRSDeck(activeCase, currentEvaluation))
      }
    } catch {
      setGeneratedDeck(generateAnchoredFSRSDeck(activeCase, currentEvaluation))
    } finally {
      setIsExporting(false)
    }
  }

  // Run sensitivity simulation
  const sensitivityResult = simulateAnchoredSensitivity(activeCase, variedParamId, variedValue)

  return (
    <div className="space-y-6">
      {/* Telemetry HUD */}
      <AnchoredInstructionHUD evaluation={currentEvaluation} activeCaseTitle={activeCase.title} />

      {/* Main Studio Controls */}
      <div className="space-y-4">
        {/* Case Selector Dropdown & Meta */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">
              Select Situated Macrocontext
            </label>
            <select
              value={selectedCaseId}
              onChange={(e) => handleCaseSelect(e.target.value)}
              className="w-full sm:w-96 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface px-3 py-1.5 text-xs sm:text-sm text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
            >
              {CANONICAL_MACROCONTEXT_CASES.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.domain.replace('_', ' ').toUpperCase()}] {c.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="accent">Difficulty: {activeCase.difficulty}</Badge>
            <Badge tone="violet">{activeCase.embeddedData.length} Data Points</Badge>
            <Badge tone="cyan">{activeCase.subGoalHierarchy.length} Sub-Goals</Badge>
          </div>
        </div>

        {/* 4-Tab Navigation */}
        <Tabs
          label="Anchored Instruction Studio Tabs"
          value={activeTab}
          onChange={(tab) =>
            setActiveTab(tab as 'anchor' | 'subgoals' | 'sensitivity' | 'synthesis')
          }
          items={[
            {
              key: 'anchor',
              label: '1. Narrative Anchor & Clues',
            },
            {
              key: 'subgoals',
              label: '2. Sub-Goal Decomposition',
            },
            {
              key: 'sensitivity',
              label: '3. What-If Sensitivity Tester',
            },
            {
              key: 'synthesis',
              label: '4. Mission Decision & FSRS Deck',
            },
          ]}
        />

        {/* Tab 1: Narrative Anchor & Clues */}
        {activeTab === 'anchor' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Story Anchor Presentation */}
            <div className="lg:col-span-2 space-y-4">
              <Panel className="space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                  <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                    <Anchor className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                    Authentic Problem Macrocontext (CTGV 1990)
                  </h4>
                  <Badge tone="neutral">Authentic Narrative</Badge>
                </div>
                <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm text-strong leading-relaxed bg-surface-elevated p-4 rounded-lg border border-neutral-200 dark:border-(--hub-border)">
                  {activeCase.narrativeScenario}
                </div>
                <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 text-xs text-secondary">
                  <span className="font-semibold text-indigo-900 dark:text-indigo-200 block mb-0.5">
                    Mission Objective:
                  </span>
                  {activeCase.missionGoal}
                </div>
              </Panel>
            </div>

            {/* Embedded Clues Discrimination Panel */}
            <div className="space-y-4">
              <Panel className="space-y-3">
                <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5 border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                  <Compass className="h-4 w-4 text-(--hub-success,#10b981)" />
                  Embedded Clues Ledger
                </h4>
                <p className="text-[11px] text-secondary">
                  Select vital parameters while rejecting narrative distractors (EIER score).
                </p>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {activeCase.embeddedData.map((d) => {
                    const isExtracted = extractedValues[d.id] !== undefined
                    return (
                      <div
                        key={d.id}
                        onClick={() => {
                          setExtractedValues((prev) => {
                            const next = { ...prev }
                            if (next[d.id] !== undefined) delete next[d.id]
                            else next[d.id] = d.value
                            return next
                          })
                        }}
                        className={`cursor-pointer rounded-lg border p-2.5 text-xs space-y-1 transition-all ${
                          isExtracted
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-neutral-200 dark:border-(--hub-border) bg-surface hover:bg-surface-elevated'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-strong">{d.label}</span>
                          <Badge tone={isExtracted ? 'accent' : 'neutral'}>
                            {isExtracted ? 'Extracted' : 'Unchecked'}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-secondary">
                          Value: {d.value} {d.unit}
                        </p>
                        <p className="text-[10px] text-secondary italic">"{d.narrativeLocation}"</p>
                      </div>
                    )
                  })}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* Tab 2: Sub-Goal Decomposition */}
        {activeTab === 'subgoals' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Panel className="space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                  <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-(--hub-accent,#8b5cf6)" />
                    Catrambone Sub-Goal Learning Decomposition
                  </h4>
                  <span className="text-xs text-secondary">Prerequisite Dependency Validation</span>
                </div>

                <div className="space-y-3">
                  {activeCase.subGoalHierarchy.map((sg, idx) => {
                    const feedback = currentEvaluation.subGoalFeedback.find(
                      (f) => f.subGoalId === sg.id,
                    )
                    const isOptimal = feedback?.status === 'optimal'
                    const isViolated = feedback?.status === 'dependency_violated'

                    return (
                      <div
                        key={sg.id}
                        className={`rounded-lg border p-3 text-xs space-y-2 transition-all ${
                          isViolated
                            ? 'border-rose-500/50 bg-rose-500/5'
                            : isOptimal
                              ? 'border-emerald-500/50 bg-emerald-500/5'
                              : 'border-neutral-200 dark:border-(--hub-border) bg-surface'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-strong flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated border border-neutral-200 dark:border-(--hub-border) text-[10px]">
                              {idx + 1}
                            </span>
                            {sg.title}
                          </span>
                          <Badge tone={isOptimal ? 'success' : isViolated ? 'danger' : 'warning'}>
                            {feedback?.status ?? 'pending'}
                          </Badge>
                        </div>

                        <p className="text-secondary text-[11px]">{sg.description}</p>
                        <p className="text-[10px] text-strong font-mono bg-surface-elevated p-1.5 rounded">
                          Formula: {sg.formulaDescription}
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                          <label className="text-[11px] font-medium text-secondary">
                            Your Calculated Output:
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={subGoalOutputs[sg.id] ?? ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value)
                              setSubGoalOutputs((prev) => ({
                                ...prev,
                                [sg.id]: Number.isNaN(val) ? 0 : val,
                              }))
                            }}
                            className="w-28 rounded border border-neutral-200 dark:border-(--hub-border) bg-surface px-2 py-1 text-xs text-strong focus:outline-none focus:ring-1 focus:ring-(--hub-primary)"
                          />
                          <span className="text-[10px] text-secondary">
                            Expected: {sg.expectedValue} (±{sg.tolerancePct ?? 5}%)
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>
            </div>

            {/* Constraint Matrix */}
            <div className="space-y-4">
              <Panel className="space-y-3">
                <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5 border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                  <Activity className="h-4 w-4 text-(--hub-warning,#f59e0b)" />
                  Boundary Constraints Matrix
                </h4>
                <div className="space-y-2">
                  {activeCase.constraints.map((c) => (
                    <div
                      key={c.id}
                      className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-medium text-strong">
                        <span>{c.name}</span>
                        <Badge tone="warning">
                          {c.minSafeValue !== undefined ? `Min ≥ ${c.minSafeValue}` : ''}
                          {c.maxSafeValue !== undefined ? `Max ≤ ${c.maxSafeValue}` : ''} {c.unit}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-secondary">{c.description}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* Tab 3: What-If Sensitivity Simulation */}
        {activeTab === 'sensitivity' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Panel className="space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                  <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                    <Sliders className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                    "What-If" Sensitivity &amp; Parameter Perturbation
                  </h4>
                  <Badge tone="cyan">Dynamic Propagation</Badge>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-secondary">
                    Select Parameter to Perturb:
                  </label>
                  <select
                    value={variedParamId}
                    onChange={(e) => {
                      setVariedParamId(e.target.value)
                      const dp = activeCase.embeddedData.find((d) => d.id === e.target.value)
                      if (dp) setVariedValue(dp.value)
                    }}
                    className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface px-3 py-1.5 text-xs sm:text-sm text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
                  >
                    {activeCase.embeddedData
                      .filter((d) => d.isRelevant)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label} (Nominal: {d.value} {d.unit})
                        </option>
                      ))}
                  </select>

                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-strong">Perturbed Value:</span>
                      <span className="font-mono font-semibold text-(--hub-primary)">
                        {variedValue}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={variedValue * 2.5 || 100}
                      step={1}
                      value={variedValue}
                      onChange={(e) => setVariedValue(parseFloat(e.target.value))}
                      className="w-full cursor-pointer accent-(--hub-primary)"
                    />
                  </div>
                </div>

                {/* Simulated Outputs Table */}
                <div className="space-y-2 pt-3 border-t border-neutral-200 dark:border-(--hub-border)">
                  <h5 className="text-xs font-semibold text-strong">
                    Propagated Downstream System Metrics:
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(sensitivityResult.simulatedOutputs).map(([key, val]) => (
                      <div
                        key={key}
                        className="rounded border border-neutral-200 dark:border-(--hub-border) bg-surface p-2 text-xs"
                      >
                        <span className="text-[10px] text-secondary block truncate">{key}</span>
                        <span className="font-mono font-semibold text-strong">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            </div>

            {/* Constraint Impact Warning Board */}
            <div className="space-y-4">
              <Panel className="space-y-3">
                <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5 border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                  <Flame className="h-4 w-4 text-(--hub-danger,#ef4444)" />
                  Constraint Breaches &amp; Safety Margins
                </h4>
                <div className="space-y-2">
                  {sensitivityResult.constraintImpacts.map((imp) => (
                    <div
                      key={imp.constraintId}
                      className={`rounded border p-2.5 text-xs space-y-1 ${
                        imp.isSatisfied
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-rose-500/50 bg-rose-500/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-strong">{imp.constraintId}</span>
                        <Badge tone={imp.isSatisfied ? 'success' : 'danger'}>
                          {imp.isSatisfied ? 'PASS' : 'BREACH'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-secondary">Margin: {imp.margin}</p>
                      {imp.warningMessage && (
                        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          {imp.warningMessage}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* Tab 4: Mission Decision & FSRS Deck */}
        {activeTab === 'synthesis' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Panel className="space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                  <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5">
                    <FileCheck className="h-4 w-4 text-(--hub-primary,#2563eb)" />
                    Mission Decision Ruling &amp; Justification
                  </h4>
                  <Badge tone={currentEvaluation.decisionApproved ? 'success' : 'warning'}>
                    IKRS {currentEvaluation.ikrs}/100
                  </Badge>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-medium text-strong">
                    Your Operational Ruling:
                  </label>
                  <input
                    type="text"
                    value={finalDecision}
                    onChange={(e) => setFinalDecision(e.target.value)}
                    placeholder="e.g. approve_mission, delay_departure, reroute_to_depot"
                    className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 text-xs text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
                  />

                  <label className="text-xs font-medium text-strong block pt-1">
                    Mathematical &amp; Constraint Justification:
                  </label>
                  <textarea
                    rows={4}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Articulate how extracted parameters prove constraint satisfaction..."
                    className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-3 text-xs sm:text-sm text-strong focus:outline-none focus:ring-2 focus:ring-(--hub-primary)"
                  />
                </div>

                <div className="pt-2">
                  <Button
                    variant="primary"
                    onClick={handleGenerateDeck}
                    disabled={isExporting}
                    className="w-full flex items-center justify-center gap-1.5 text-xs py-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    {isExporting
                      ? 'Synthesizing FSRS Spaced Repetition Deck...'
                      : 'Generate Calibrated FSRS-6 Review Deck'}
                  </Button>
                </div>
              </Panel>
            </div>

            {/* Generated Deck Review Cards */}
            <div className="space-y-4">
              <Panel className="space-y-3">
                <h4 className="text-sm font-semibold text-strong flex items-center gap-1.5 border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                  <CheckCircle2 className="h-4 w-4 text-(--hub-success,#10b981)" />
                  Calibrated Situated Review Cards
                </h4>

                {generatedDeck ? (
                  <div className="space-y-3">
                    <p className="text-xs text-secondary">
                      Deck: {generatedDeck.caseTitle} (Stability scaled to{' '}
                      {generatedDeck.cards[0]?.fsrsParameters.stability}d)
                    </p>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {generatedDeck.cards.map((card, idx) => (
                        <div
                          key={card.id}
                          className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-surface p-2.5 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <Badge tone="neutral">Card {idx + 1}</Badge>
                            <Badge tone="cyan">{card.cardType}</Badge>
                          </div>
                          <p className="text-strong font-medium text-[11px]">{card.front}</p>
                          <p className="text-secondary text-[11px] leading-snug whitespace-pre-line border-t border-neutral-200 dark:border-(--hub-border) pt-1">
                            {card.back}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-secondary space-y-2">
                    <Anchor className="h-8 w-8 mx-auto text-secondary/40" />
                    <p>
                      Click "Generate Calibrated FSRS-6 Review Deck" above to generate situated
                      transfer flashcards scaled by your IKRS score.
                    </p>
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
