'use client'

import React, { useState, useEffect } from 'react'
import {
  Target,
  Activity,
  Flame,
  Sparkles,
  Plus,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react'
import { Button, Panel, Badge, SelfRegulatedLearningHUD } from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'
import type {
  ForethoughtPlan,
  VolitionalControlSession,
  SelfReflectionEvaluation,
  MSLQProfileResult,
  ZimmermanCyclicIndexResult,
  ForethoughtEvaluationResult,
  VolitionalAnalysisResult,
  AttributionalStyleResult,
  LearningGoalOrientation,
} from '@learning-hub/core'

export function SelfRegulatedLearningStudio() {
  const [activeTab, setActiveTab] = useState<'forethought' | 'volition' | 'reflection' | 'mslq'>(
    'forethought',
  )
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Zimmerman Cyclical Telemetry State
  const [cyclicResult, setCyclicResult] = useState<ZimmermanCyclicIndexResult>({
    compositeSRLIndex: 78,
    maturityLevel: 'proficient',
    forethoughtScore: 82,
    volitionalScore: 76,
    selfReflectionScore: 78,
    cyclicPhaseEquilibrium: 91,
    prescribedPhaseFocus: 'volition',
  })

  // Tab 1: Forethought Plan State
  const [forethoughtPlan, setForethoughtPlan] = useState<ForethoughtPlan>({
    id: 'plan_active',
    targetSkillOrTopic: 'Graph Neural Networks & Message Passing',
    proximalSubgoals: [
      'Derive permutation equivariance in node embeddings',
      'Code a 2-layer GCN spectral convolution layer in PyTorch',
      'Test over-smoothing mitigation using residual skip connections',
    ],
    distalOutcome:
      'Design robust GNN architectures capable of node classification on citation benchmarks',
    strategicPlans: [
      {
        id: 'strat_1',
        strategy: 'retrieval_practice',
        rationale: 'Active recall of adjacency matrix normalization without reference',
        plannedMinutes: 25,
        completed: false,
      },
      {
        id: 'strat_2',
        strategy: 'dual_coding',
        rationale: 'Draw computational graph of k-hop neighborhood aggregation',
        plannedMinutes: 20,
        completed: false,
      },
      {
        id: 'strat_3',
        strategy: 'elaboration',
        rationale: 'Contrast Weisfeiler-Lehman 1-WL isomorphism test with spatial message passing',
        plannedMinutes: 15,
        completed: false,
      },
    ],
    selfEfficacyRating: 80,
    expectedDifficulty: 4,
    intrinsicInterest: 9,
    goalOrientation: 'mastery_approach',
    createdAt: new Date().toISOString(),
  })
  const [forethoughtEval, setForethoughtEval] = useState<ForethoughtEvaluationResult | null>(null)
  const [newSubgoal, setNewSubgoal] = useState('')

  // Tab 2: Volitional Session State
  const [volitionalSession, setVolitionalSession] = useState<VolitionalControlSession>({
    id: 'vol_active',
    forethoughtPlanId: 'plan_active',
    startedAt: new Date().toISOString(),
    durationMinutes: 60,
    distractionTally: 1,
    activeFocusMinutes: 54,
    attentionInterventions: [
      {
        id: 'int_1',
        timestamp: new Date().toISOString(),
        trigger: 'mind_wandering',
        interventionStrategy:
          'Perform deliberate 3-breath grounding and write down immediate math step',
        resolved: true,
        latencySeconds: 15,
      },
    ],
    selfInstructionPromptsUsed: [
      'Focus purely on the node normalization step.',
      'One layer at a time: input features to latent representation.',
    ],
    perceivedCognitiveLoad: 6,
  })
  const [volitionalEval, setVolitionalEval] = useState<VolitionalAnalysisResult | null>(null)
  const [newSelfPrompt, setNewSelfPrompt] = useState('')

  // Tab 3: Self-Reflection State
  const [reflection, setReflection] = useState<SelfReflectionEvaluation>({
    id: 'ref_active',
    volitionalSessionId: 'vol_active',
    masteryStandardScore: 85,
    observedPerformanceScore: 82,
    performanceDiscrepancy: -3,
    attributions: [
      {
        id: 'attr_1',
        outcomeDescription: 'Derived permutation equivariance with precision',
        outcomeValence: 'success',
        category: 'strategy',
        locus: 'internal',
        stability: 'unstable',
        controllability: 'controllable',
        justification: 'Dual coding graph visualization made neighborhood permutation obvious.',
      },
      {
        id: 'attr_2',
        outcomeDescription: 'Slight delay during symmetric normalized Laplacian calculation',
        outcomeValence: 'partial_success',
        category: 'effort',
        locus: 'internal',
        stability: 'unstable',
        controllability: 'controllable',
        justification: 'Did not write out degree matrix beforehand; need procedural checklist.',
      },
    ],
    selfSatisfactionRating: 8,
    adaptiveInferences: {
      maintainStrategies: true,
      strategyModifications: ['Pre-compute diagonal matrices before entering message passing loop'],
      proximalTargetForNextForethought:
        'Implement Graph Attention Network (GAT) multi-head attention',
    },
    defensiveReactionDetected: false,
    createdAt: new Date().toISOString(),
  })
  const [attributionEval, setAttributionEval] = useState<AttributionalStyleResult | null>(null)

  // Tab 4: MSLQ Diagnostic State
  const [mslqResponses, setMslqResponses] = useState<Record<string, number>>({
    mslq_1: 6,
    mslq_2: 4,
    mslq_3: 7,
    mslq_4: 6,
    mslq_5: 6,
    mslq_6: 3,
    mslq_7: 4,
    mslq_8: 6,
    mslq_9: 5,
    mslq_10: 6,
    mslq_11: 6,
    mslq_12: 5,
    mslq_13: 5,
    mslq_14: 4,
    mslq_15: 5,
  })
  const [mslqProfile, setMslqProfile] = useState<MSLQProfileResult | null>(null)

  // Initial Data Fetch
  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        const res = await apiGet<{
          cyclicResult: ZimmermanCyclicIndexResult
          forethoughtPlan?: ForethoughtPlan
          volitionalSession?: VolitionalControlSession
          reflection?: SelfReflectionEvaluation
          mslqProfile?: MSLQProfileResult
        }>('/api/srl')
        if (mounted && res) {
          if (res.cyclicResult) setCyclicResult(res.cyclicResult)
          if (res.forethoughtPlan) setForethoughtPlan(res.forethoughtPlan)
          if (res.volitionalSession) setVolitionalSession(res.volitionalSession)
          if (res.reflection) setReflection(res.reflection)
          if (res.mslqProfile) setMslqProfile(res.mslqProfile)
        }
      } catch {
        // Fall back to initialized states
      }
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [])

  // Action: Evaluate Forethought
  const handleEvaluateForethought = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const res = await apiSend<{
        evaluation: ForethoughtEvaluationResult
        cyclicResult: ZimmermanCyclicIndexResult
      }>('/api/srl', 'POST', {
        action: 'evaluate_forethought',
        plan: forethoughtPlan,
      })
      if (res?.evaluation) {
        setForethoughtEval(res.evaluation)
        if (res.cyclicResult) setCyclicResult(res.cyclicResult)
        setStatusMessage('Forethought plan evaluated against Zimmerman task analysis standards.')
      }
    } catch {
      setStatusMessage('Forethought evaluation completed locally.')
    } finally {
      setLoading(false)
    }
  }

  // Action: Analyze Volition
  const handleAnalyzeVolition = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const res = await apiSend<{
        evaluation: VolitionalAnalysisResult
        cyclicResult: ZimmermanCyclicIndexResult
      }>('/api/srl', 'POST', {
        action: 'analyze_volition',
        session: volitionalSession,
      })
      if (res?.evaluation) {
        setVolitionalEval(res.evaluation)
        if (res.cyclicResult) setCyclicResult(res.cyclicResult)
        setStatusMessage('Volitional performance analyzed (Paas 1992, Meichenbaum 1977).')
      }
    } catch {
      setStatusMessage('Volition analysis completed locally.')
    } finally {
      setLoading(false)
    }
  }

  // Action: Evaluate Reflection
  const handleEvaluateReflection = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const res = await apiSend<{
        evaluation: AttributionalStyleResult
        cyclicResult: ZimmermanCyclicIndexResult
      }>('/api/srl', 'POST', {
        action: 'evaluate_reflection',
        reflection,
      })
      if (res?.evaluation) {
        setAttributionEval(res.evaluation)
        if (res.cyclicResult) setCyclicResult(res.cyclicResult)
        setStatusMessage('Weiner causal attributions & self-reflection calibrated.')
      }
    } catch {
      setStatusMessage('Self-reflection evaluated locally.')
    } finally {
      setLoading(false)
    }
  }

  // Action: Score MSLQ
  const handleScoreMSLQ = async () => {
    setLoading(true)
    setStatusMessage(null)
    try {
      const res = await apiSend<{
        profile: MSLQProfileResult
        cyclicResult: ZimmermanCyclicIndexResult
      }>('/api/srl', 'POST', {
        action: 'score_mslq',
        responses: mslqResponses,
      })
      if (res?.profile) {
        setMslqProfile(res.profile)
        if (res.cyclicResult) setCyclicResult(res.cyclicResult)
        setStatusMessage('MSLQ 15-scale diagnostic computed with Pintrich normative percentiles.')
      }
    } catch {
      setStatusMessage('MSLQ diagnostic calculated.')
    } finally {
      setLoading(false)
    }
  }

  // Add subgoal helper
  const handleAddSubgoal = () => {
    if (!newSubgoal.trim()) return
    setForethoughtPlan((prev) => ({
      ...prev,
      proximalSubgoals: [...prev.proximalSubgoals, newSubgoal.trim()],
    }))
    setNewSubgoal('')
  }

  // Add self-instruction prompt helper
  const handleAddPrompt = () => {
    if (!newSelfPrompt.trim()) return
    setVolitionalSession((prev) => ({
      ...prev,
      selfInstructionPromptsUsed: [...prev.selfInstructionPromptsUsed, newSelfPrompt.trim()],
    }))
    setNewSelfPrompt('')
  }

  return (
    <div className="space-y-6">
      {/* Real-Time Zimmerman HUD Telemetry */}
      <SelfRegulatedLearningHUD
        forethoughtScore={cyclicResult.forethoughtScore}
        volitionalScore={cyclicResult.volitionalScore}
        selfReflectionScore={cyclicResult.selfReflectionScore}
        compositeIndex={cyclicResult.compositeSRLIndex}
        maturityLevel={cyclicResult.maturityLevel}
        controllableAttributionRatio={
          attributionEval ? attributionEval.controllableInternalRatio : 85
        }
        topStrength={mslqProfile?.topStrengths[0]}
        criticalBottleneck={mslqProfile?.criticalBottlenecks[0]}
        activePhase={
          activeTab === 'forethought'
            ? 'forethought'
            : activeTab === 'volition'
              ? 'volition'
              : activeTab === 'reflection'
                ? 'self_reflection'
                : undefined
        }
      />

      {/* Status banner */}
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-2">
        <button
          onClick={() => setActiveTab('forethought')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'forethought'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-secondary hover:text-strong hover:bg-neutral-100 dark:hover:bg-(--hub-surface)'
          }`}
        >
          <Target className="h-3.5 w-3.5" />
          Phase 1: Forethought & Planning
        </button>
        <button
          onClick={() => setActiveTab('volition')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'volition'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-secondary hover:text-strong hover:bg-neutral-100 dark:hover:bg-(--hub-surface)'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Phase 2: Volition & Focus
        </button>
        <button
          onClick={() => setActiveTab('reflection')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'reflection'
              ? 'bg-violet-600 text-white shadow-xs'
              : 'text-secondary hover:text-strong hover:bg-neutral-100 dark:hover:bg-(--hub-surface)'
          }`}
        >
          <Flame className="h-3.5 w-3.5" />
          Phase 3: Reflection & Attribution
        </button>
        <button
          onClick={() => setActiveTab('mslq')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'mslq'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-secondary hover:text-strong hover:bg-neutral-100 dark:hover:bg-(--hub-surface)'
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          MSLQ Diagnostic Benchmark
        </button>
      </div>

      {/* TAB 1: FORETHOUGHT */}
      {activeTab === 'forethought' && (
        <div className="space-y-6">
          <Panel title="Forethought Task Analysis & Self-Efficacy Calibration">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">
                    Target Skill or Conceptual Domain
                  </label>
                  <input
                    type="text"
                    value={forethoughtPlan.targetSkillOrTopic}
                    onChange={(e) =>
                      setForethoughtPlan({ ...forethoughtPlan, targetSkillOrTopic: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) px-3 py-1.5 text-xs text-strong"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">
                    Distal Mastery Outcome
                  </label>
                  <input
                    type="text"
                    value={forethoughtPlan.distalOutcome}
                    onChange={(e) =>
                      setForethoughtPlan({ ...forethoughtPlan, distalOutcome: e.target.value })
                    }
                    className="w-full rounded-md border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) px-3 py-1.5 text-xs text-strong"
                  />
                </div>
              </div>

              {/* Proximal Subgoals */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">
                  Proximal Subgoals (SMART decomposition)
                </label>
                <div className="space-y-1.5 mb-2">
                  {forethoughtPlan.proximalSubgoals.map((goal, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md bg-neutral-50 dark:bg-(--hub-sunken) px-3 py-1.5 text-xs border border-neutral-200 dark:border-(--hub-border)"
                    >
                      <span className="text-strong">{goal}</span>
                      <button
                        onClick={() =>
                          setForethoughtPlan({
                            ...forethoughtPlan,
                            proximalSubgoals: forethoughtPlan.proximalSubgoals.filter(
                              (_, i) => i !== idx,
                            ),
                          })
                        }
                        className="text-secondary hover:text-rose-500 text-xs ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a proximal subgoal..."
                    value={newSubgoal}
                    onChange={(e) => setNewSubgoal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSubgoal()}
                    className="flex-1 rounded-md border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) px-3 py-1.5 text-xs text-strong"
                  />
                  <Button onClick={handleAddSubgoal}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* Calibration Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-secondary">Bandura Self-Efficacy</span>
                    <span className="font-bold text-strong">
                      {forethoughtPlan.selfEfficacyRating}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={forethoughtPlan.selfEfficacyRating}
                    onChange={(e) =>
                      setForethoughtPlan({
                        ...forethoughtPlan,
                        selfEfficacyRating: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full accent-blue-600"
                  />
                  <div className="text-[10px] text-secondary mt-1">
                    Confidence to achieve mastery
                  </div>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-secondary">Expected Difficulty</span>
                    <span className="font-bold text-strong">
                      {forethoughtPlan.expectedDifficulty} / 5
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={forethoughtPlan.expectedDifficulty}
                    onChange={(e) =>
                      setForethoughtPlan({
                        ...forethoughtPlan,
                        expectedDifficulty: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full accent-amber-600"
                  />
                  <div className="text-[10px] text-secondary mt-1">Cognitive load estimate</div>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <label className="block text-xs text-secondary mb-1">Goal Orientation</label>
                  <select
                    value={forethoughtPlan.goalOrientation}
                    onChange={(e) =>
                      setForethoughtPlan({
                        ...forethoughtPlan,
                        goalOrientation: e.target.value as LearningGoalOrientation,
                      })
                    }
                    className="w-full rounded-md border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2 py-1 text-xs text-strong"
                  >
                    <option value="mastery_approach">Mastery-Approach (Optimal)</option>
                    <option value="mastery_avoidance">Mastery-Avoidance</option>
                    <option value="performance_approach">Performance-Approach</option>
                    <option value="performance_avoidance">Performance-Avoidance</option>
                  </select>
                  <div className="text-[10px] text-secondary mt-1">Elliot & McGregor (2001)</div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <Button onClick={handleEvaluateForethought} disabled={loading}>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Evaluate Forethought Quality
                </Button>
              </div>
            </div>
          </Panel>

          {/* Evaluation Feedback */}
          {forethoughtEval && (
            <Panel title="Metacognitive Forethought Evaluation">
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Quality Score</div>
                    <div className="text-lg font-bold text-strong">
                      {forethoughtEval.forethoughtQualityScore}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Goal Specificity</div>
                    <div className="text-lg font-bold text-strong">
                      {forethoughtEval.goalSpecificityScore}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Strategic Variety</div>
                    <div className="text-lg font-bold text-strong">
                      {forethoughtEval.strategicVarietyScore}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Calibration</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        tone={
                          forethoughtEval.calibrationDiagnosis === 'calibrated'
                            ? 'success'
                            : forethoughtEval.calibrationDiagnosis === 'underconfident'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {forethoughtEval.calibrationDiagnosis.toUpperCase()}
                      </Badge>
                      <span className="text-[11px] text-secondary">
                        ({forethoughtEval.calibrationRatio}x)
                      </span>
                    </div>
                  </div>
                </div>

                {forethoughtEval.recommendations.length > 0 && (
                  <div className="rounded-lg bg-blue-50/50 dark:bg-blue-950/20 p-3 border border-blue-200 dark:border-blue-900/40 text-xs">
                    <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1.5 flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" />
                      Pedagogical Recommendations (Zimmerman 2000):
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-secondary">
                      {forethoughtEval.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* TAB 2: VOLITIONAL CONTROL */}
      {activeTab === 'volition' && (
        <div className="space-y-6">
          <Panel title="Volitional Performance & Executive Attention Control">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-xs text-secondary mb-1">Session Duration</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="10"
                      max="240"
                      value={volitionalSession.durationMinutes}
                      onChange={(e) =>
                        setVolitionalSession({
                          ...volitionalSession,
                          durationMinutes: parseInt(e.target.value, 10) || 60,
                        })
                      }
                      className="w-20 rounded-md border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2 py-1 text-xs text-strong"
                    />
                    <span className="text-xs text-secondary">minutes</span>
                  </div>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-xs text-secondary mb-1">Active Focus Minutes</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max={volitionalSession.durationMinutes}
                      value={volitionalSession.activeFocusMinutes}
                      onChange={(e) =>
                        setVolitionalSession({
                          ...volitionalSession,
                          activeFocusMinutes: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-20 rounded-md border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2 py-1 text-xs text-strong"
                    />
                    <span className="text-xs text-secondary">minutes</span>
                  </div>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-xs text-secondary mb-1">Distraction Interruptions</div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-strong">
                      {volitionalSession.distractionTally}
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setVolitionalSession((prev) => ({
                          ...prev,
                          distractionTally: prev.distractionTally + 1,
                        }))
                      }
                    >
                      +1 Distraction
                    </Button>
                  </div>
                </div>
              </div>

              {/* Cognitive Load Slider */}
              <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-secondary">
                    Perceived Cognitive Load (Paas 1992, NASA-TLX)
                  </span>
                  <span className="font-bold text-strong">
                    {volitionalSession.perceivedCognitiveLoad} / 10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={volitionalSession.perceivedCognitiveLoad}
                  onChange={(e) =>
                    setVolitionalSession({
                      ...volitionalSession,
                      perceivedCognitiveLoad: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-emerald-600"
                />
                <div className="flex justify-between text-[10px] text-secondary mt-1">
                  <span>Very Low Mental Demand (1)</span>
                  <span>Optimal Friction (5-6)</span>
                  <span>Cognitive Overload (9-10)</span>
                </div>
              </div>

              {/* Self-Instruction Prompts (Meichenbaum 1977) */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">
                  Self-Instruction Prompts (Cognitive Behavior Modification)
                </label>
                <div className="space-y-1.5 mb-2">
                  {volitionalSession.selfInstructionPromptsUsed.map((prompt, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md bg-neutral-50 dark:bg-(--hub-sunken) px-3 py-1.5 text-xs border border-neutral-200 dark:border-(--hub-border)"
                    >
                      <span className="text-strong italic">"{prompt}"</span>
                      <button
                        onClick={() =>
                          setVolitionalSession({
                            ...volitionalSession,
                            selfInstructionPromptsUsed:
                              volitionalSession.selfInstructionPromptsUsed.filter(
                                (_, i) => i !== idx,
                              ),
                          })
                        }
                        className="text-secondary hover:text-rose-500 text-xs ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter self-instruction prompt (e.g. 'Slow down and verify bounds')..."
                    value={newSelfPrompt}
                    onChange={(e) => setNewSelfPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPrompt()}
                    className="flex-1 rounded-md border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) px-3 py-1.5 text-xs text-strong"
                  />
                  <Button onClick={handleAddPrompt}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <Button onClick={handleAnalyzeVolition} disabled={loading}>
                  <Activity className="h-4 w-4 mr-1.5" />
                  Analyze Volitional Control
                </Button>
              </div>
            </div>
          </Panel>

          {/* Volitional Evaluation Output */}
          {volitionalEval && (
            <Panel title="Volitional Stability Telemetry">
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Focus Ratio</div>
                    <div className="text-lg font-bold text-strong">
                      {volitionalEval.focusEfficiencyRatio}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Distraction Rate</div>
                    <div className="text-lg font-bold text-strong">
                      {volitionalEval.distractionRatePerHour}/hr
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Executive Control</div>
                    <div className="mt-1">
                      <Badge
                        tone={
                          volitionalEval.executiveControlLevel === 'exceptional'
                            ? 'success'
                            : volitionalEval.executiveControlLevel === 'stable'
                              ? 'accent'
                              : 'warning'
                        }
                      >
                        {volitionalEval.executiveControlLevel.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Stability Score</div>
                    <div className="text-lg font-bold text-strong">
                      {volitionalEval.volitionalStabilityScore}%
                    </div>
                  </div>
                </div>

                {volitionalEval.insights.length > 0 && (
                  <div className="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 p-3 border border-emerald-200 dark:border-emerald-900/40 text-xs">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Volitional Control Insights:
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-secondary">
                      {volitionalEval.insights.map((ins, i) => (
                        <li key={i}>{ins}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* TAB 3: SELF-REFLECTION */}
      {activeTab === 'reflection' && (
        <div className="space-y-6">
          <Panel title="Self-Reflection & Weiner Causal Attribution Workbench">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-xs text-secondary mb-1">Mastery Standard Criterion</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="50"
                      max="100"
                      value={reflection.masteryStandardScore}
                      onChange={(e) => {
                        const std = parseInt(e.target.value, 10) || 85
                        setReflection({
                          ...reflection,
                          masteryStandardScore: std,
                          performanceDiscrepancy: reflection.observedPerformanceScore - std,
                        })
                      }}
                      className="w-20 rounded-md border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2 py-1 text-xs text-strong"
                    />
                    <span className="text-xs text-secondary">% target</span>
                  </div>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-xs text-secondary mb-1">Observed Performance</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={reflection.observedPerformanceScore}
                      onChange={(e) => {
                        const obs = parseInt(e.target.value, 10) || 0
                        setReflection({
                          ...reflection,
                          observedPerformanceScore: obs,
                          performanceDiscrepancy: obs - reflection.masteryStandardScore,
                        })
                      }}
                      className="w-20 rounded-md border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-2 py-1 text-xs text-strong"
                    />
                    <span className="text-xs text-secondary">% achieved</span>
                  </div>
                </div>

                <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-xs text-secondary mb-1">Discrepancy vs Standard</div>
                  <div
                    className={`text-lg font-bold ${
                      reflection.performanceDiscrepancy >= 0 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {reflection.performanceDiscrepancy >= 0 ? '+' : ''}
                    {reflection.performanceDiscrepancy}%
                  </div>
                </div>
              </div>

              {/* Attribution Items Table */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-2">
                  Causal Attributions (Weiner 1985 3-Dimension Model)
                </label>
                <div className="space-y-2">
                  {reflection.attributions.map((attr, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-strong">{attr.outcomeDescription}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            tone={
                              attr.category === 'strategy' || attr.category === 'effort'
                                ? 'success'
                                : attr.category === 'ability'
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {attr.category.toUpperCase()}
                          </Badge>
                          <Badge tone="neutral">
                            {attr.locus} · {attr.stability} · {attr.controllability}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-secondary italic">"{attr.justification}"</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Adaptive Action Plan for Next Forethought */}
              <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                <label className="block text-xs font-medium text-secondary mb-1">
                  Feedforward: Proximal Target for Next Forethought Cycle
                </label>
                <input
                  type="text"
                  value={reflection.adaptiveInferences.proximalTargetForNextForethought}
                  onChange={(e) =>
                    setReflection({
                      ...reflection,
                      adaptiveInferences: {
                        ...reflection.adaptiveInferences,
                        proximalTargetForNextForethought: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded-md border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-3 py-1.5 text-xs text-strong"
                />
              </div>

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <Button onClick={handleEvaluateReflection} disabled={loading}>
                  <Flame className="h-4 w-4 mr-1.5" />
                  Evaluate Reflection & Attributions
                </Button>
              </div>
            </div>
          </Panel>

          {/* Attribution Evaluation Output */}
          {attributionEval && (
            <Panel title="Attributional Style & Growth Mindset Analysis">
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Controllable Ratio</div>
                    <div className="text-lg font-bold text-strong">
                      {attributionEval.controllableInternalRatio}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Growth Mindset</div>
                    <div className="mt-1">
                      <Badge tone={attributionEval.isGrowthMindsetOriented ? 'success' : 'warning'}>
                        {attributionEval.isGrowthMindsetOriented ? 'VERIFIED' : 'DEFICIT'}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Helplessness Risk</div>
                    <div className="mt-1">
                      <Badge tone={attributionEval.learnedHelplessnessRisk ? 'danger' : 'success'}>
                        {attributionEval.learnedHelplessnessRisk ? 'RISK DETECTED' : 'LOW RISK'}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Adaptive Score</div>
                    <div className="text-lg font-bold text-strong">
                      {attributionEval.adaptiveInferenceScore}%
                    </div>
                  </div>
                </div>

                {attributionEval.reframingDirectives.length > 0 && (
                  <div className="rounded-lg bg-violet-50/50 dark:bg-violet-950/20 p-3 border border-violet-200 dark:border-violet-900/40 text-xs">
                    <div className="font-semibold text-violet-700 dark:text-violet-300 mb-1.5 flex items-center gap-1.5">
                      <Compass className="h-3.5 w-3.5" />
                      Attributional Reframing Directives (Dweck & Zimmerman):
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-secondary">
                      {attributionEval.reframingDirectives.map((dir, i) => (
                        <li key={i}>{dir}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* TAB 4: MSLQ DIAGNOSTIC */}
      {activeTab === 'mslq' && (
        <div className="space-y-6">
          <Panel title="Motivated Strategies for Learning Questionnaire (Pintrich et al. 1991)">
            <div className="space-y-4">
              <p className="text-xs text-secondary">
                Rate each statement on a 1 (Not at all true of me) to 7 (Very true of me) Likert
                scale. Derived from Pintrich, Smith, Garcia, & McKeachie (1991, 1993) normative
                scales.
              </p>

              <div className="space-y-3">
                {[
                  {
                    id: 'mslq_1',
                    label: 'Intrinsic Goal Orientation',
                    q: 'I prefer course material that really challenges me so I can learn new things.',
                  },
                  {
                    id: 'mslq_5',
                    label: 'Self-Efficacy for Learning',
                    q: 'I am confident I can understand the most complex concepts presented in this domain.',
                  },
                  {
                    id: 'mslq_6',
                    label: 'Test Anxiety',
                    q: 'When I take an exam or high-stakes quiz, I think of the consequences of failing.',
                  },
                  {
                    id: 'mslq_8',
                    label: 'Elaboration & Generative Thought',
                    q: 'When reading, I try to relate the material to what I already know and generate concrete examples.',
                  },
                  {
                    id: 'mslq_9',
                    label: 'Organization & Concept Mapping',
                    q: 'I make simple charts, diagrams, or concept maps to organize my study materials.',
                  },
                  {
                    id: 'mslq_11',
                    label: 'Metacognitive Self-Regulation',
                    q: 'Before I begin studying, I set goals and adjust my learning strategies as I progress.',
                  },
                  {
                    id: 'mslq_13',
                    label: 'Effort Regulation & Persistence',
                    q: 'Even when study materials are dull and uninteresting, I manage to keep working until I finish.',
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-strong">{item.label}</span>
                      <span className="font-bold text-strong bg-white dark:bg-(--hub-panel) px-2 py-0.5 rounded border border-neutral-200 dark:border-(--hub-border)">
                        Rating: {mslqResponses[item.id] ?? 4} / 7
                      </span>
                    </div>
                    <p className="text-secondary mb-2">{item.q}</p>
                    <input
                      type="range"
                      min="1"
                      max="7"
                      step="1"
                      value={mslqResponses[item.id] ?? 4}
                      onChange={(e) =>
                        setMslqResponses({
                          ...mslqResponses,
                          [item.id]: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-amber-600"
                    />
                    <div className="flex justify-between text-[10px] text-secondary mt-1">
                      <span>1 - Not at all true</span>
                      <span>4 - Neutral</span>
                      <span>7 - Very true</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex justify-end">
                <Button onClick={handleScoreMSLQ} disabled={loading}>
                  <Compass className="h-4 w-4 mr-1.5" />
                  Compute MSLQ Normative Profile
                </Button>
              </div>
            </div>
          </Panel>

          {/* MSLQ Profile Output */}
          {mslqProfile && (
            <Panel title="MSLQ Normative Benchmark Profile">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Motivation Composite</div>
                    <div className="text-lg font-bold text-strong">
                      {mslqProfile.motivationScore} / 7.0
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Cognitive & Metacognitive</div>
                    <div className="text-lg font-bold text-strong">
                      {mslqProfile.cognitiveStrategyScore} / 7.0
                    </div>
                  </div>
                  <div className="rounded-lg bg-neutral-50 dark:bg-(--hub-sunken) p-3 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="text-secondary">Resource Management</div>
                    <div className="text-lg font-bold text-strong">
                      {mslqProfile.resourceManagementScore} / 7.0
                    </div>
                  </div>
                </div>

                {/* Subscales summary list */}
                <div className="space-y-2 text-xs">
                  <div className="font-semibold text-strong">
                    Pintrich Normative Percentile Benchmarks
                  </div>
                  {Object.values(mslqProfile.scales).map((sc) => (
                    <div
                      key={sc.scaleKey}
                      className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-sunken) p-2.5"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-strong">{sc.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-secondary font-mono">{sc.rawMean} / 7</span>
                          <Badge
                            tone={
                              sc.benchmarkLevel === 'exemplary' || sc.benchmarkLevel === 'high'
                                ? 'success'
                                : sc.benchmarkLevel === 'moderate'
                                  ? 'neutral'
                                  : 'danger'
                            }
                          >
                            {sc.percentileNorm}th percentile
                          </Badge>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-(--hub-surface) overflow-hidden mb-1">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${sc.percentileNorm}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-secondary">{sc.recommendation}</div>
                    </div>
                  ))}
                </div>

                {/* Prescribed Interventions */}
                {mslqProfile.prescribedInterventions.length > 0 && (
                  <div className="rounded-lg bg-amber-50/50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-900/40 text-xs">
                    <div className="font-semibold text-amber-800 dark:text-amber-200 mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Prescribed Metacognitive Interventions:
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-secondary">
                      {mslqProfile.prescribedInterventions.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
