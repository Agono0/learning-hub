'use client'

import React, { useState, useMemo } from 'react'
import {
  KeyRound,
  Sparkles,
  AlertTriangle,
  Compass,
  ArrowRight,
  Layers,
  Unlock,
} from 'lucide-react'
import { Panel, Badge, Tabs } from '@/ui'
import { ThresholdLiminalHUD } from '@/ui/ThresholdLiminalHUD'
import {
  getStandardThresholdConcepts,
  getStandardMimicryProbes,
  computeThresholdSignificanceIndex,
  evaluateLiminalTrajectory,
  bridgeThresholdToCurriculum,
  type LiminalPhase,
  type ThresholdDiagnosticResult,
  type ThresholdCurriculumBridge,
} from '@learning-hub/core'

export function ThresholdStudio() {
  const [activeTab, setActiveTab] = useState<
    'benchmarks' | 'mimicry' | 'trajectory' | 'curriculum'
  >('benchmarks')
  const concepts = useMemo(() => getStandardThresholdConcepts(), [])
  const [selectedConceptId, setSelectedConceptId] = useState<string>(concepts[0].id)
  const probes = useMemo(() => getStandardMimicryProbes(), [])

  // Selected probe answers
  const [selectedOptionIds, setSelectedOptionIds] = useState<Record<string, string>>({
    probe_pointers_swap: 'ptr_opt_genuine',
    probe_opp_cost_ticket: 'opp_opt_genuine',
  })

  // Diagnostic state
  const [diagnosticResult, setDiagnosticResult] = useState<ThresholdDiagnosticResult>(() => {
    return evaluateLiminalTrajectory('tc_pointers_memory', {
      probe_pointers_swap: 'ptr_opt_genuine',
    })
  })

  const [curriculumBridge, setCurriculumBridge] = useState<ThresholdCurriculumBridge>(() => {
    return bridgeThresholdToCurriculum(0.8, 100, 'POST_LIMINAL_TRANSFORMED', 'tc_pointers_memory')
  })

  const currentConcept = concepts.find((c) => c.id === selectedConceptId) ?? concepts[0]
  const currentProbes = probes.filter((p) => p.thresholdConceptId === selectedConceptId)

  const handleSelectOption = (probeId: string, optionId: string) => {
    const nextAnswers = { ...selectedOptionIds, [probeId]: optionId }
    setSelectedOptionIds(nextAnswers)
    const result = evaluateLiminalTrajectory(selectedConceptId, nextAnswers)
    setDiagnosticResult(result)
    const bridge = bridgeThresholdToCurriculum(
      0.8,
      result.overallFluencyScore,
      result.phase,
      selectedConceptId,
    )
    setCurriculumBridge(bridge)
  }

  const handleConceptChange = (conceptId: string) => {
    setSelectedConceptId(conceptId)
    const result = evaluateLiminalTrajectory(conceptId, selectedOptionIds)
    setDiagnosticResult(result)
    const bridge = bridgeThresholdToCurriculum(
      0.8,
      result.overallFluencyScore,
      result.phase,
      conceptId,
    )
    setCurriculumBridge(bridge)
  }

  const phase: LiminalPhase = diagnosticResult.phase
  const fluencyScore = diagnosticResult.overallFluencyScore

  return (
    <div className="space-y-6">
      {/* Liminal Navigation HUD */}
      <ThresholdLiminalHUD
        phase={phase}
        fluencyScore={fluencyScore}
        mimicryRiskScore={diagnosticResult.mimicryRiskScore}
        oscillationStability={diagnosticResult.oscillationStability}
        unlockedDownstreamCount={currentConcept.unlockedDownstreamConcepts.length}
        canCrossPortal={diagnosticResult.canCrossPortal}
        remediationSummary={diagnosticResult.prescribedRemediation}
      />

      {/* Main Studio Tabs */}
      <Tabs
        label="Threshold concepts studio tabs"
        items={[
          { key: 'benchmarks', label: 'Benchmark Gateways (Meyer & Land)' },
          { key: 'mimicry', label: 'Mimicry vs Integration Probes' },
          { key: 'trajectory', label: 'Liminal Space Trajectory' },
          { key: 'curriculum', label: 'Downstream Gateway Multiplier' },
        ]}
        value={activeTab}
        onChange={(key) => setActiveTab(key)}
      />

      {/* ── TAB 1: Benchmark Gateways ── */}
      {activeTab === 'benchmarks' && (
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-100 dark:border-(--hub-border)">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-status-warning-text" />
                  Disciplinal Threshold Gateways &amp; Troublesome Knowledge
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Meyer &amp; Land (2003, 2005): Transformative portals that reorganize a learner’s
                  worldview.
                </p>
              </div>

              {/* Discipline concept selector */}
              <select
                value={selectedConceptId}
                onChange={(e) => handleConceptChange(e.target.value)}
                className="text-xs p-2 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)"
              >
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.discipline.split('&')[0].trim()})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Concept Profile Card */}
              <div className="rounded-xl p-4 bg-neutral-50 dark:bg-(--hub-sunken) border border-neutral-200 dark:border-(--hub-border) space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                    {currentConcept.discipline}
                  </span>
                  <Badge tone="accent">
                    TSI:{' '}
                    {computeThresholdSignificanceIndex(currentConcept.criteriaScores).toFixed(2)}
                  </Badge>
                </div>

                <h4 className="text-lg font-bold text-strong">{currentConcept.title}</h4>
                <p className="text-xs text-secondary leading-relaxed">
                  {currentConcept.portalDescription}
                </p>

                <div className="rounded-lg p-3 bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) space-y-2">
                  <div className="text-xs font-semibold text-strong flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-status-warning-text" />
                    Troublesome Nature: {currentConcept.troublesomeType}
                  </div>
                  <p className="text-xs text-secondary italic">
                    {currentConcept.troublesomeNature}
                  </p>
                </div>

                {/* 5 Criteria Meyer & Land Breakdown */}
                <div className="space-y-2 text-xs">
                  <div className="font-semibold text-strong">5 Threshold Defining Criteria:</div>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[11px] mb-0.5 text-secondary">
                        <span>Transformative (Ontological Shift)</span>
                        <span className="font-semibold">
                          {`${Math.round(currentConcept.criteriaScores.transformativeScore * 100)}%`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{
                            width: `${currentConcept.criteriaScores.transformativeScore * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-0.5 text-secondary">
                        <span>Irreversible (Cannot be Unlearned)</span>
                        <span className="font-semibold">
                          {`${Math.round(currentConcept.criteriaScores.irreversibleScore * 100)}%`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{
                            width: `${currentConcept.criteriaScores.irreversibleScore * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-0.5 text-secondary">
                        <span>Integrative (Exposes Hidden Cohesion)</span>
                        <span className="font-semibold">
                          {`${Math.round(currentConcept.criteriaScores.integrativeScore * 100)}%`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{
                            width: `${currentConcept.criteriaScores.integrativeScore * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Unlocked Downstream Knowledge Cluster */}
              <div className="rounded-xl p-4 bg-neutral-50 dark:bg-(--hub-sunken) border border-neutral-200 dark:border-(--hub-border) space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                    Downstream Competency Cluster
                  </span>
                  <Badge tone="success">Gateway Unlocked</Badge>
                </div>

                <p className="text-xs text-secondary">
                  Mastering this single portal unblocks comprehension across the following advanced
                  curriculum domains:
                </p>

                <div className="space-y-2">
                  {currentConcept.unlockedDownstreamConcepts.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Unlock className="h-4 w-4 text-status-success-text shrink-0" />
                        <span className="font-semibold text-strong">{item}</span>
                      </div>
                      <Badge tone="neutral">Advanced</Badge>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-neutral-200 dark:border-(--hub-border) text-xs text-secondary">
                  <span className="font-semibold text-strong">Prerequisites Required: </span>
                  {currentConcept.prerequisiteConcepts.join(', ')}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ── TAB 2: Mimicry vs Integration Probes ── */}
      {activeTab === 'mimicry' && (
        <div className="space-y-6">
          <Panel>
            <div className="mb-4 pb-3 border-b border-neutral-100 dark:border-(--hub-border)">
              <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-status-warning-text" />
                Boundary Perturbation: Ritualized Mimicry Diagnostic
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Novices survive standard exams by mimicking textbook formulas. Altering the boundary
                conditions exposes whether their understanding is ritualized or truly transformed.
              </p>
            </div>

            {currentProbes.length === 0 ? (
              <div className="p-6 text-center text-xs text-secondary">
                No active probes for this concept yet. Select Memory Indirection or Opportunity
                Cost.
              </div>
            ) : (
              <div className="space-y-6">
                {currentProbes.map((probe) => {
                  const selectedId = selectedOptionIds[probe.id]
                  return (
                    <div
                      key={probe.id}
                      className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) space-y-4"
                    >
                      {/* Comparison: Standard vs Perturbed */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                            Standard Textbook Framing (Mimicry Safe):
                          </div>
                          <p className="text-xs text-strong">{probe.standardProblem}</p>
                          <div className="text-[11px] text-secondary font-mono bg-neutral-50 dark:bg-(--hub-sunken) p-1.5 rounded">
                            {probe.standardAnswer}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 space-y-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-status-warning-text dark:text-status-warning-text">
                            Perturbed Boundary Problem (Stress Test):
                          </div>
                          <p className="text-xs text-strong">{probe.perturbedProblem}</p>
                        </div>
                      </div>

                      {/* Diagnostic Options */}
                      <div className="space-y-2 pt-2">
                        <div className="text-xs font-semibold text-strong">
                          Select the accurate explanation for this boundary perturbation:
                        </div>
                        {probe.options.map((opt) => {
                          const isSelected = selectedId === opt.id
                          return (
                            <div
                              key={opt.id}
                              onClick={() => handleSelectOption(probe.id, opt.id)}
                              className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                                isSelected
                                  ? opt.isGenuineIntegration
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-950 dark:text-emerald-200 font-medium'
                                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-950 dark:text-rose-200 font-medium'
                                  : 'bg-white dark:bg-(--hub-panel) border-neutral-200 dark:border-(--hub-border) text-secondary hover:border-neutral-300'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-strong">{opt.text}</span>
                                {isSelected && (
                                  <Badge tone={opt.isGenuineIntegration ? 'success' : 'danger'}>
                                    {opt.isGenuineIntegration ? 'GENUINE' : 'MIMICRY'}
                                  </Badge>
                                )}
                              </div>
                              {isSelected && (
                                <p className="text-[11px] text-secondary pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
                                  {opt.explanation}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ── TAB 3: Liminal Space Trajectory ── */}
      {activeTab === 'trajectory' && (
        <div className="space-y-6">
          <Panel>
            <div className="mb-4 pb-3 border-b border-neutral-100 dark:border-(--hub-border)">
              <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                <Compass className="h-4 w-4 text-blue-500" />
                Liminal Space Trajectory &amp; Cognitive Oscillation Tracker
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                The suspended state of being stuck in the doorway between intuitive common sense and
                discipline mastery.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Stage 1: Pre-liminal */}
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  phase === 'PRE_LIMINAL'
                    ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 font-medium'
                    : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-strong uppercase tracking-wider">
                    1. Pre-Liminal
                  </span>
                  <Badge tone={phase === 'PRE_LIMINAL' ? 'accent' : 'neutral'}>Intuitive</Badge>
                </div>
                <p className="text-secondary leading-relaxed">
                  Everyday naive intuition. Unaware of the portal. Relies on common-sense metaphors
                  that will soon break under formal stress.
                </p>
              </div>

              {/* Stage 2: Liminal */}
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  phase === 'LIMINAL_OSCILLATING'
                    ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30 font-medium'
                    : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-strong uppercase tracking-wider">2. Liminal</span>
                  <Badge tone={phase === 'LIMINAL_OSCILLATING' ? 'warning' : 'neutral'}>
                    Oscillating
                  </Badge>
                </div>
                <p className="text-secondary leading-relaxed">
                  Stuck in the portal. High cognitive oscillation between old intuitions and formal
                  rules. Vulnerable to ritualized mimicry.
                </p>
              </div>

              {/* Stage 3: Post-liminal */}
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  phase === 'POST_LIMINAL_TRANSFORMED'
                    ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 font-medium'
                    : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-strong uppercase tracking-wider">
                    3. Post-Liminal
                  </span>
                  <Badge tone={phase === 'POST_LIMINAL_TRANSFORMED' ? 'success' : 'neutral'}>
                    Transformed
                  </Badge>
                </div>
                <p className="text-secondary leading-relaxed">
                  Portal crossed. The concept becomes an instinctive lens for perceiving the entire
                  discipline. Shift is permanent and irreversible.
                </p>
              </div>
            </div>

            <div className="rounded-xl p-4 bg-neutral-50 dark:bg-(--hub-sunken) border border-neutral-200 dark:border-(--hub-border) space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-secondary">
                Prescribed Liminal De-Anchoring Scaffold:
              </div>
              <p className="text-xs text-strong leading-relaxed">
                {diagnosticResult.prescribedRemediation}
              </p>
            </div>
          </Panel>
        </div>
      )}

      {/* ── TAB 4: Downstream Gateway Multiplier ── */}
      {activeTab === 'curriculum' && (
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-100 dark:border-(--hub-border)">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <Layers className="h-4 w-4 text-ac-text" />
                  Curriculum Gateway Transfer Multiplier
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  How crossing a threshold unblocks exponential knowledge graph retention.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl p-4 bg-neutral-50 dark:bg-(--hub-sunken) border border-neutral-200 dark:border-(--hub-border) space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-secondary">
                  Curriculum Transfer Metrics
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-(--hub-border)">
                  <div>
                    <div className="text-xs text-secondary">Base Mastery</div>
                    <div className="text-lg font-bold text-strong">
                      {`${Math.round(curriculumBridge.originalMastery * 100)}%`}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-secondary" />
                  <div>
                    <div className="text-xs text-secondary">Modulated Gateway Mastery</div>
                    <div className="text-lg font-bold text-status-success-text dark:text-status-success-text">
                      {`${Math.round(curriculumBridge.modulatedMastery * 100)}%`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary">Gateway Multiplier:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {`${curriculumBridge.gatewayMultiplier}x`}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary">Connected Competencies:</span>
                  <span className="font-bold text-strong">
                    {`${curriculumBridge.unlockedConceptsCount} Competencies`}
                  </span>
                </div>
              </div>

              <div className="rounded-xl p-4 bg-neutral-50 dark:bg-(--hub-sunken) border border-neutral-200 dark:border-(--hub-border) space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-secondary">
                  Pedagogical Diagnostic Notes:
                </div>
                <div className="space-y-1.5 text-xs text-secondary">
                  {curriculumBridge.reasoningNotes.map((note, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-status-warning-text shrink-0 mt-0.5" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
