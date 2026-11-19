/**
 * Learning HUB — Cognitive Load Theory (CLT) & Flow State Balancer Studio
 *
 * Implements an interactive cognitive telemetry workbench grounded in:
 * 1. John Sweller (1988, 2011) - Tripartite Cognitive Load (Intrinsic, Extraneous, Germane)
 * 2. Fred Paas & Jeroen J. G. van Merriënboer (1993) - 2D Cognitive Efficiency Metric (E-score)
 * 3. Mihaly Csikszentmihalyi (1990) - Flow Channel & Optimal Challenge-to-Skill Balance
 * 4. Robert Yerkes & John Dodson (1908) - Inverted-U Arousal-Performance Law
 * 5. Malcolm Pollock, Paul Chandler & John Sweller (2002) - Isolated-Elements Scaffolding Continuum
 * 6. Free Spaced Repetition Scheduler (FSRS-6) dynamic modulation
 */

import React, { useMemo, useState } from 'react'
import {
  CALIBRATED_COGNITIVE_LOAD_SCENARIOS,
  evaluateComprehensiveCognitiveLoad,
  type BenchmarkLoadScenario,
  type ComprehensiveCognitiveLoadEvaluation,
  type ElementScaffoldStage,
} from '@learning-hub/core/cognitive-load'
import { Badge, Button, CognitiveLoadFlowHUD, Panel, ProgressBar, Tabs } from '@/ui'
import {
  Activity,
  Brain,
  CheckCircle2,
  ChevronRight,
  Flame,
  Lightbulb,
  Sliders,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react'

export function CognitiveLoadStudio() {
  const [activeTab, setActiveTab] = useState<
    'flow_balancer' | 'paas_matrix' | 'pollock_scaffold' | 'fsrs_modulation'
  >('flow_balancer')

  // --- Scenario State ---
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    'distributed_paxos_consensus',
  )
  const scenario: BenchmarkLoadScenario = useMemo(() => {
    return (
      CALIBRATED_COGNITIVE_LOAD_SCENARIOS[selectedScenarioId] ??
      CALIBRATED_COGNITIVE_LOAD_SCENARIOS['distributed_paxos_consensus']!
    )
  }, [selectedScenarioId])

  // --- Interactive Telemetry Controls State ---
  const [latencyMs, setLatencyMs] = useState<number>(3500)
  const [baselineMs, setBaselineMs] = useState<number>(4000)
  const [jitterMs, setJitterMs] = useState<number>(120)
  const [backspaces, setBackspaces] = useState<number>(1)
  const [recentErrors, setRecentErrors] = useState<number>(0)
  const [mentalEffort, setMentalEffort] = useState<number>(4)
  const [learnerMastery, setLearnerMastery] = useState<number>(0.75)
  const [taskDifficulty, setTaskDifficulty] = useState<number>(0.78)

  // Synthetic keypress timestamps generated from jitter slider
  const syntheticTimestamps = useMemo(() => {
    const baseInterval = 150
    const timestamps = [0]
    for (let i = 1; i < 8; i++) {
      const noise = Math.sin(i * 1.5) * jitterMs
      const interval = Math.max(40, baseInterval + noise)
      timestamps.push(timestamps[i - 1]! + interval)
    }
    return timestamps
  }, [jitterMs])

  // --- Master Comprehensive Cognitive Load Evaluation ---
  const evaluation: ComprehensiveCognitiveLoadEvaluation = useMemo(() => {
    return evaluateComprehensiveCognitiveLoad({
      responseLatencyMs: latencyMs,
      baselineLatencyMs: baselineMs,
      keystrokeTimestamps: syntheticTimestamps,
      backspaceCount: backspaces,
      recentErrorsInLast5Cards: recentErrors,
      subjectiveMentalEffortRating: mentalEffort,
      learnerDomainMastery: learnerMastery,
      targetTaskDifficulty: taskDifficulty,
      taskElementCount: scenario.elementInteractivityScore,
    })
  }, [
    latencyMs,
    baselineMs,
    syntheticTimestamps,
    backspaces,
    recentErrors,
    mentalEffort,
    learnerMastery,
    taskDifficulty,
    scenario.elementInteractivityScore,
  ])

  // --- Tab 3: Pollock Scaffolding State ---
  const [activeStageIndex, setActiveStageIndex] = useState<1 | 2 | 3>(1)
  const [learnerAnswerInput, setLearnerAnswerInput] = useState<string>('')
  const [solutionRevealed, setSolutionRevealed] = useState<boolean>(false)
  const [_stageCompleted, setStageCompleted] = useState<Record<number, boolean>>({})

  const currentStage: ElementScaffoldStage = useMemo(() => {
    return (
      scenario.defaultScaffoldStages.find((s) => s.phaseIndex === activeStageIndex) ??
      scenario.defaultScaffoldStages[0]!
    )
  }, [scenario, activeStageIndex])

  // Preset loaders for instant exploration
  const applyPreset = (preset: 'flow' | 'overload' | 'underload') => {
    if (preset === 'flow') {
      setLatencyMs(3400)
      setBaselineMs(4000)
      setJitterMs(60)
      setBackspaces(0)
      setRecentErrors(0)
      setMentalEffort(4)
      setLearnerMastery(0.8)
      setTaskDifficulty(0.82)
    } else if (preset === 'overload') {
      setLatencyMs(13500)
      setBaselineMs(3800)
      setJitterMs(420)
      setBackspaces(7)
      setRecentErrors(3)
      setMentalEffort(9)
      setLearnerMastery(0.25)
      setTaskDifficulty(0.92)
    } else {
      setLatencyMs(800)
      setBaselineMs(4200)
      setJitterMs(15)
      setBackspaces(0)
      setRecentErrors(0)
      setMentalEffort(1)
      setLearnerMastery(0.95)
      setTaskDifficulty(0.35)
    }
  }

  return (
    <div className="space-y-6">
      {/* Real-time Telemetry HUD */}
      <CognitiveLoadFlowHUD evaluation={evaluation} activeScenarioTitle={scenario.title} />

      {/* Scenario Selection Header */}
      <Panel className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Curricular Benchmark Domain
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary font-mono">
                Sweller Element Interactivity: {scenario.elementInteractivityScore}/10
              </span>
            </div>
            <h2 className="text-base font-bold text-strong">{scenario.title}</h2>
            <p className="text-xs text-secondary max-w-2xl">
              {scenario.intrinsicComplexityDescription}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.values(CALIBRATED_COGNITIVE_LOAD_SCENARIOS).map((s) => (
              <Button
                key={s.id}
                variant={selectedScenarioId === s.id ? 'primary' : 'secondary'}
                className="text-xs px-2.5 py-1"
                onClick={() => {
                  setSelectedScenarioId(s.id)
                  setActiveStageIndex(1)
                  setSolutionRevealed(false)
                  setLearnerAnswerInput('')
                }}
              >
                {s.domain.split('&')[0]?.trim()}
              </Button>
            ))}
          </div>
        </div>
      </Panel>

      {/* 4 Interactive Workbench Tabs */}
      <Tabs
        value={activeTab}
        onChange={(tabId) => setActiveTab(tabId)}
        label="Cognitive Load Studio Tabs"
        items={[
          {
            key: 'flow_balancer',
            label: 'Real-Time Flow Balancer',
            icon: <Sliders className="w-4 h-4" />,
          },
          {
            key: 'paas_matrix',
            label: 'Paas 2D Efficiency & Arousal',
            icon: <Activity className="w-4 h-4" />,
          },
          {
            key: 'pollock_scaffold',
            label: 'Sweller Scaffolding Crucible',
            icon: <Workflow className="w-4 h-4" />,
          },
          {
            key: 'fsrs_modulation',
            label: 'FSRS Cognitive Modulation',
            icon: <Zap className="w-4 h-4" />,
          },
        ]}
      />

      {/* TAB 1: REAL-TIME FLOW & LOAD BALANCER */}
      {activeTab === 'flow_balancer' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Interactive Telemetry Controls */}
            <div className="lg:col-span-2 space-y-4">
              <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm font-bold text-strong">
                      Live Retrieval Telemetry & Cognitive Friction Sliders
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-secondary">Profiles:</span>
                    <Button
                      variant="secondary"
                      className="text-xs px-2 py-0.5"
                      onClick={() => applyPreset('flow')}
                    >
                      Optimal Flow
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-xs px-2 py-0.5"
                      onClick={() => applyPreset('overload')}
                    >
                      Severe Overload
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-xs px-2 py-0.5"
                      onClick={() => applyPreset('underload')}
                    >
                      Underload
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Slider 1: Response Latency */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="flex justify-between text-xs">
                      <span className="text-secondary">Response Latency:</span>
                      <span className="font-mono font-bold text-strong">
                        {(latencyMs / 1000).toFixed(1)}s (baseline {(baselineMs / 1000).toFixed(1)}
                        s)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={400}
                      max={20000}
                      step={200}
                      value={latencyMs}
                      onChange={(e) => setLatencyMs(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-secondary">
                      <span>Instant (0.4s)</span>
                      <span>Stall (&gt;15s)</span>
                    </div>
                  </div>

                  {/* Slider 2: Keystroke Hesitation Jitter */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="flex justify-between text-xs">
                      <span className="text-secondary">Hesitation Jitter (SD):</span>
                      <span className="font-mono font-bold text-strong">{jitterMs} ms</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={600}
                      step={10}
                      value={jitterMs}
                      onChange={(e) => setJitterMs(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-secondary">
                      <span>Rhythmic (0ms)</span>
                      <span>Severe Pause (600ms)</span>
                    </div>
                  </div>

                  {/* Slider 3: Backspaces / Edit Churn */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="flex justify-between text-xs">
                      <span className="text-secondary">Edit Churn (Backspaces):</span>
                      <span className="font-mono font-bold text-strong">{backspaces} deletes</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={1}
                      value={backspaces}
                      onChange={(e) => setBackspaces(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-secondary">
                      <span>Clean (0)</span>
                      <span>High Churn (12)</span>
                    </div>
                  </div>

                  {/* Slider 4: Recent Error Burst */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="flex justify-between text-xs">
                      <span className="text-secondary">Recent Error Burst:</span>
                      <span className="font-mono font-bold text-strong">
                        {recentErrors} in last 5 cards
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      value={recentErrors}
                      onChange={(e) => setRecentErrors(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-secondary">
                      <span>0 Errors</span>
                      <span>5 Consecutive Errors</span>
                    </div>
                  </div>

                  {/* Slider 5: Learner Mastery */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="flex justify-between text-xs">
                      <span className="text-secondary">Learner Prior Mastery:</span>
                      <span className="font-mono font-bold text-strong">
                        {Math.round(learnerMastery * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={learnerMastery}
                      onChange={(e) => setLearnerMastery(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-secondary">
                      <span>Novice (10%)</span>
                      <span>Expert (100%)</span>
                    </div>
                  </div>

                  {/* Slider 6: Task Difficulty */}
                  <div className="space-y-1.5 p-3 rounded-lg bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 border border-neutral-200 dark:border-(--hub-border)">
                    <div className="flex justify-between text-xs">
                      <span className="text-secondary">Target Task Challenge:</span>
                      <span className="font-mono font-bold text-strong">
                        {Math.round(taskDifficulty * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={taskDifficulty}
                      onChange={(e) => setTaskDifficulty(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-secondary">
                      <span>Trivial (10%)</span>
                      <span>High Challenge (100%)</span>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Diagnostic Narrative Callout */}
              <Panel className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h4 className="text-xs font-bold text-strong uppercase tracking-wider">
                    Diagnostic Telemetry Synthesis & Recommendations
                  </h4>
                </div>

                <div className="space-y-2">
                  {evaluation.narrativeDiagnostics.length > 0 ? (
                    evaluation.narrativeDiagnostics.map((diag, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-xs text-strong"
                      >
                        {diag}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-secondary">
                      Telemetry signals indicate balanced working memory allocation within Cowan's
                      4-chunk capacity.
                    </p>
                  )}
                </div>
              </Panel>
            </div>

            {/* Right Col: Csikszentmihalyi Flow Corridor Visualization */}
            <div className="space-y-4">
              <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-strong">Csikszentmihalyi Flow Corridor</h3>
                </div>

                <div className="space-y-2 text-xs">
                  <p className="text-secondary leading-relaxed">
                    Balance between task challenge and retrieval skill. The channel corridor demands
                    a ratio near 1.0 (±15%).
                  </p>

                  <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-strong">Current Zone:</span>
                      <Badge
                        tone={
                          evaluation.flowEvaluation.isWithinFlowCorridor ? 'success' : 'warning'
                        }
                      >
                        {evaluation.flowEvaluation.flowZone.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex justify-between text-secondary">
                      <span>Challenge/Skill Ratio:</span>
                      <span className="font-mono font-bold text-strong">
                        {evaluation.flowEvaluation.challengeToSkillRatio.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between text-secondary">
                      <span>Corridor Coherence:</span>
                      <span className="font-mono font-bold text-strong">
                        {Math.round(evaluation.flowEvaluation.flowChannelCoherence * 100)}%
                      </span>
                    </div>

                    <div className="pt-1">
                      <ProgressBar
                        value={evaluation.flowEvaluation.flowChannelCoherence}
                        label="Corridor Coherence"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-indigo-50/30 dark:bg-indigo-950/20 text-xs space-y-1">
                    <span className="font-bold text-indigo-700 dark:text-indigo-300">
                      Pedagogical Guidance:
                    </span>
                    <p className="text-secondary">{evaluation.flowEvaluation.guidance}</p>
                  </div>
                </div>
              </Panel>

              {/* Prescribed Micro-Intervention */}
              <Panel className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <h4 className="text-xs font-bold text-strong uppercase tracking-wider">
                    Prescribed Micro-Intervention
                  </h4>
                </div>

                <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-strong">
                      {evaluation.recommendedIntervention === 'none'
                        ? 'Maintain Autonomous Practice'
                        : evaluation.recommendedIntervention === 'worked_example'
                          ? 'Fade to Step-by-Step Worked Example'
                          : evaluation.recommendedIntervention === 'format_stepdown'
                            ? 'Step Down Format to Multiple Choice'
                            : evaluation.recommendedIntervention === 'scaffold_hint'
                              ? 'Provide Subgoal Scaffolding Hint'
                              : evaluation.recommendedIntervention === 'rest_pause'
                                ? 'Cognitive Rest Pause (High Arousal)'
                                : 'Accelerate Spacing & Novel Interleaving'}
                    </span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    {evaluation.recommendedIntervention === 'worked_example'
                      ? 'Error burst detected. Fading to complete worked example prevents cognitive thrashing and preserves motivation.'
                      : evaluation.recommendedIntervention === 'format_stepdown'
                        ? 'High backspace churn signals structural syntax uncertainty. Step down from active recall code writing to structured card selection.'
                        : evaluation.recommendedIntervention === 'scaffold_hint'
                          ? 'Working memory near capacity. Provide intermediate subgoal cues to reduce element interactivity.'
                          : evaluation.recommendedIntervention === 'accelerate_challenge'
                            ? 'Effortless retrieval. Interleave novel high-interactivity problems or expand spacing intervals.'
                            : 'Optimal acquisition corridor maintained. Continue standard active recall.'}
                  </p>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PAAS 2D EFFICIENCY & YERKES-DODSON MATRIX */}
      {activeTab === 'paas_matrix' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Paas & Van Merriënboer 2D Efficiency Matrix */}
            <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold text-strong">
                    Paas 2D Cognitive Efficiency Matrix
                  </h3>
                </div>
                <Badge
                  tone={
                    evaluation.paasEfficiency.cognitiveEfficiencyIndex >= 0 ? 'success' : 'danger'
                  }
                >
                  E = {evaluation.paasEfficiency.cognitiveEfficiencyIndex > 0 ? '+' : ''}
                  {evaluation.paasEfficiency.cognitiveEfficiencyIndex.toFixed(2)}
                </Badge>
              </div>

              <p className="text-xs text-secondary leading-relaxed">
                Calculates instructional efficiency E = (z(Performance) - z(Mental Effort)) / √2
                comparing standardized performance against subjective mental effort (Paas &amp; Van
                Merriënboer 1993).
              </p>

              {/* Subjective Mental Effort Rating Selector (1 to 9 Paas scale) */}
              <div className="space-y-2 p-3 rounded-lg bg-neutral-50/60 dark:bg-(--hub-panel-2)/40 border border-neutral-200 dark:border-(--hub-border)">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-strong">
                    Paas Subjective Mental Effort (1-9):
                  </span>
                  <span className="font-mono font-bold text-strong">{mentalEffort} / 9</span>
                </div>
                <div className="grid grid-cols-9 gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setMentalEffort(rating)}
                      className={`py-2 text-xs font-mono font-bold rounded transition-colors ${
                        mentalEffort === rating
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-(--hub-panel) hover:bg-neutral-100 dark:hover:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-secondary'
                      }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-secondary pt-1">
                  <span>1: Very Low Effort</span>
                  <span>5: Moderate</span>
                  <span>9: Extreme Overload</span>
                </div>
              </div>

              {/* 4 Quadrants Display */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div
                  className={`p-3 rounded-lg border ${
                    evaluation.paasEfficiency.quadrant === 'high_efficiency'
                      ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50/20 dark:bg-(--hub-panel-2)/20'
                  }`}
                >
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-1">
                    Quadrant 1: High Efficiency
                  </span>
                  <p className="text-[11px] text-secondary">
                    High performance with low mental effort. Automated schema processing.
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg border ${
                    evaluation.paasEfficiency.quadrant === 'medium_efficiency'
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20'
                      : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50/20 dark:bg-(--hub-panel-2)/20'
                  }`}
                >
                  <span className="font-bold text-indigo-700 dark:text-indigo-400 block mb-1">
                    Quadrant 2: Balanced Effort
                  </span>
                  <p className="text-[11px] text-secondary">
                    Mental effort proportionally corresponds to achieved recall accuracy.
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg border ${
                    evaluation.paasEfficiency.quadrant === 'low_efficiency'
                      ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
                      : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50/20 dark:bg-(--hub-panel-2)/20'
                  }`}
                >
                  <span className="font-bold text-amber-700 dark:text-amber-400 block mb-1">
                    Quadrant 3: Low Efficiency
                  </span>
                  <p className="text-[11px] text-secondary">
                    Elevated cognitive friction relative to achieved recall precision.
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg border ${
                    evaluation.paasEfficiency.quadrant === 'critical_thrashing'
                      ? 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/20'
                      : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50/20 dark:bg-(--hub-panel-2)/20'
                  }`}
                >
                  <span className="font-bold text-rose-700 dark:text-rose-400 block mb-1">
                    Quadrant 4: Critical Thrashing
                  </span>
                  <p className="text-[11px] text-secondary">
                    Severe cognitive overload. Extreme mental expenditure with zero recall gain.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-xs">
                <span className="font-bold text-strong block mb-1">Clinical Interpretation:</span>
                <p className="text-secondary">{evaluation.paasEfficiency.interpretation}</p>
              </div>
            </Panel>

            {/* Right: Yerkes-Dodson Inverted-U Arousal Law */}
            <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-strong">
                    Yerkes-Dodson (1908) Inverted-U Arousal Law
                  </h3>
                </div>
                <Badge
                  tone={evaluation.flowEvaluation.isWithinFlowCorridor ? 'success' : 'warning'}
                >
                  {evaluation.flowEvaluation.yerkesDodsonArousalPct}% Arousal
                </Badge>
              </div>

              <p className="text-xs text-secondary leading-relaxed">
                Performance increases with physiological/cognitive arousal up to an optimal peak,
                after which further arousal causes catastrophic performance degradation. Complex
                tasks require lower arousal targets than simple tasks.
              </p>

              <div className="p-4 rounded-lg bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 border border-neutral-200 dark:border-(--hub-border) space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-secondary">Current Cognitive Arousal:</span>
                  <span className="font-mono font-bold text-strong">
                    {evaluation.flowEvaluation.yerkesDodsonArousalPct}%
                  </span>
                </div>
                <ProgressBar
                  value={evaluation.flowEvaluation.yerkesDodsonArousalPct / 100}
                  label="Current Cognitive Arousal"
                />

                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-secondary">Optimal Target for Task:</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {evaluation.flowEvaluation.optimalArousalTargetPct}% Optimal
                  </span>
                </div>
                <ProgressBar
                  value={evaluation.flowEvaluation.optimalArousalTargetPct / 100}
                  label="Optimal Target for Task"
                />
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-1">
                  <span className="font-bold text-strong">Inverted-U Regions:</span>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1 text-[11px]">
                    <div className="p-1.5 rounded bg-neutral-100 dark:bg-(--hub-panel-2)">
                      <span className="font-bold block text-secondary">&lt; 40%</span>
                      <span className="text-secondary">Under-aroused (Boredom)</span>
                    </div>
                    <div className="p-1.5 rounded bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                      <span className="font-bold block">45% - 65%</span>
                      <span>Optimal Peak (Flow)</span>
                    </div>
                    <div className="p-1.5 rounded bg-rose-100/60 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">
                      <span className="font-bold block">&gt; 75%</span>
                      <span>Over-aroused (Panic)</span>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 3: SWELLER INTRINSIC LOAD & SCAFFOLDING CRUCIBLE */}
      {activeTab === 'pollock_scaffold' && (
        <div className="space-y-6">
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-bold text-strong">
                    Pollock, Chandler & Sweller (2002) Isolated-Elements Scaffolding Continuum
                  </h3>
                </div>
                <p className="text-xs text-secondary mt-0.5">
                  Reduces intrinsic cognitive load by staging element interactivity into 3 distinct
                  pedagogical phases.
                </p>
              </div>

              {/* Phase Step Selector */}
              <div className="flex items-center gap-2">
                {scenario.defaultScaffoldStages.map((stg) => (
                  <Button
                    key={stg.phaseIndex}
                    variant={activeStageIndex === stg.phaseIndex ? 'primary' : 'secondary'}
                    className="text-xs px-2.5 py-1"
                    onClick={() => {
                      setActiveStageIndex(stg.phaseIndex as 1 | 2 | 3)
                      setSolutionRevealed(false)
                      setLearnerAnswerInput('')
                    }}
                  >
                    Phase {stg.phaseIndex}: {stg.phase.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            </div>

            {/* Active Stage Card */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/30 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Badge tone="accent" className="text-xs font-mono">
                    Phase {currentStage.phaseIndex} of 3
                  </Badge>
                  <h4 className="text-base font-bold text-strong mt-1">{currentStage.title}</h4>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-secondary">Element Interactivity:</span>
                  <Badge tone="neutral" className="font-mono">
                    {currentStage.elementInteractivityCount} interacting elements
                  </Badge>
                  <span className="text-secondary">Target WM Chunks:</span>
                  <Badge tone="success" className="font-mono">
                    {currentStage.targetWorkingMemoryChunks} ch
                  </Badge>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) space-y-1">
                <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Instruction & Subgoal Guidance:
                </span>
                <p className="text-xs text-strong leading-relaxed">{currentStage.instruction}</p>
              </div>

              {/* Sample Problem Prompt */}
              <div className="p-4 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  <Brain className="w-4 h-4" />
                  <span>Curricular Problem Prompt:</span>
                </div>
                <p className="text-sm font-medium text-strong">{currentStage.samplePrompt}</p>
              </div>

              {/* Learner Answer Input Box */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-secondary">
                  Your Conceptual Answer / Derivation:
                </label>
                <textarea
                  rows={3}
                  value={learnerAnswerInput}
                  onChange={(e) => setLearnerAnswerInput(e.target.value)}
                  placeholder="Formulate your derivation here to test active retrieval..."
                  className="w-full p-3 rounded-lg text-xs bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-strong focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              {/* Actions & Verification */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <Button
                  variant="secondary"
                  className="text-xs px-2.5 py-1"
                  onClick={() => setSolutionRevealed(!solutionRevealed)}
                >
                  <Lightbulb className="w-3.5 h-3.5 mr-1" />
                  {solutionRevealed ? 'Hide Solution' : 'Reveal Solution & Schema'}
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    className="text-xs px-2.5 py-1"
                    disabled={!learnerAnswerInput.trim()}
                    onClick={() => {
                      setStageCompleted((prev) => ({ ...prev, [activeStageIndex]: true }))
                      setSolutionRevealed(true)
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Verify Retrieval Schema
                  </Button>

                  {activeStageIndex < 3 && (
                    <Button
                      variant="secondary"
                      className="text-xs px-2.5 py-1"
                      onClick={() => {
                        setActiveStageIndex((prev) => (prev + 1) as 1 | 2 | 3)
                        setSolutionRevealed(false)
                        setLearnerAnswerInput('')
                      }}
                    >
                      Next Phase <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Verified Solution Panel */}
              {solutionRevealed && (
                <div className="p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 space-y-2 animate-fade-in">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verified Solution Key & Automated Schema:</span>
                  </div>
                  <p className="text-xs font-mono text-strong leading-relaxed">
                    {currentStage.solutionKey}
                  </p>
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: FSRS COGNITIVE MODULATION */}
      {activeTab === 'fsrs_modulation' && (
        <div className="space-y-6">
          <Panel className="p-5 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-strong">
                  FSRS-6 Dynamic Spaced Repetition Modulation Bridge
                </h3>
              </div>
              <Badge tone="accent">
                FSRS Retention Factor:{' '}
                {evaluation.fsrsModulation.recommendedIntervalFactor.toFixed(2)}x
              </Badge>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              Standard spaced repetition models (SM-2, Anki) assume static difficulty. Learning HUB
              dynamically shifts FSRS stability multipliers and difficulty offsets in real-time
              based on telemetry-detected cognitive load and instructional efficiency.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Stability Multiplier Card */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-2">
                <span className="text-xs font-semibold text-secondary">
                  Stability Multiplier (S)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-strong">
                    {evaluation.fsrsModulation.stabilityMultiplier.toFixed(2)}x
                  </span>
                </div>
                <p className="text-[11px] text-secondary">
                  {evaluation.fsrsModulation.stabilityMultiplier > 1.0
                    ? 'Boosted: Optimal flow and high efficiency accelerate memory durability.'
                    : evaluation.fsrsModulation.stabilityMultiplier < 1.0
                      ? 'Contracted: High cognitive load flags fragile consolidation; interval safely shortened.'
                      : 'Baseline: Standard FSRS stability progression.'}
                </p>
              </div>

              {/* Difficulty Delta Card */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-2">
                <span className="text-xs font-semibold text-secondary">Difficulty Delta (ΔD)</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-strong">
                    {evaluation.fsrsModulation.difficultyDelta > 0 ? '+' : ''}
                    {evaluation.fsrsModulation.difficultyDelta.toFixed(1)}
                  </span>
                </div>
                <p className="text-[11px] text-secondary">
                  Dynamic difficulty adaptation on the 1-10 FSRS scale. Prevents premature interval
                  expansion on concepts with high element interactivity.
                </p>
              </div>

              {/* Next Interval Preview Card */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/50 dark:bg-(--hub-panel-2)/40 space-y-2">
                <span className="text-xs font-semibold text-secondary">
                  Recommended Next Interval
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-success">
                    {Math.round(4.0 * evaluation.fsrsModulation.recommendedIntervalFactor)} days
                  </span>
                  <span className="text-xs text-secondary">(vs 4.0d baseline)</span>
                </div>
                <p className="text-[11px] text-secondary">
                  Adjusted for Cowan working memory headroom and keystroke hesitation variance.
                </p>
              </div>
            </div>

            {/* Interactive Flashcard Simulator */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50/30 dark:bg-(--hub-panel-2)/20 space-y-3">
              <span className="text-xs font-bold text-strong uppercase tracking-wider block">
                Simulated FSRS Flashcard Review with Cognitive Modulation
              </span>

              <div className="p-4 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-secondary font-mono">Card #104 — {scenario.domain}</span>
                  <Badge tone="accent" className="text-[10px]">
                    CLI: {evaluation.cli.toFixed(2)}
                  </Badge>
                </div>
                <h4 className="text-sm font-semibold text-strong">
                  {scenario.defaultScaffoldStages[0]!.samplePrompt}
                </h4>
                <div className="p-3 rounded bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-xs font-mono text-secondary">
                  Target Answer: {scenario.defaultScaffoldStages[0]!.solutionKey}
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2">
                  <button className="p-2 rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-center hover:bg-rose-100 transition-colors">
                    <span className="block text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                      Again (1)
                    </span>
                    <span className="text-xs font-bold font-mono text-strong">
                      {Math.max(
                        1,
                        Math.round(1 * evaluation.fsrsModulation.recommendedIntervalFactor),
                      )}
                      d
                    </span>
                  </button>
                  <button className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-center hover:bg-amber-100 transition-colors">
                    <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                      Hard (2)
                    </span>
                    <span className="text-xs font-bold font-mono text-strong">
                      {Math.max(
                        1,
                        Math.round(2 * evaluation.fsrsModulation.recommendedIntervalFactor),
                      )}
                      d
                    </span>
                  </button>
                  <button className="p-2 rounded bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-center hover:bg-indigo-100 transition-colors">
                    <span className="block text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      Good (3)
                    </span>
                    <span className="text-xs font-bold font-mono text-strong">
                      {Math.max(
                        2,
                        Math.round(4 * evaluation.fsrsModulation.recommendedIntervalFactor),
                      )}
                      d
                    </span>
                  </button>
                  <button className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-center hover:bg-emerald-100 transition-colors">
                    <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      Easy (4)
                    </span>
                    <span className="text-xs font-bold font-mono text-strong">
                      {Math.max(
                        3,
                        Math.round(7 * evaluation.fsrsModulation.recommendedIntervalFactor),
                      )}
                      d
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
