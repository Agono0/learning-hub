'use client'

import React, { useState, useMemo } from 'react'
import {
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Compass,
  CheckCircle2,
  XCircle,
  Layers,
} from 'lucide-react'
import { Panel, Button, Badge, Tabs } from '@/ui'
import { CounterfactualHUD } from '@/ui/CounterfactualHUD'
import {
  createStandardEducationSCM,
  simulateIntervention,
  evaluateCounterfactual,
  checkDSeparation,
  evaluateBackdoorAdmissibility,
  getStandardDiagnosticProblems,
  evaluateDiagnosticResponses,
  bridgeCausalToCurriculum,
  type StructuralCausalModel,
  type CounterfactualResult,
  type CausalLadderLevel,
  type CausalReasoningAssessment,
  type CausalCurriculumBridge,
} from '@learning-hub/core'

export function CounterfactualStudio() {
  const [activeTab, setActiveTab] = useState<'dag' | 'counterfactual' | 'dsep' | 'diagnostics'>(
    'counterfactual',
  )
  const [model] = useState<StructuralCausalModel>(() => createStandardEducationSCM())

  // Tab 1: Level 2 Intervention (do-calculus)
  const [interventions, setInterventions] = useState<Record<string, number>>({
    StudyTechnique: 80,
    SleepRest: 85,
  })

  // Tab 2: Level 3 Counterfactual Evidence & What-If
  const [factualEvidence, setFactualEvidence] = useState<Record<string, number>>({
    Aptitude: 45,
    StudyHours: 6,
    SleepRest: 45,
    ExamScore: 48,
  })
  const [counterfactualInterventions, setCounterfactualInterventions] = useState<
    Record<string, number>
  >({
    StudyHours: 18,
    SleepRest: 85,
  })
  const [counterfactualResult, setCounterfactualResult] = useState<CounterfactualResult | null>(
    () => {
      return evaluateCounterfactual(createStandardEducationSCM(), {
        modelId: 'edu_exam_causality',
        evidence: { Aptitude: 45, StudyHours: 6, SleepRest: 45, ExamScore: 48 },
        interventions: { StudyHours: 18, SleepRest: 85 },
        targetVariableId: 'ExamScore',
      })
    },
  )

  // Tab 3: d-Separation & Backdoor Explorer
  const [treatmentVar, setTreatmentVar] = useState<string>('StudyTechnique')
  const [outcomeVar, setOutcomeVar] = useState<string>('ExamScore')
  const [conditioningSet, setConditioningSet] = useState<string[]>(['Aptitude'])

  // Tab 4: Diagnostic Assessment
  const [diagnosticResponses, setDiagnosticResponses] = useState<Record<string, string>>({})
  const [assessment, setAssessment] = useState<CausalReasoningAssessment | null>(null)
  const [curriculumBridge, setCurriculumBridge] = useState<CausalCurriculumBridge | null>(null)

  // Simulation run for Tab 1
  const interventionalValues = useMemo(() => {
    return simulateIntervention(model, interventions)
  }, [model, interventions])

  const baselineValues = useMemo(() => {
    return simulateIntervention(model, {})
  }, [model])

  // d-Separation analysis for Tab 3
  const dSepAnalysis = useMemo(() => {
    return checkDSeparation(model, treatmentVar, outcomeVar, conditioningSet)
  }, [model, treatmentVar, outcomeVar, conditioningSet])

  const backdoorAnalysis = useMemo(() => {
    return evaluateBackdoorAdmissibility(model, treatmentVar, outcomeVar, conditioningSet)
  }, [model, treatmentVar, outcomeVar, conditioningSet])

  const handleRunCounterfactual = () => {
    const res = evaluateCounterfactual(model, {
      modelId: model.id,
      evidence: factualEvidence,
      interventions: counterfactualInterventions,
      targetVariableId: 'ExamScore',
    })
    setCounterfactualResult(res)
  }

  const handleToggleConditioning = (varId: string) => {
    setConditioningSet((prev) =>
      prev.includes(varId) ? prev.filter((id) => id !== varId) : [...prev, varId],
    )
  }

  const handleSelectDiagnosticOption = (problemId: string, optionId: string) => {
    setDiagnosticResponses((prev) => ({ ...prev, [problemId]: optionId }))
  }

  const handleGradeAssessment = () => {
    const res = evaluateDiagnosticResponses(diagnosticResponses)
    setAssessment(res)
    const bridge = bridgeCausalToCurriculum(0.8, res.overallMasteryScore, res.ladderLevelAchieved)
    setCurriculumBridge(bridge)
  }

  const ladderLevel: CausalLadderLevel = assessment?.ladderLevelAchieved ?? 'L3_COUNTERFACTUAL'
  const masteryScore = assessment?.overallMasteryScore ?? 85

  return (
    <div className="space-y-6">
      {/* Causal Telemetry HUD */}
      <CounterfactualHUD
        ladderLevel={ladderLevel}
        masteryScore={masteryScore}
        activeInterventionsCount={Object.keys(counterfactualInterventions).length}
        lastCausalLift={counterfactualResult?.causalLift}
        isBackdoorAdmissible={backdoorAnalysis.isAdmissible}
        confounderRisk={backdoorAnalysis.isAdmissible ? 'LOW' : 'HIGH'}
        interventionSummary={
          counterfactualResult?.narrativeExplanation ??
          'Counterfactual Abduction-Action-Prediction active.'
        }
      />

      {/* Main Studio Tabs */}
      <Tabs
        label="Causal inference studio tabs"
        items={[
          { key: 'counterfactual', label: 'Level 3: Counterfactual What-If' },
          { key: 'dag', label: 'Level 2: Graph Surgery do(X)' },
          { key: 'dsep', label: 'd-Separation & Backdoor Paths' },
          { key: 'diagnostics', label: 'Causal Reasoning Diagnostics' },
        ]}
        value={activeTab}
        onChange={(key) => setActiveTab(key)}
      />

      {/* ── TAB 1: Level 3 Counterfactual What-If ── */}
      {activeTab === 'counterfactual' && (
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-100 dark:border-(--hub-border)">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Pearl’s 3-Step Counterfactual Simulator (Abduction-Action-Prediction)
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Hold individual latent exogenous conditions U invariant while altering historical
                  decisions.
                </p>
              </div>
              <Button onClick={handleRunCounterfactual}>
                <Play className="h-4 w-4 mr-1.5" />
                Compute Counterfactual
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Factual Evidence Input */}
              <div className="space-y-4 rounded-xl p-4 bg-neutral-50 dark:bg-(--hub-sunken) border border-neutral-200 dark:border-(--hub-border)">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                    Step 1: Factual Evidence (Observed History)
                  </span>
                  <Badge tone="neutral">Actual Reality</Badge>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-strong flex justify-between">
                      <span>Prior Aptitude / Schema Foundation</span>
                      <span className="font-bold">{factualEvidence.Aptitude ?? 45}</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={factualEvidence.Aptitude ?? 45}
                      onChange={(e) =>
                        setFactualEvidence((prev) => ({
                          ...prev,
                          Aptitude: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-strong flex justify-between">
                      <span>Actual Deliberate Study Hours</span>
                      <span className="font-bold">{`${factualEvidence.StudyHours ?? 6}h`}</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={factualEvidence.StudyHours ?? 6}
                      onChange={(e) =>
                        setFactualEvidence((prev) => ({
                          ...prev,
                          StudyHours: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-strong flex justify-between">
                      <span>Actual Sleep Rest &amp; Consolidation</span>
                      <span className="font-bold">{`${factualEvidence.SleepRest ?? 45}%`}</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={factualEvidence.SleepRest ?? 45}
                      onChange={(e) =>
                        setFactualEvidence((prev) => ({
                          ...prev,
                          SleepRest: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-strong flex justify-between">
                      <span>Actual Measured Exam Score</span>
                      <span className="font-bold">{`${factualEvidence.ExamScore ?? 48} pts`}</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={factualEvidence.ExamScore ?? 48}
                      onChange={(e) =>
                        setFactualEvidence((prev) => ({
                          ...prev,
                          ExamScore: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-amber-500"
                    />
                  </div>
                </div>

                <div className="rounded-lg p-3 bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-xs text-secondary space-y-1">
                  <div className="font-semibold text-strong">Abduced Exogenous States (U):</div>
                  <div>
                    • U_Aptitude:{' '}
                    {counterfactualResult?.exogenousStates.Aptitude?.toFixed(1) ?? '—'}
                  </div>
                  <div>
                    • U_ExamShock:{' '}
                    {counterfactualResult?.exogenousStates.ExamScore?.toFixed(1) ?? '—'} (latent
                    exam variance)
                  </div>
                </div>
              </div>

              {/* Right Column: Counterfactual Action & Outcome */}
              <div className="space-y-4 rounded-xl p-4 bg-neutral-50 dark:bg-(--hub-sunken) border border-neutral-200 dark:border-(--hub-border)">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                    Steps 2 &amp; 3: Hypothetical Action do(X=x*)
                  </span>
                  <Badge tone="accent">Alternate World</Badge>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-strong flex justify-between">
                      <span>What if Study Hours had been:</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {`${counterfactualInterventions.StudyHours ?? 18}h`}
                      </span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={counterfactualInterventions.StudyHours ?? 18}
                      onChange={(e) =>
                        setCounterfactualInterventions((prev) => ({
                          ...prev,
                          StudyHours: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-strong flex justify-between">
                      <span>What if Sleep Quality had been:</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        {`${counterfactualInterventions.SleepRest ?? 85}%`}
                      </span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={counterfactualInterventions.SleepRest ?? 85}
                      onChange={(e) =>
                        setCounterfactualInterventions((prev) => ({
                          ...prev,
                          SleepRest: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>

                {/* Counterfactual Prediction Card */}
                {counterfactualResult && (
                  <div className="rounded-xl p-4 bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-secondary">
                        Counterfactual Score Prediction:
                      </span>
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                        {`${counterfactualResult.counterfactualValue} pts`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-100 dark:border-(--hub-border)">
                      <span className="text-secondary">Causal Lift over actual reality:</span>
                      <span
                        className={`font-bold ${
                          counterfactualResult.causalLift >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {`${counterfactualResult.causalLift > 0 ? '+' : ''}${counterfactualResult.causalLift} pts`}
                      </span>
                    </div>

                    <p className="text-xs text-secondary leading-relaxed pt-2 border-t border-neutral-100 dark:border-(--hub-border)">
                      {counterfactualResult.narrativeExplanation}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ── TAB 2: Level 2 Graph Surgery do(X) ── */}
      {activeTab === 'dag' && (
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-100 dark:border-(--hub-border)">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-500" />
                  Mutilated DAG &amp; Interventional Simulation (do-Calculus)
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Intervening on a variable severs all incoming causal arrows, eliminating
                  confounding paths.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => setInterventions({ StudyTechnique: 80, SleepRest: 85 })}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset Defaults
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Variable Controls */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">
                  Active Interventions do(X = x)
                </h4>

                <div className="space-y-3">
                  {Object.values(model.variables)
                    .filter((v) => v.id !== 'ExamScore')
                    .map((v) => {
                      const isIntervened = interventions[v.id] !== undefined
                      return (
                        <div
                          key={v.id}
                          className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-strong">{v.name}</span>
                            <Button
                              variant={isIntervened ? 'primary' : 'secondary'}
                              onClick={() => {
                                if (isIntervened) {
                                  const next = { ...interventions }
                                  delete next[v.id]
                                  setInterventions(next)
                                } else {
                                  setInterventions((prev) => ({
                                    ...prev,
                                    [v.id]: v.defaultValue,
                                  }))
                                }
                              }}
                            >
                              {isIntervened ? 'Intervened' : 'Passive'}
                            </Button>
                          </div>

                          {isIntervened && (
                            <div className="pt-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-secondary">Value pinned by do-calculus:</span>
                                <span className="font-bold text-strong">{interventions[v.id]}</span>
                              </div>
                              <input
                                type="range"
                                min={v.domain[0]}
                                max={v.domain[1]}
                                value={interventions[v.id]}
                                onChange={(e) =>
                                  setInterventions((prev) => ({
                                    ...prev,
                                    [v.id]: Number(e.target.value),
                                  }))
                                }
                                className="w-full accent-blue-500"
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Simulation Result Comparison */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">
                  Downstream Structural Effects
                </h4>

                <div className="rounded-xl p-4 bg-neutral-50 dark:bg-(--hub-sunken) border border-neutral-200 dark:border-(--hub-border) space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-(--hub-border)">
                    <div>
                      <div className="text-xs font-medium text-secondary">
                        Passive Observational Score
                      </div>
                      <div className="text-lg font-bold text-strong">
                        {`${baselineValues.ExamScore} pts`}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-secondary" />
                    <div>
                      <div className="text-xs font-medium text-secondary">
                        Interventional Score P(Y|do(X))
                      </div>
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {`${interventionalValues.ExamScore} pts`}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="font-semibold text-strong">Topological Value Propagation:</div>
                    {Object.entries(interventionalValues).map(([k, val]) => (
                      <div key={k} className="flex justify-between items-center py-1">
                        <span className="text-secondary">{model.variables[k]?.name ?? k}:</span>
                        <span className="font-mono font-medium text-strong">
                          {typeof val === 'number' ? val.toFixed(1) : val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ── TAB 3: d-Separation & Backdoor Paths ── */}
      {activeTab === 'dsep' && (
        <div className="space-y-6">
          <Panel>
            <div className="mb-4 pb-3 border-b border-neutral-100 dark:border-(--hub-border)">
              <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                <Compass className="h-4 w-4 text-emerald-500" />
                d-Separation &amp; Backdoor Criterion Admissibility Engine
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Determine whether conditioning set Z blocks all spurious non-causal paths between
                treatment and outcome.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Treatment selector */}
              <div>
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-1">
                  Treatment Variable (X)
                </label>
                <select
                  value={treatmentVar}
                  onChange={(e) => setTreatmentVar(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)"
                >
                  {Object.values(model.variables).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Outcome selector */}
              <div>
                <label className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-1">
                  Outcome Variable (Y)
                </label>
                <select
                  value={outcomeVar}
                  onChange={(e) => setOutcomeVar(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)"
                >
                  {Object.values(model.variables).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Backdoor verdict badge */}
              <div className="flex flex-col justify-end">
                <div
                  className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                    backdoorAnalysis.isAdmissible
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200'
                  }`}
                >
                  {backdoorAnalysis.isAdmissible ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {backdoorAnalysis.isAdmissible
                      ? 'Backdoor Admissible (Unconfounded)'
                      : 'Backdoor Violated (Confounded)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Conditioning Set Selector */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-secondary uppercase tracking-wider block mb-2">
                Conditioning Set (Z): Select variables to control for:
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.values(model.variables).map((v) => {
                  const isChecked = conditioningSet.includes(v.id)
                  return (
                    <Button
                      key={v.id}
                      variant={isChecked ? 'primary' : 'secondary'}
                      onClick={() => handleToggleConditioning(v.id)}
                    >
                      {v.name}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Path Tracing & Blocking Log */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">
                Path-by-Path d-Separation Analysis:
              </h4>

              {dSepAnalysis.paths.map((p, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-strong">{p.nodes.join(' ↔ ')}</span>
                    <Badge tone={p.isBlocked ? 'success' : 'danger'}>
                      {p.isBlocked ? 'BLOCKED' : 'ACTIVE / OPEN'}
                    </Badge>
                  </div>
                  <p className="text-secondary">{p.blockingReason}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* ── TAB 4: Causal Reasoning Diagnostics ── */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-100 dark:border-(--hub-border)">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Causal Reasoning Diagnostic &amp; Misconception Evaluator
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Test your mastery across Judea Pearl’s 3 levels: Seeing, Doing, and Imagining.
                </p>
              </div>
              <Button onClick={handleGradeAssessment}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Grade Assessment
              </Button>
            </div>

            {/* Diagnostic Problems List */}
            <div className="space-y-6">
              {getStandardDiagnosticProblems().map((prob) => {
                const selectedOption = diagnosticResponses[prob.id]
                return (
                  <div
                    key={prob.id}
                    className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                        {prob.title}
                      </span>
                      <Badge tone="accent">{prob.queryType}</Badge>
                    </div>

                    <p className="text-xs text-secondary italic">{prob.scenarioDescription}</p>
                    <p className="text-sm font-semibold text-strong">{prob.question}</p>

                    <div className="space-y-2 pt-2">
                      {prob.options.map((opt) => {
                        const isSelected = selectedOption === opt.id
                        return (
                          <div
                            key={opt.id}
                            onClick={() => handleSelectDiagnosticOption(prob.id, opt.id)}
                            className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 text-strong font-medium'
                                : 'bg-white dark:bg-(--hub-panel) border-neutral-200 dark:border-(--hub-border) text-secondary hover:border-neutral-300'
                            }`}
                          >
                            {opt.text}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Assessment Feedback Banner */}
            {assessment && (
              <div className="mt-6 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-strong">
                    Diagnostic Score: {`${assessment.overallMasteryScore}%`} — Ladder Status:{' '}
                    {assessment.ladderLevelAchieved}
                  </div>
                  <Badge tone="success">EVALUATED</Badge>
                </div>
                <p className="text-xs text-secondary">{assessment.recommendation}</p>

                {curriculumBridge && (
                  <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800 text-xs text-secondary space-y-1">
                    <div className="font-semibold text-strong">Curriculum Transfer Modulation:</div>
                    {curriculumBridge.reasoningNotes.map((note, idx) => (
                      <div key={idx}>• {note}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
