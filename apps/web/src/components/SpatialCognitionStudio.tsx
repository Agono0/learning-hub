/**
 * Learning HUB — Spatial Cognition & Mental Rotation Studio
 *
 * Implements interactive 3D model-checking and kinematic simulation grounded in:
 * 1. Roger Shepard & Jacqueline Metzler (1971) - Mental Rotation of Three-Dimensional Objects
 * 2. Mary Hegarty (2004) - Mechanical Reasoning by Mental Simulation
 * 3. Barbara Tversky (1993, 2005) - Spatial Schemas & Alignment Heuristics
 * 4. Free Spaced Repetition Scheduler (FSRS-6) spatial retention deck
 */

import React, { useId, useMemo, useState } from 'react'
import {
  calculateMentalRotationVelocity,
  calculateSpatialVisualizationMetrics,
  CANONICAL_SHEPARD_METZLER_SHAPES,
  generateFSRSSpatialDeck,
  generateShepardMetzlerTrial,
  generateVoxelFaces,
  MULTIDISCIPLINARY_SPATIAL_SCENARIOS,
  solveKinematicChain,
  type FSRSSpatialFlashcard,
  type KinematicChainState,
  type KinematicRotationDirection,
  type PolycubeShape,
  type RotationEuler,
  type RotationPerformanceAttempt,
  type ShepardMetzlerTrial,
} from '@learning-hub/core/spatial'
import { Badge, Button, Panel, SpatialCognitionHUD, Tabs } from '@/ui'
import {
  Activity,
  Award,
  CheckCircle2,
  Compass,
  Cog,
  Eye,
  Layers,
  Rotate3d,
  RotateCw,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react'

export function SpatialCognitionStudio() {
  const [activeTab, setActiveTab] = useState<
    'crucible' | 'kinematics' | 'scenarios' | 'flashcards'
  >('crucible')

  // --- 1. Shepard-Metzler Crucible State ---
  const [selectedShapeId, setSelectedShapeId] = useState<string>('sm_canonical_alpha')
  const [leftEuler, setLeftEuler] = useState<RotationEuler>({ pitch: 15, yaw: 30, roll: 0 })
  const [rightEuler, setRightEuler] = useState<RotationEuler>({ pitch: 15, yaw: 90, roll: 0 })
  const [trial, setTrial] = useState<ShepardMetzlerTrial | null>(() =>
    generateShepardMetzlerTrial('sm_canonical_alpha', 60, false),
  )
  const [trialStartTime, setTrialStartTime] = useState<number | null>(null)
  const [lastAttempt, setLastAttempt] = useState<RotationPerformanceAttempt | null>(null)
  const [attemptsHistory, setAttemptsHistory] = useState<RotationPerformanceAttempt[]>([])

  // --- 2. Hegarty Kinematic State ---
  const [kinematicChain] = useState<KinematicChainState>(() => {
    const defaultScenario = MULTIDISCIPLINARY_SPATIAL_SCENARIOS.find(
      (s) => s.domain === 'mechanical_kinematics',
    )
    return defaultScenario?.kinematicChain
      ? solveKinematicChain(defaultScenario.kinematicChain)
      : {
          chainName: 'Three Gear Demo',
          nodes: {},
          inputNodeId: '',
          inputRpm: 120,
          inputDirection: 'clockwise',
          stepEvaluationSequence: [],
          totalDirectionReversals: 0,
          cognitiveLoadScore: 2.0,
        }
  })
  const [kinematicStepIndex, setKinematicStepIndex] = useState<number>(0)
  const [userKinematicGuesses, setUserKinematicGuesses] = useState<
    Record<string, KinematicRotationDirection>
  >({})
  const [isSimulatingGears, setIsSimulatingGears] = useState<boolean>(true)

  // --- 3. STEM Scenarios State ---
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    MULTIDISCIPLINARY_SPATIAL_SCENARIOS[0].id,
  )
  const [scenarioEuler, setScenarioEuler] = useState<RotationEuler>({ pitch: 20, yaw: 45, roll: 0 })
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({})

  // --- 4. FSRS Flashcard State ---
  const [cards] = useState<FSRSSpatialFlashcard[]>(() => generateFSRSSpatialDeck())
  const [currentCardIdx, setCurrentCardIdx] = useState<number>(0)
  const [cardRevealed, setCardRevealed] = useState<boolean>(false)
  const [cardSelection, setCardSelection] = useState<number | null>(null)
  const [deckCompletedCount, setDeckCompletedCount] = useState<number>(0)

  // Derive metrics
  const metrics = useMemo(() => {
    const kinematicCoherence =
      kinematicChain.stepEvaluationSequence.length > 0
        ? Math.max(
            0.6,
            Object.keys(userKinematicGuesses).length / kinematicChain.stepEvaluationSequence.length,
          )
        : 0.85
    return calculateSpatialVisualizationMetrics(attemptsHistory, kinematicCoherence, 0.12)
  }, [attemptsHistory, kinematicChain, userKinematicGuesses])

  // Current active shape
  const activeBaseShape = useMemo(
    () =>
      CANONICAL_SHEPARD_METZLER_SHAPES.find((s) => s.id === selectedShapeId) ||
      CANONICAL_SHEPARD_METZLER_SHAPES[0],
    [selectedShapeId],
  )

  // Current active STEM scenario
  const activeScenario = useMemo(
    () =>
      MULTIDISCIPLINARY_SPATIAL_SCENARIOS.find((s) => s.id === selectedScenarioId) ||
      MULTIDISCIPLINARY_SPATIAL_SCENARIOS[0],
    [selectedScenarioId],
  )

  // Generate new trial
  const startNewTrial = (disparityDeg: number = 60) => {
    const newTrial = generateShepardMetzlerTrial(selectedShapeId, disparityDeg)
    setTrial(newTrial)
    setLeftEuler({ pitch: 15, yaw: 20, roll: 0 })
    setRightEuler({ pitch: 15, yaw: 20 + newTrial.angularDisparityDeg, roll: 0 })
    setTrialStartTime(Date.now())
    setLastAttempt(null)
  }

  // Answer current trial
  const handleAnswerTrial = (userSaidCongruent: boolean) => {
    if (!trial) return
    const now = Date.now()
    const rtMs = trialStartTime ? Math.max(200, now - trialStartTime) : 1200
    const isCorrect = userSaidCongruent === trial.isCongruent

    const attempt: RotationPerformanceAttempt = {
      trialId: trial.trialId,
      userResponseCongruent: userSaidCongruent,
      isCorrect,
      reactionTimeMs: rtMs,
      angularDisparityDeg: trial.angularDisparityDeg,
      timestamp: now,
    }

    setLastAttempt(attempt)
    setAttemptsHistory((prev) => [attempt, ...prev.slice(0, 49)])
    setTrialStartTime(null)
  }

  return (
    <div className="space-y-6">
      {/* HUD Telemetry Banner */}
      <SpatialCognitionHUD
        metrics={metrics}
        currentDisparityDeg={trial ? trial.angularDisparityDeg : 60}
        measuredReactionTimeMs={lastAttempt?.reactionTimeMs}
        expectedReactionTimeMs={trial?.expectedReactionTimeMs}
        isCongruentStimulus={trial?.isCongruent}
      />

      {/* Tabs Navigation */}
      <Tabs
        label="Spatial cognition studio navigation tabs"
        value={activeTab}
        onChange={(key) => setActiveTab(key)}
        items={[
          {
            key: 'crucible',
            label: (
              <span className="flex items-center gap-2">
                <Rotate3d className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Shepard-Metzler Crucible
              </span>
            ),
          },
          {
            key: 'kinematics',
            label: (
              <span className="flex items-center gap-2">
                <Cog className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                Hegarty Kinematics
              </span>
            ),
          },
          {
            key: 'scenarios',
            label: (
              <span className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                STEM Spatial Lab
              </span>
            ),
          },
          {
            key: 'flashcards',
            label: (
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                FSRS Spatial Deck
              </span>
            ),
          },
        ]}
      />

      {/* TAB 1: SHEPARD-METZLER MENTAL ROTATION CRUCIBLE */}
      {activeTab === 'crucible' && (
        <div className="space-y-6">
          <Panel className="p-5 border border-neutral-200 dark:border-(--hub-border) rounded-xl space-y-4 bg-white dark:bg-(--hub-panel)">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  3D Mental Rotation & Chiral Enantiomer Crucible
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Roger Shepard & Jacqueline Metzler (1971): Reaction time is a direct linear
                  function of angular disparity (RT = α + β·θ).
                </p>
              </div>

              {/* Stimulus Shape Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-secondary">Stimulus:</span>
                <select
                  value={selectedShapeId}
                  onChange={(e) => {
                    setSelectedShapeId(e.target.value)
                    const newTrial = generateShepardMetzlerTrial(e.target.value, 60, false)
                    setTrial(newTrial)
                  }}
                  className="text-xs bg-neutral-100 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) rounded-md px-2.5 py-1.5 text-strong focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {CANONICAL_SHEPARD_METZLER_SHAPES.map((shape) => (
                    <option key={shape.id} value={shape.id}>
                      {shape.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Trial Disparity Generator Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200 dark:border-(--hub-border)">
              <span className="text-xs font-medium text-secondary mr-1">New Disparity Trial:</span>
              {[20, 45, 60, 90, 120, 150, 180].map((deg) => (
                <Button
                  key={deg}
                  variant="secondary"
                  className="text-xs px-2.5 py-1 h-7"
                  onClick={() => startNewTrial(deg)}
                >
                  {deg}°
                </Button>
              ))}
              <Button
                variant="primary"
                className="text-xs px-3 py-1 h-7 ml-auto flex items-center gap-1.5"
                onClick={() => startNewTrial(Math.floor(Math.random() * 5 + 1) * 30)}
              >
                <Sparkles className="w-3.5 h-3.5" /> Random Trial
              </Button>
            </div>
          </Panel>

          {/* Dual Polycube Comparison Canvas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Box: Reference Target Shape */}
            <Panel className="p-5 border border-neutral-200 dark:border-(--hub-border) rounded-xl space-y-3 bg-white dark:bg-(--hub-panel)">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                <span className="text-xs font-semibold text-strong flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Reference Target Figure (A)
                </span>
                <span className="text-[11px] font-mono text-secondary">
                  Yaw: {leftEuler.yaw}°, Pitch: {leftEuler.pitch}°
                </span>
              </div>

              {/* Interactive SVG Polycube Canvas */}
              <div className="flex justify-center items-center py-2 bg-neutral-50 dark:bg-(--hub-panel-2) rounded-lg min-h-[260px]">
                <PolycubeSVGViewer shape={activeBaseShape} euler={leftEuler} scale={30} />
              </div>

              {/* Rotation Slider Controls */}
              <div className="space-y-2 pt-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-secondary">Yaw (Y-Axis Horizontal):</span>
                  <span className="font-mono text-strong">{leftEuler.yaw}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={leftEuler.yaw}
                  onChange={(e) =>
                    setLeftEuler((prev) => ({ ...prev, yaw: Number(e.target.value) }))
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </Panel>

            {/* Right Box: Comparison Figure (Candidate B) */}
            <Panel className="p-5 border border-neutral-200 dark:border-(--hub-border) rounded-xl space-y-3 bg-white dark:bg-(--hub-panel)">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-(--hub-border) pb-2">
                <span className="text-xs font-semibold text-strong flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  Comparison Figure (B)
                </span>
                <span className="text-[11px] font-mono text-secondary">
                  Yaw: {rightEuler.yaw}°, Pitch: {rightEuler.pitch}°
                </span>
              </div>

              {/* Interactive SVG Polycube Canvas for Rotated/Reflected Shape */}
              <div className="flex justify-center items-center py-2 bg-neutral-50 dark:bg-(--hub-panel-2) rounded-lg min-h-[260px]">
                <PolycubeSVGViewer
                  shape={trial ? trial.rotatedShape : activeBaseShape}
                  euler={rightEuler}
                  scale={30}
                />
              </div>

              {/* Rotation Slider Controls */}
              <div className="space-y-2 pt-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-secondary">Test Rotation Angle (Yaw):</span>
                  <span className="font-mono text-strong">{rightEuler.yaw}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={rightEuler.yaw}
                  onChange={(e) =>
                    setRightEuler((prev) => ({ ...prev, yaw: Number(e.target.value) }))
                  }
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>
            </Panel>
          </div>

          {/* Model Checking & Decision Prompt */}
          <Panel className="p-5 border border-neutral-200 dark:border-(--hub-border) rounded-xl space-y-4 bg-neutral-50 dark:bg-(--hub-panel-2)">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-strong flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Congruence vs Chirality Judgment
                </h4>
                <p className="text-xs text-secondary mt-0.5">
                  Is Figure B congruent to Figure A through 3D rigid rotation, or is it a
                  non-superimposable mirror enantiomer?
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  className="flex items-center gap-2 px-4 py-2"
                  onClick={() => handleAnswerTrial(true)}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Congruent (SO3 Rotated)
                </Button>
                <Button
                  variant="secondary"
                  className="flex items-center gap-2 px-4 py-2"
                  onClick={() => handleAnswerTrial(false)}
                >
                  <RotateCw className="w-4 h-4 text-amber-500" />
                  Mirror Enantiomer (Chiral)
                </Button>
              </div>
            </div>

            {/* Trial Result Banner */}
            {lastAttempt && (
              <div
                className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                  lastAttempt.isCorrect
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-500 dark:text-rose-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  {lastAttempt.isCorrect ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span>
                    <strong>{lastAttempt.isCorrect ? 'Correct Judgment!' : 'Incorrect.'}</strong>{' '}
                    Latency: {lastAttempt.reactionTimeMs} ms at {lastAttempt.angularDisparityDeg}°
                    disparity.
                  </span>
                </div>
                <span className="font-mono text-[11px]">
                  Rotational Velocity:{' '}
                  {calculateMentalRotationVelocity(
                    lastAttempt.angularDisparityDeg,
                    lastAttempt.reactionTimeMs,
                  )}{' '}
                  °/s
                </span>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 2: MARY HEGARTY (2004) KINEMATIC SIMULATION */}
      {activeTab === 'kinematics' && (
        <div className="space-y-6">
          <Panel className="p-5 border border-neutral-200 dark:border-(--hub-border) rounded-xl space-y-4 bg-white dark:bg-(--hub-panel)">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <Cog className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  Mary Hegarty Kinematic Simulation Engine
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Humans reason about mechanical machines by piecemeal mental animation: tracing
                  causality link-by-link along the kinematic chain.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="text-xs h-8 px-3"
                  onClick={() => setIsSimulatingGears((prev) => !prev)}
                >
                  {isSimulatingGears ? 'Pause Animation' : 'Resume Continuous Motion'}
                </Button>
              </div>
            </div>

            {/* Kinematic Chain SVG Visualizer */}
            <div className="flex justify-center items-center p-4 bg-neutral-50 dark:bg-(--hub-panel-2) rounded-lg min-h-[280px]">
              <KinematicChainSVGViewer chain={kinematicChain} isAnimated={isSimulatingGears} />
            </div>

            {/* Step-by-Step Piecemeal Animation Challenge */}
            <div className="pt-3 border-t border-neutral-200 dark:border-(--hub-border) space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-strong">
                  Piecemeal Prediction Step {kinematicStepIndex + 1} of{' '}
                  {kinematicChain.stepEvaluationSequence.length}:
                </span>
                <span className="text-secondary">
                  Current Node:{' '}
                  <strong className="text-strong">
                    {kinematicChain.stepEvaluationSequence[kinematicStepIndex] || 'None'}
                  </strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  className="text-xs px-3 py-1.5 h-8 flex items-center gap-1.5"
                  onClick={() => {
                    const currentNodeId = kinematicChain.stepEvaluationSequence[kinematicStepIndex]
                    if (currentNodeId) {
                      setUserKinematicGuesses((prev) => ({ ...prev, [currentNodeId]: 'clockwise' }))
                      setKinematicStepIndex((prev) =>
                        Math.min(kinematicChain.stepEvaluationSequence.length - 1, prev + 1),
                      )
                    }
                  }}
                >
                  <RotateCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Predict
                  Clockwise
                </Button>

                <Button
                  variant="secondary"
                  className="text-xs px-3 py-1.5 h-8 flex items-center gap-1.5"
                  onClick={() => {
                    const currentNodeId = kinematicChain.stepEvaluationSequence[kinematicStepIndex]
                    if (currentNodeId) {
                      setUserKinematicGuesses((prev) => ({
                        ...prev,
                        [currentNodeId]: 'counter_clockwise',
                      }))
                      setKinematicStepIndex((prev) =>
                        Math.min(kinematicChain.stepEvaluationSequence.length - 1, prev + 1),
                      )
                    }
                  }}
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 -scale-x-100" />{' '}
                  Predict Counter-Clockwise
                </Button>

                <Button
                  variant="ghost"
                  className="text-xs px-2.5 py-1.5 h-8 ml-auto text-secondary"
                  onClick={() => {
                    setKinematicStepIndex(0)
                    setUserKinematicGuesses({})
                  }}
                >
                  Reset Sequence
                </Button>
              </div>

              {/* Node Telemetry Table */}
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-(--hub-border) text-secondary text-[11px]">
                      <th className="py-1 px-2 font-medium">Kinematic Node</th>
                      <th className="py-1 px-2 font-medium">Coupling Type</th>
                      <th className="py-1 px-2 font-medium">Speed (RPM)</th>
                      <th className="py-1 px-2 font-medium">Actual Direction</th>
                      <th className="py-1 px-2 font-medium">Your Prediction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kinematicChain.stepEvaluationSequence.map((nodeId) => {
                      const node = kinematicChain.nodes[nodeId]
                      const guess = userKinematicGuesses[nodeId]
                      const isCorrect = guess === node.direction

                      return (
                        <tr
                          key={nodeId}
                          className="border-b border-neutral-100 dark:border-(--hub-border)/50 hover:bg-neutral-50 dark:hover:bg-(--hub-panel-2)"
                        >
                          <td className="py-1.5 px-2 font-medium text-strong">{node.name}</td>
                          <td className="py-1.5 px-2 text-secondary">
                            {node.couplingType || 'Input source'}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-strong">
                            {node.angularVelocityRpm} RPM
                          </td>
                          <td className="py-1.5 px-2">
                            <Badge
                              tone={node.direction === 'clockwise' ? 'accent' : 'neutral'}
                              className="text-[10px]"
                            >
                              {node.direction}
                            </Badge>
                          </td>
                          <td className="py-1.5 px-2">
                            {guess ? (
                              <span
                                className={`flex items-center gap-1 ${
                                  isCorrect
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-500 dark:text-rose-400'
                                }`}
                              >
                                {isCorrect ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                  <XCircle className="w-3 h-3" />
                                )}
                                {guess}
                              </span>
                            ) : (
                              <span className="text-secondary italic text-[11px]">Pending</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: MULTIDISCIPLINARY STEM SPATIAL LAB */}
      {activeTab === 'scenarios' && (
        <div className="space-y-6">
          <Panel className="p-5 border border-neutral-200 dark:border-(--hub-border) rounded-xl space-y-4 bg-white dark:bg-(--hub-panel)">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Multidisciplinary STEM Spatial Reasoning Lab
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Uttal et al. (2013): Spatial visualization skills transfer powerfully across STEM
                  fields (d ≈ 0.47).
                </p>
              </div>

              <select
                value={selectedScenarioId}
                onChange={(e) => {
                  setSelectedScenarioId(e.target.value)
                  setSelectedAnswers({})
                }}
                className="text-xs bg-neutral-100 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) rounded-md px-3 py-1.5 text-strong focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {MULTIDISCIPLINARY_SPATIAL_SCENARIOS.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Scenario Header Info */}
            <div className="p-3.5 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-strong">{activeScenario.title}</span>
                <Badge tone="accent">{activeScenario.domain}</Badge>
              </div>
              <p className="text-secondary leading-relaxed">
                {activeScenario.scientificBackground}
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] text-secondary">
                <Compass className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>Reference Frame: {activeScenario.canonicalReferenceFrame}</span>
              </div>
            </div>

            {/* Scenario 3D Interactive Viewer */}
            {activeScenario.primaryPolycube && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-neutral-200 dark:border-(--hub-border) pb-1">
                  <span className="font-medium text-strong">
                    Interactive 3D Spatial Model: {activeScenario.primaryPolycube.name}
                  </span>
                  <span className="text-secondary font-mono text-[11px]">
                    Yaw: {scenarioEuler.yaw}°, Pitch: {scenarioEuler.pitch}°
                  </span>
                </div>

                <div className="flex justify-center items-center py-2 bg-neutral-50 dark:bg-(--hub-panel-2) rounded-lg min-h-[250px]">
                  <PolycubeSVGViewer
                    shape={activeScenario.primaryPolycube}
                    euler={scenarioEuler}
                    scale={32}
                  />
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-secondary text-[11px]">
                    <span>Interactive Orbit (Yaw):</span>
                    <span className="font-mono text-strong">{scenarioEuler.yaw}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    value={scenarioEuler.yaw}
                    onChange={(e) =>
                      setScenarioEuler((prev) => ({ ...prev, yaw: Number(e.target.value) }))
                    }
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Scenario Questions & Diagnostic Prompts */}
            <div className="space-y-4 pt-3 border-t border-neutral-200 dark:border-(--hub-border)">
              <h4 className="text-xs font-semibold text-strong flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Spatial Verification Questions:
              </h4>

              {activeScenario.keyQuestions.map((q) => {
                const userChoice = selectedAnswers[q.id]
                const isAnswered = userChoice !== undefined
                const isCorrect = userChoice === q.correctOptionIndex

                return (
                  <div
                    key={q.id}
                    className="p-4 rounded-lg bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-3 text-xs"
                  >
                    <p className="font-medium text-strong leading-relaxed">{q.prompt}</p>

                    <div className="space-y-1.5">
                      {q.options.map((opt, optIdx) => {
                        const isSelected = userChoice === optIdx

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() =>
                              setSelectedAnswers((prev) => ({ ...prev, [q.id]: optIdx }))
                            }
                            className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2.5 ${
                              isSelected
                                ? isCorrect
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-strong font-medium'
                                  : 'bg-rose-500/10 border-rose-500/40 text-strong'
                                : 'bg-white dark:bg-(--hub-panel) border-neutral-200 dark:border-(--hub-border) hover:border-neutral-400 dark:hover:border-neutral-600 text-secondary'
                            }`}
                          >
                            <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <span className="flex-1">{opt}</span>
                            {isSelected &&
                              (isCorrect ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                              ))}
                          </button>
                        )
                      })}
                    </div>

                    {isAnswered && (
                      <div
                        className={`p-2.5 rounded-md text-[11px] leading-relaxed border ${
                          isCorrect
                            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/5 border-rose-500/20 text-rose-500 dark:text-rose-400'
                        }`}
                      >
                        <strong>Rationale:</strong> {q.rationale}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: SPATIAL SPACED REPETITION (FSRS-6) DECK */}
      {activeTab === 'flashcards' && (
        <div className="space-y-6">
          <Panel className="p-5 border border-neutral-200 dark:border-(--hub-border) rounded-xl space-y-4 bg-white dark:bg-(--hub-panel)">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-strong flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Spatial Spaced Repetition (FSRS-6) Retention Deck
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Long-term spatial consolidation through scheduled model-checking and kinematic
                  flashcards.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-secondary">Session Progress:</span>
                <Badge tone="accent">
                  {currentCardIdx + 1} / {cards.length} ({deckCompletedCount} reviewed)
                </Badge>
              </div>
            </div>

            {/* Current Active Flashcard */}
            {cards[currentCardIdx] && (
              <div className="p-6 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-4 min-h-[260px] flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5" />
                      {cards[currentCardIdx].prompt}
                    </span>
                    <span className="text-secondary font-mono text-[11px]">
                      Disparity: {cards[currentCardIdx].disparityDeg}°
                    </span>
                  </div>

                  <p className="text-sm font-medium text-strong pt-2">
                    {cards[currentCardIdx].question}
                  </p>
                </div>

                {/* Multiple Choice Options */}
                <div className="space-y-2 pt-2">
                  {cards[currentCardIdx].options.map((opt, idx) => {
                    const isSelected = cardSelection === idx
                    const isCorrectAnswer = idx === cards[currentCardIdx].correctAnswerIndex

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCardSelection(idx)
                          setCardRevealed(true)
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between ${
                          cardRevealed
                            ? isCorrectAnswer
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-strong font-medium'
                              : isSelected
                                ? 'bg-rose-500/15 border-rose-500/40 text-strong'
                                : 'bg-white/50 dark:bg-(--hub-panel)/50 border-neutral-200/50 dark:border-(--hub-border)/50 text-secondary opacity-60'
                            : isSelected
                              ? 'bg-indigo-500/15 border-indigo-500 text-strong'
                              : 'bg-white dark:bg-(--hub-panel) border-neutral-200 dark:border-(--hub-border) hover:border-neutral-400 dark:hover:border-neutral-600 text-secondary'
                        }`}
                      >
                        <span>{opt}</span>
                        {cardRevealed &&
                          (isCorrectAnswer ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : isSelected ? (
                            <XCircle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                          ) : null)}
                      </button>
                    )
                  })}
                </div>

                {/* Answer Explanation & FSRS Rating Buttons */}
                {cardRevealed && (
                  <div className="pt-4 border-t border-neutral-200 dark:border-(--hub-border) space-y-3">
                    <div className="p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-xs text-secondary leading-relaxed">
                      <strong className="text-strong">FSRS Cognitive Explanation:</strong>{' '}
                      {cards[currentCardIdx].explanation}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <span className="text-[11px] text-secondary">
                        Rate Mental Retrieval Difficulty:
                      </span>
                      <div className="flex items-center gap-2">
                        {['Again (1)', 'Hard (2)', 'Good (3)', 'Easy (4)'].map((rate, rIdx) => (
                          <Button
                            key={rate}
                            variant={rIdx === 2 ? 'primary' : 'secondary'}
                            className="text-xs px-2.5 py-1 h-7"
                            onClick={() => {
                              setDeckCompletedCount((c) => c + 1)
                              setCardRevealed(false)
                              setCardSelection(null)
                              setCurrentCardIdx((prev) => (prev + 1) % cards.length)
                            }}
                          >
                            {rate}
                          </Button>
                        ))}
                      </div>
                    </div>
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

// ============================================================================
// Helper Subcomponent: Isometric 3D Polycube SVG Viewer with Depth Lighting
// ============================================================================

interface PolycubeSVGViewerProps {
  shape: PolycubeShape
  euler: RotationEuler
  scale?: number
}

function PolycubeSVGViewer({ shape, euler, scale = 30 }: PolycubeSVGViewerProps) {
  const gradientId = useId()
  const faces = useMemo(() => {
    return generateVoxelFaces(shape.voxels, euler, scale, { x: 140, y: 130 })
  }, [shape, euler, scale])

  return (
    <svg
      width="280"
      height="260"
      viewBox="0 0 280 260"
      className="overflow-visible select-none drop-shadow-md"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
        </radialGradient>
      </defs>

      {/* Render depth-sorted faces (Painter's algorithm) */}
      {faces.map((face, fIdx) => {
        const pointsStr = face.vertices.map((v) => `${v.x},${v.y}`).join(' ')
        const baseColor = face.color
        const shade = face.shade

        return (
          <polygon
            key={fIdx}
            points={pointsStr}
            fill={baseColor}
            fillOpacity={0.92}
            stroke="#0f172a"
            strokeWidth="0.8"
            strokeLinejoin="round"
            style={{
              filter: `brightness(${Math.round(shade * 110)}%)`,
            }}
          />
        )
      })}
    </svg>
  )
}

// ============================================================================
// Helper Subcomponent: Kinematic Chain SVG Viewer
// ============================================================================

interface KinematicChainSVGViewerProps {
  chain: KinematicChainState
  isAnimated: boolean
}

function KinematicChainSVGViewer({ chain }: KinematicChainSVGViewerProps) {
  const nodesList = Object.values(chain.nodes)

  return (
    <svg
      width="340"
      height="240"
      viewBox="100 80 140 120"
      className="overflow-visible select-none drop-shadow-sm"
    >
      {/* Background linkage lines between parents and children */}
      {nodesList.map((node) => {
        if (!node.drivenBy) return null
        const parent = chain.nodes[node.drivenBy]
        if (!parent) return null

        return (
          <line
            key={`link_${node.id}`}
            x1={parent.position.x}
            y1={parent.position.y}
            x2={node.position.x}
            y2={node.position.y}
            stroke="#64748b"
            strokeWidth="2"
            strokeDasharray={node.couplingType?.startsWith('belt') ? '4 2' : undefined}
            opacity={0.6}
          />
        )
      })}

      {/* Render kinematic gear nodes */}
      {nodesList.map((node) => {
        const isClockwise = node.direction === 'clockwise'
        const color = isClockwise ? '#38bdf8' : '#a855f7'

        return (
          <g key={node.id} transform={`translate(${node.position.x}, ${node.position.y})`}>
            {/* Gear Body Circle */}
            <circle
              r={node.pitchRadius}
              fill={color}
              fillOpacity={0.25}
              stroke={color}
              strokeWidth="2.5"
            />
            {/* Gear Hub Center */}
            <circle r="4" fill="#0f172a" stroke={color} strokeWidth="1.5" />

            {/* Gear Teeth / Spoke Markers */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
              const rad = (angle * Math.PI) / 180
              const x2 = Math.cos(rad) * node.pitchRadius
              const y2 = Math.sin(rad) * node.pitchRadius

              return (
                <line
                  key={angle}
                  x1="0"
                  y1="0"
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth="1.2"
                  opacity={0.7}
                />
              )
            })}

            {/* Direction Arrow Indicator */}
            <text
              y={node.pitchRadius + 14}
              textAnchor="middle"
              className="text-[8px] font-sans fill-neutral-900 dark:fill-neutral-100 font-semibold"
            >
              {node.name.split(' ')[0]}
            </text>
            <text
              y={node.pitchRadius + 22}
              textAnchor="middle"
              className="text-[7px] font-mono fill-neutral-500"
            >
              {node.angularVelocityRpm} RPM {isClockwise ? 'CW' : 'CCW'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
