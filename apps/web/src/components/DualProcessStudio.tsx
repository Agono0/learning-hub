/**
 * Learning HUB — Dual-Process Diagnostic & Cognitive Forcing Studio
 *
 * Grounded in the cognitive science of:
 * - Daniel Kahneman (2011): "Thinking, Fast and Slow"
 * - Keith E. Stanovich (2009, 2011): "Rationality and the Reflective Mind"
 * - Pat Croskerry (2002, 2003): "Cognitive Forcing Functions in Clinical Decision Making"
 *
 * All engine evaluation runs through the hub transport (`@/lib/transport` →
 * `/api/dual-process`, registered in the hub worker for native builds): the
 * scenario/bias catalog via GET, the live session telemetry via POST
 * `action:evaluate` and the FSRS deck via POST `action:deck`. The pure core
 * engine is mirrored in-browser as the instant optimistic value and as the
 * fallback when the API is unreachable (manual-mode guarantee, AGENTS.md
 * rule 9); both compute identical deterministic values, so rendering never
 * changes.
 */

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  CALIBRATED_DIAGNOSTIC_SCENARIOS,
  CANONICAL_COGNITIVE_BIAS_CATALOG,
  type BiasCatalogEntry,
  type CognitiveBiasType,
  type DiagnosticScenario,
  type DualProcessSessionMetrics,
  type FSRSDebiasingCard,
  type MindSystem,
  type ReflectiveMindTier,
  calculateBiasVulnerabilityScore,
  calculateCognitiveDecouplingScore,
  calculateReflectiveMindIndex,
  evaluateReflectiveMindTier,
  generateFSRSDebiasingDeck,
} from '@learning-hub/core/dualprocess'
import { apiGet, apiSend } from '@/lib/transport'
import { Badge, Button, DualProcessHUD, Panel } from '@/ui'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Compass,
  Copy,
  Eye,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

type StudioStage = 'stage_1_system1' | 'stage_2_forcing' | 'stage_3_reflective' | 'stage_4_deck'

/** GET /api/dual-process — calibrated scenario corpus + cognitive-bias catalog. */
interface DualProcessCatalogResponse {
  ok: boolean
  scenarios: DiagnosticScenario[]
  biasCatalog: Record<CognitiveBiasType, BiasCatalogEntry>
}

/** POST /api/dual-process `action:evaluate` — authoritative session telemetry. */
interface DualProcessEvaluateResponse {
  ok: boolean
  metrics: DualProcessSessionMetrics
  tier: ReflectiveMindTier
}

/** POST /api/dual-process `action:deck` — FSRS-6 debiasing cards. */
interface DualProcessDeckResponse {
  ok: boolean
  cards: FSRSDebiasingCard[]
}

export function DualProcessStudio() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    'emergency_medicine_chest_pain',
  )
  const [stage, setStage] = useState<StudioStage>('stage_1_system1')

  // Scenario corpus + bias catalog — served by the runtime-neutral handler
  // (GET /api/dual-process). The shipped content is both the initial data and
  // the unreachable-API fallback, so rendering never waits on the transport
  // and the studio works with the API down (manual mode, AGENTS.md rule 9).
  // API-first effect fetch: the bundled corpus paints synchronously (SSR
  // included); the handler's catalog replaces it once the response lands.
  const [catalog, setCatalog] = useState<DualProcessCatalogResponse>({
    ok: true,
    scenarios: CALIBRATED_DIAGNOSTIC_SCENARIOS,
    biasCatalog: CANONICAL_COGNITIVE_BIAS_CATALOG,
  })
  useEffect(() => {
    let stale = false
    apiGet<DualProcessCatalogResponse>('/api/dual-process')
      .then((res) => {
        if (!stale && res?.scenarios?.length && res.biasCatalog) setCatalog(res)
      })
      .catch(() => {
        // Manual mode: the bundled calibrated corpus remains.
      })
    return () => {
      stale = true
    }
  }, [])
  const scenarios = catalog.scenarios
  const biasCatalog = catalog.biasCatalog

  // Scenario state
  const scenario: DiagnosticScenario = useMemo(() => {
    return scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0]
  }, [scenarios, selectedScenarioId])

  // System 1 Fast Triage state
  const [system1ChoiceId, setSystem1ChoiceId] = useState<string>('')
  const [system1Confidence, setSystem1Confidence] = useState<number>(0.85)
  const [timerStartMs, setTimerStartMs] = useState<number>(Date.now())
  const [system1LatencyMs, setSystem1LatencyMs] = useState<number>(2400)

  // Cognitive Forcing Steps state
  const [completedForcingStepIds, setCompletedForcingStepIds] = useState<string[]>([])
  const [discoveredAnomalies, setDiscoveredAnomalies] = useState<string[]>([])
  const [pauseCountdown, setPauseCountdown] = useState<number>(0)
  const [isPausing, setIsPausing] = useState<boolean>(false)

  // Stage 3 Reflective state
  const [system2ChoiceId, setSystem2ChoiceId] = useState<string>('')
  const [system2Confidence, setSystem2Confidence] = useState<number>(0.9)
  const [activeMindSystem, setActiveMindSystem] = useState<MindSystem>('autonomous_mind')

  // Copied deck state
  const [isDeckCopied, setIsDeckCopied] = useState<boolean>(false)

  // Reset session when scenario changes
  useEffect(() => {
    setStage('stage_1_system1')
    setSystem1ChoiceId('')
    setSystem1Confidence(0.85)
    setTimerStartMs(Date.now())
    setSystem1LatencyMs(2400)
    setCompletedForcingStepIds([])
    setDiscoveredAnomalies([])
    setSystem2ChoiceId('')
    setSystem2Confidence(0.9)
    setActiveMindSystem('autonomous_mind')
    setIsDeckCopied(false)
  }, [selectedScenarioId])

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

  // Handle countdown timer for Universal Pause CFF
  useEffect(() => {
    if (!isPausing || pauseCountdown <= 0) return

    const interval = setInterval(() => {
      setPauseCountdown((prev) => {
        if (prev <= 1) {
          setIsPausing(false)
          playTone(660, 'sine', 0.25)
          hapticMedium()
          return 0
        }
        playTone(330, 'triangle', 0.08)
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isPausing, pauseCountdown])

  // Live HUD telemetry — the in-browser engine mirror: instant (the HUD must
  // never wait on the transport) and the manual-mode fallback when the API is
  // unreachable. Deterministic and identical to the handler's computation.
  const localMetrics: DualProcessSessionMetrics = useMemo(() => {
    const decoupling = calculateCognitiveDecouplingScore({
      hypothesesConsideredCount: completedForcingStepIds.length >= 2 ? 3 : 1,
      anomaliesDiscoveredCount: discoveredAnomalies.length,
      forcingStepsCompletedCount: completedForcingStepIds.length,
      totalForcingStepsCount: scenario.cognitiveForcingSteps.length,
    })

    const vulnerability = calculateBiasVulnerabilityScore({
      initialDecisionLatencyMs: system1LatencyMs,
      forcingStepsCompletedCount: completedForcingStepIds.length,
      totalForcingStepsCount: scenario.cognitiveForcingSteps.length,
      anomaliesDiscoveredCount: discoveredAnomalies.length,
      totalAnomaliesCount: scenario.subtleAnomalies.length,
    })

    const targetHypothesis = scenario.hypotheses.find((h) => h.isTargetOptimalSolution)
    const accuracy = system2ChoiceId ? system2ChoiceId === targetHypothesis?.id : false
    const override =
      Boolean(system1ChoiceId) &&
      Boolean(system2ChoiceId) &&
      system1ChoiceId !== system2ChoiceId &&
      accuracy

    const reflectiveIndex = calculateReflectiveMindIndex({
      cognitiveDecouplingScore: decoupling,
      biasVulnerabilityScore: vulnerability,
      reflectiveOverrideOccurred: override,
      diagnosticAccuracyAchieved: accuracy,
    })

    return {
      scenarioId: scenario.id,
      system1InitialDiagnosisId: system1ChoiceId,
      system1DecisionLatencyMs: system1LatencyMs,
      system1InitialConfidence: system1Confidence,
      completedForcingStepIds,
      discoveredAnomalies,
      system2FinalDiagnosisId: system2ChoiceId,
      system2FinalConfidence: system2Confidence,
      reflectiveOverrideOccurred: override,
      cognitiveDecouplingScore: decoupling,
      biasVulnerabilityScore: vulnerability,
      reflectiveMindIndex: reflectiveIndex,
      diagnosticAccuracyAchieved: accuracy,
    }
  }, [
    scenario,
    system1ChoiceId,
    system1LatencyMs,
    system1Confidence,
    completedForcingStepIds,
    discoveredAnomalies,
    system2ChoiceId,
    system2Confidence,
  ])

  // Authoritative evaluation through the hub transport (POST /api/dual-process
  // `action:evaluate`): the handler derives override/accuracy against the
  // scenario corpus and runs the same scoring functions server-side. The query
  // is keyed on the full session input so each interaction reconciles; until
  // it lands (or forever, if the API is unreachable) the identical local
  // mirror above shows — the HUD never flickers.
  const sessionInput = useMemo(
    () => ({
      scenarioId: scenario.id,
      system1ChoiceId,
      system1LatencyMs,
      system1Confidence,
      completedForcingStepIds,
      discoveredAnomalies,
      system2ChoiceId,
      system2Confidence,
    }),
    [
      scenario,
      system1ChoiceId,
      system1LatencyMs,
      system1Confidence,
      completedForcingStepIds,
      discoveredAnomalies,
      system2ChoiceId,
      system2Confidence,
    ],
  )
  // Authoritative evaluation through the hub transport (POST /api/dual-process
  // `action:evaluate`): the handler derives override/accuracy against the
  // scenario corpus and runs the same scoring functions server-side. The
  // request is keyed on the full session input so each interaction reconciles;
  // until it lands (or forever, if the API is unreachable) the identical local
  // mirror above shows — the HUD never flickers. The key-match means a stale
  // in-flight response can never render for newer inputs.
  const [apiEvaluation, setApiEvaluation] = useState<{
    key: string
    metrics: DualProcessSessionMetrics
    tier: ReflectiveMindTier
  } | null>(null)
  const evaluationKey = JSON.stringify(sessionInput)
  useEffect(() => {
    let stale = false
    apiSend<DualProcessEvaluateResponse>('/api/dual-process', 'POST', {
      action: 'evaluate',
      session: sessionInput,
    })
      .then((res) => {
        if (!stale && res?.metrics) {
          setApiEvaluation({ key: evaluationKey, metrics: res.metrics, tier: res.tier })
        }
      })
      .catch(() => {
        // Manual mode: the in-browser mirror already rendered this evaluation.
      })
    return () => {
      stale = true
    }
  }, [evaluationKey, sessionInput])
  const metrics: DualProcessSessionMetrics =
    apiEvaluation?.key === evaluationKey ? apiEvaluation.metrics : localMetrics
  // Stanovich reflective tier — server-derived when the evaluation landed,
  // locally classified otherwise (same thresholds, same value).
  const reflectiveTier: ReflectiveMindTier =
    apiEvaluation?.key === evaluationKey
      ? apiEvaluation.tier
      : evaluateReflectiveMindTier(metrics.reflectiveMindIndex)

  // Generated FSRS Debiasing Cards — synthesized by the handler (POST
  // /api/dual-process `action:deck`) with the local generation as the instant
  // fallback (identical output, manual-mode guarantee, rule 9).
  const localDeck: FSRSDebiasingCard[] = useMemo(() => {
    return generateFSRSDebiasingDeck(scenario)
  }, [scenario])
  const [apiDeck, setApiDeck] = useState<{ key: string; cards: FSRSDebiasingCard[] } | null>(null)
  const deckKey = scenario.id
  useEffect(() => {
    let stale = false
    apiSend<DualProcessDeckResponse>('/api/dual-process', 'POST', {
      action: 'deck',
      scenarioId: scenario.id,
    })
      .then((res) => {
        if (!stale && Array.isArray(res.cards)) setApiDeck({ key: deckKey, cards: res.cards })
      })
      .catch(() => {
        // Manual mode: the in-browser generation already rendered this deck.
      })
    return () => {
      stale = true
    }
  }, [deckKey, scenario])
  const debiasingCards: FSRSDebiasingCard[] = apiDeck?.key === deckKey ? apiDeck.cards : localDeck

  // Handler: Submit System 1 Fast Gut Choice
  const handleSystem1Submit = (choiceId: string) => {
    const latency = Math.max(800, Date.now() - timerStartMs)
    setSystem1LatencyMs(latency)
    setSystem1ChoiceId(choiceId)
    hapticLight()

    if (choiceId === scenario.defaultSystem1DiagnosisId) {
      // User fell into the heuristic trap
      playTone(280, 'sawtooth', 0.2)
    } else {
      playTone(520, 'sine', 0.15)
    }
  }

  // Handler: Advance to Stage 2 Cognitive Forcing
  const handleProceedToForcing = () => {
    setStage('stage_2_forcing')
    setActiveMindSystem('algorithmic_mind')
    hapticMedium()
    playTone(440, 'triangle', 0.15)
  }

  // Handler: Execute Cognitive Forcing Step
  const handleToggleForcingStep = (stepId: string, seconds: number) => {
    if (completedForcingStepIds.includes(stepId)) {
      setCompletedForcingStepIds((prev) => prev.filter((id) => id !== stepId))
      hapticLight()
      return
    }

    // If it's the pause function, trigger countdown
    if (stepId.includes('pause')) {
      setIsPausing(true)
      setPauseCountdown(seconds)
    }

    setCompletedForcingStepIds((prev) => [...prev, stepId])
    hapticMedium()
    playTone(587.33, 'sine', 0.15)
  }

  // Handler: Toggle Discovered Anomaly
  const handleToggleAnomaly = (anomalyText: string) => {
    if (discoveredAnomalies.includes(anomalyText)) {
      setDiscoveredAnomalies((prev) => prev.filter((a) => a !== anomalyText))
      hapticLight()
      return
    }
    setDiscoveredAnomalies((prev) => [...prev, anomalyText])
    hapticHeavy()
    playTone(659.25, 'sine', 0.18)
  }

  // Handler: Advance to Stage 3 Reflective Synthesis
  const handleProceedToReflective = () => {
    setStage('stage_3_reflective')
    setActiveMindSystem('reflective_mind')
    hapticMedium()
    playTone(523.25, 'sine', 0.2)
  }

  // Handler: Final System 2 Choice Selection
  const handleSelectSystem2Choice = (hypId: string) => {
    setSystem2ChoiceId(hypId)
    const target = scenario.hypotheses.find((h) => h.isTargetOptimalSolution)
    if (hypId === target?.id) {
      playTone(784, 'sine', 0.3)
      hapticHeavy()
    } else {
      playTone(320, 'sawtooth', 0.2)
      hapticLight()
    }
  }

  // Copy FSRS debiasing deck to clipboard
  const handleCopyDeck = () => {
    const text = debiasingCards
      .map(
        (c, i) =>
          `Card ${i + 1} [${c.biasType}]: ${c.question}\nAnswer: ${c.answer}\nRule: ${c.croskerryRule}\n`,
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
      {/* Header & Scenario Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary">
              Dual-Process & Forcing Studio
            </span>
            <Badge tone="accent">Kahneman · Stanovich · Croskerry</Badge>
          </div>
          <h1 className="text-2xl font-bold text-strong tracking-tight">
            Cognitive Forcing & Diagnostic Calibration
          </h1>
          <p className="text-sm text-secondary mt-1">
            Deconstruct heuristic System 1 traps, engage algorithmic cognitive decoupling, and
            execute structured Cognitive Forcing Functions (CFFs).
          </p>
        </div>

        {/* Scenario Switcher Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {scenarios.map((sc) => (
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
              {sc.domain === 'emergency_medicine' && 'Emergency Medicine'}
              {sc.domain === 'distributed_systems' && 'Distributed Raft'}
              {sc.domain === 'macro_finance' && 'Macro-Finance ABCP'}
              {sc.domain === 'gpu_architecture' && 'GPU MoE Kernels'}
            </button>
          ))}
        </div>
      </div>

      {/* Real-Time Dual-Process HUD */}
      <DualProcessHUD
        activeMindSystem={activeMindSystem}
        metrics={metrics}
        scenarioTitle={scenario.title}
        onMindSystemSelect={(sys) => setActiveMindSystem(sys)}
      />

      {/* Stage Navigation Stepper */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => {
            setStage('stage_1_system1')
            setActiveMindSystem('autonomous_mind')
          }}
          className={`p-3 rounded-xl border text-left transition-all ${
            stage === 'stage_1_system1'
              ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 ring-1 ring-amber-500/40'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-strong mb-1">
            <span>Stage 1: System 1</span>
            {system1ChoiceId && <CheckCircle2 className="w-3.5 h-3.5 text-status-success-text" />}
          </div>
          <p className="text-[11px] text-secondary">Rapid Autonomous Triage</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStage('stage_2_forcing')
            setActiveMindSystem('algorithmic_mind')
          }}
          className={`p-3 rounded-xl border text-left transition-all ${
            stage === 'stage_2_forcing'
              ? 'border-sky-500 bg-sky-50/40 dark:bg-sky-950/20 ring-1 ring-sky-500/40'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-strong mb-1">
            <span>Stage 2: Forcing</span>
            <span className="text-[10px] text-status-info-text dark:text-status-info-text">
              {completedForcingStepIds.length}/{scenario.cognitiveForcingSteps.length}
            </span>
          </div>
          <p className="text-[11px] text-secondary">Croskerry CFF Checkpoints</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStage('stage_3_reflective')
            setActiveMindSystem('reflective_mind')
          }}
          className={`p-3 rounded-xl border text-left transition-all ${
            stage === 'stage_3_reflective'
              ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-950/20 ring-1 ring-violet-500/40'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-strong mb-1">
            <span>Stage 3: Reflection</span>
            {system2ChoiceId && <CheckCircle2 className="w-3.5 h-3.5 text-status-success-text" />}
          </div>
          <p className="text-[11px] text-secondary">Stanovich Reflective Audit</p>
        </button>

        <button
          type="button"
          onClick={() => setStage('stage_4_deck')}
          className={`p-3 rounded-xl border text-left transition-all ${
            stage === 'stage_4_deck'
              ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500/40'
              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel)'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-strong mb-1">
            <span>Stage 4: FSRS Deck</span>
            <Badge tone="success">{debiasingCards.length}</Badge>
          </div>
          <p className="text-[11px] text-secondary">Spaced Debiasing Practice</p>
        </button>
      </div>

      {/* Main Interactive Stage Panels */}
      {stage === 'stage_1_system1' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="warning">System 1 Autonomous Mind</Badge>
                <span className="text-xs text-secondary">Simulated Time-Sensitive Pressure</span>
              </div>
              <h2 className="text-lg font-bold text-strong">{scenario.title}</h2>
              <p className="text-sm text-secondary mt-1 leading-relaxed">
                {scenario.leadPresenterNarrative}
              </p>
            </div>
          </div>

          {/* Initial Salient Data Cards */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary mb-2 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-status-warning-text" />
              Salient Triage Telemetry (High-Arousal Cues)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {scenario.initialSalientData.map((cue, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) text-xs text-strong font-medium flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-status-warning-text dark:text-status-warning-text font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span>{cue}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rapid Triage Selection */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-strong">
                Select Your Immediate Gut Impression (System 1 Candidate)
              </h3>
              <span className="text-xs text-secondary">
                Latency logged:{' '}
                <strong className="text-strong">
                  {(metrics.system1DecisionLatencyMs / 1000).toFixed(1)}s
                </strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {scenario.hypotheses.map((hyp) => {
                const isSelected = system1ChoiceId === hyp.id
                return (
                  <button
                    key={hyp.id}
                    type="button"
                    onClick={() => handleSystem1Submit(hyp.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 ring-1 ring-amber-500/40'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-panel-2) hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-strong line-clamp-1">{hyp.name}</span>
                      <Badge
                        tone={
                          hyp.lethalityOrRiskTier === 'catastrophic'
                            ? 'danger'
                            : hyp.lethalityOrRiskTier === 'critical'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {hyp.lethalityOrRiskTier}
                      </Badge>
                    </div>
                    <p className="text-xs text-secondary line-clamp-2">{hyp.systemicMechanism}</p>
                    <div className="mt-2 text-[11px] text-tertiary">
                      Base rate: <strong>{(hyp.priorProbability * 100).toFixed(0)}%</strong>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* System 1 Confidence Calibration */}
          {system1ChoiceId && (
            <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-strong">
                  Initial Gut Confidence Level: {(system1Confidence * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-secondary">
                  {system1Confidence > 0.8
                    ? 'High certainty (Heuristic Anchor risk)'
                    : 'Moderate certainty'}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={system1Confidence}
                onChange={(e) => setSystem1Confidence(parseFloat(e.target.value))}
                className="w-full accent-amber-600"
              />

              {system1ChoiceId === scenario.defaultSystem1DiagnosisId && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-xs text-danger-text dark:text-danger-text">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-danger-text dark:text-danger-text" />
                  <div>
                    <strong className="font-bold">Heuristic Trap Triggered: </strong>
                    {scenario.vividHeuristicTrapDescription}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="primary" onClick={handleProceedToForcing}>
                  Engage Cognitive Forcing (Stage 2)
                  <ArrowRight className="w-4 h-4 ml-1.5 inline" />
                </Button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Stage 2: Croskerry Cognitive Forcing Checkpoints */}
      {stage === 'stage_2_forcing' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="accent">Pat Croskerry (2002)</Badge>
                <span className="text-xs text-secondary">
                  Active Forcing Checkpoints ({completedForcingStepIds.length}/
                  {scenario.cognitiveForcingSteps.length})
                </span>
              </div>
              <h2 className="text-lg font-bold text-strong">
                System 2 Cognitive Forcing Functions (CFFs)
              </h2>
              <p className="text-xs text-secondary mt-1">
                Mandatory metacognitive gates designed to interrupt automatic System 1 closure,
                audit search satisficing, and force cognitive decoupling.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setStage('stage_1_system1')}>
                Back to System 1
              </Button>
              <Button
                variant="primary"
                disabled={completedForcingStepIds.length === 0}
                onClick={handleProceedToReflective}
              >
                Proceed to Reflective Audit
                <ChevronRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          {/* Pause Countdown Banner if active */}
          {isPausing && (
            <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/40 text-center space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-ac-text dark:text-ac-text">
                Universal Metacognitive Timeout Active
              </div>
              <div className="text-3xl font-extrabold text-strong">{pauseCountdown}s remaining</div>
              <p className="text-xs text-secondary">
                Halt all execution. Interrogate: &ldquo;What else could this presentation be?&rdquo;
              </p>
            </div>
          )}

          {/* Cognitive Forcing Step Cards */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-status-info-text" />
              Mandatory Diagnostic Forcing Gates
            </h3>

            <div className="space-y-3">
              {scenario.cognitiveForcingSteps.map((step) => {
                const isCompleted = completedForcingStepIds.includes(step.id)
                const bias = biasCatalog[step.targetBiasMitigated]
                return (
                  <div
                    key={step.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isCompleted
                        ? 'border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-950/10'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-panel-2)'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-strong">{step.title}</span>
                        <Badge tone="violet">Mitigates: {bias.label}</Badge>
                      </div>

                      <Button
                        variant={isCompleted ? 'secondary' : 'primary'}
                        onClick={() =>
                          handleToggleForcingStep(step.id, step.minimumExecutionSeconds)
                        }
                      >
                        {isCompleted ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-status-success-text" />
                            Completed
                          </>
                        ) : (
                          <>Execute Gate ({step.minimumExecutionSeconds}s)</>
                        )}
                      </Button>
                    </div>

                    <p className="text-xs text-secondary leading-relaxed mb-2">
                      {step.instruction}
                    </p>

                    <div className="p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) text-xs">
                      <strong className="text-strong font-semibold flex items-center gap-1 mb-0.5">
                        <Compass className="w-3.5 h-3.5 text-ac-text" />
                        Forcing Question to Demand:
                      </strong>
                      <span className="text-secondary italic">
                        &ldquo;{step.forcingQuestion}&rdquo;
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Subtle Anomalies & Falsification Crucible */}
          <div className="pt-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-danger-text" />
                Disconfirmation Crucible: Hidden Counter-Anomalies
              </h3>
              <span className="text-xs text-secondary">
                Uncovered: <strong>{discoveredAnomalies.length}</strong> /{' '}
                {scenario.subtleAnomalies.length}
              </span>
            </div>

            <p className="text-xs text-secondary">
              Default System 1 ignores anomalies that contradict the favored theory. Click to
              investigate and audit each critical diagnostic anomaly:
            </p>

            <div className="space-y-2">
              {scenario.subtleAnomalies.map((anom, idx) => {
                const isDiscovered = discoveredAnomalies.includes(anom)
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleToggleAnomaly(anom)}
                    className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                      isDiscovered
                        ? 'border-rose-400/60 bg-rose-50/30 dark:bg-rose-950/20 text-strong'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) text-secondary hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs ${
                        isDiscovered
                          ? 'bg-rose-600 text-white dark:bg-rose-500'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-secondary'
                      }`}
                    >
                      {isDiscovered ? '✓' : idx + 1}
                    </div>
                    <div className="text-xs flex-1">
                      <div className="font-medium text-strong">
                        {isDiscovered ? anom : 'Click to inspect diagnostic anomaly telemetry...'}
                      </div>
                      {isDiscovered && (
                        <p className="text-[11px] text-danger-text dark:text-danger-text mt-1">
                          Directly contradicts the default hypothesis (&ldquo;
                          {scenario.defaultSystem1DiagnosisId}&rdquo;).
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </Panel>
      )}

      {/* Stage 3: Stanovich Reflective Mind Audit */}
      {stage === 'stage_3_reflective' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="violet">Keith Stanovich (2011)</Badge>
                <span className="text-xs text-secondary">Reflective Mind Heuristic Override</span>
              </div>
              <h2 className="text-lg font-bold text-strong">
                Final Diagnostic Synthesis & Override Decision
              </h2>
              <p className="text-xs text-secondary mt-1">
                Having applied Cognitive Forcing and investigated contradictory anomalies, commit
                your final calibrated System 2 diagnosis.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setStage('stage_2_forcing')}>
                Back to Forcing
              </Button>
              <Button variant="primary" onClick={() => setStage('stage_4_deck')}>
                View Spaced Debiasing Deck
                <ChevronRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          {/* Differential Diagnostic Decision Matrix */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
              Commit Final Diagnosis (System 2 Reflective Judgment)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {scenario.hypotheses.map((hyp) => {
                const isSelected = system2ChoiceId === hyp.id
                return (
                  <button
                    key={hyp.id}
                    type="button"
                    onClick={() => handleSelectSystem2Choice(hyp.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? hyp.isTargetOptimalSolution
                          ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500/40'
                          : 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/20 ring-1 ring-rose-500/40'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-panel-2) hover:border-neutral-300 dark:hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-strong line-clamp-1">{hyp.name}</span>
                      {hyp.isTargetOptimalSolution && <Badge tone="success">Optimal Target</Badge>}
                    </div>
                    <p className="text-xs text-secondary line-clamp-2 mb-2">
                      {hyp.systemicMechanism}
                    </p>

                    <div className="text-[11px] space-y-1 text-tertiary border-t border-neutral-200 dark:border-(--hub-border) pt-2">
                      <div>
                        Prior P(H): <strong>{(hyp.priorProbability * 100).toFixed(0)}%</strong>
                      </div>
                      <div>
                        Contradictions:{' '}
                        <strong>
                          {hyp.contradictoryAnomalies.length || 'None (Explains All)'}
                        </strong>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Reflective Mind Outcome Banner */}
          {system2ChoiceId && (
            <div className="p-5 rounded-2xl bg-neutral-50 dark:bg-(--hub-panel-2) border border-neutral-200 dark:border-(--hub-border) space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-ac-text" />
                  <h4 className="text-sm font-bold text-strong">Reflective Override Analysis</h4>
                </div>
                {metrics.reflectiveOverrideOccurred ? (
                  <Badge tone="success">Heuristic Override Successful</Badge>
                ) : (
                  <Badge tone="neutral">Diagnosis Unchanged</Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-[11px] text-secondary">Initial System 1 Choice</div>
                  <div className="text-xs font-bold text-strong mt-0.5 line-clamp-1">
                    {scenario.hypotheses.find((h) => h.id === system1ChoiceId)?.name ?? 'None'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-[11px] text-secondary">Final System 2 Choice</div>
                  <div className="text-xs font-bold text-strong mt-0.5 line-clamp-1">
                    {scenario.hypotheses.find((h) => h.id === system2ChoiceId)?.name ?? 'None'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border)">
                  <div className="text-[11px] text-secondary">Stanovich Reflective Tier</div>
                  <div className="text-xs font-bold text-ac-text dark:text-ac-text mt-0.5 uppercase">
                    {reflectiveTier.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) space-y-2">
                <div className="text-xs font-bold text-strong flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-status-success-text" />
                  Authoritative Diagnostic Resolution
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  {scenario.authoritativeResolution}
                </p>
                <div className="text-xs font-medium text-strong pt-1">
                  Epistemic Takeaway:{' '}
                  <span className="text-secondary">{scenario.epistemicTakeaway}</span>
                </div>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Stage 4: Spaced Debiasing Flashcards Deck */}
      {stage === 'stage_4_deck' && (
        <Panel className="p-5 sm:p-6 border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-(--hub-border) pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="success">FSRS-6 Debiasing Bridge</Badge>
                <span className="text-xs text-secondary">
                  Spaced Repetition Cognitive Forcing Cards ({debiasingCards.length} generated)
                </span>
              </div>
              <h2 className="text-lg font-bold text-strong">
                Cognitive Debiasing Spaced Repetition Deck
              </h2>
              <p className="text-xs text-secondary mt-1">
                Retain Croskerry forcing functions and Popperian falsification rules in long-term
                memory using FSRS-6 spaced retrieval.
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
                  setStage('stage_1_system1')
                  setSelectedScenarioId(
                    selectedScenarioId === 'emergency_medicine_chest_pain'
                      ? 'distributed_systems_consensus_partition'
                      : 'emergency_medicine_chest_pain',
                  )
                }}
              >
                Next Challenge Scenario
                <ArrowRight className="w-4 h-4 ml-1 inline" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {debiasingCards.map((card, idx) => (
              <div
                key={card.id}
                className="p-4 rounded-xl border border-neutral-200 dark:border-(--hub-border) bg-neutral-50 dark:bg-(--hub-panel-2) space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Badge tone="violet">{card.biasType.replace(/_/g, ' ')}</Badge>
                  <span className="text-[11px] text-tertiary">Card #{idx + 1}</span>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-strong">Retrieval Prompt:</div>
                  <p className="text-xs text-secondary font-medium leading-relaxed">
                    {card.question}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-(--hub-panel) border border-neutral-200 dark:border-(--hub-border) space-y-2">
                  <div className="text-[11px] font-bold text-strong">Antidote & Resolution:</div>
                  <p className="text-xs text-secondary whitespace-pre-line leading-relaxed">
                    {card.answer}
                  </p>
                  <div className="text-[10px] text-tertiary pt-1 border-t border-neutral-200 dark:border-(--hub-border)">
                    Croskerry Rule: <em>{card.croskerryRule}</em>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
