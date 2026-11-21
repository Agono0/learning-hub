'use client'

/**
 * @file apps/web/src/components/CognitiveApprenticeshipStudio.tsx
 * @description Cognitive Apprenticeship & Expert Modeling Studio component.
 *
 * Grounded in:
 * - Allan Collins, John Seely Brown & Susan E. Newman (1989):
 *   Cognitive Apprenticeship methods: Modeling, Coaching, Scaffolding, Articulation, Reflection, Exploration.
 * - Jean Lave & Etienne Wenger (1991):
 *   Legitimate Peripheral Participation (LPP) across authentic practice communities.
 *
 * All engine evaluation goes through the hub transport (`/api/apprenticeship`,
 * GET for the suite corpus, POST `metrics`/`deck` actions); the bundled core
 * imports below are only the offline fallback so the studio keeps working with
 * the API unreachable (manual-mode guarantee, AGENTS.md rule 9). The API
 * computes byte-identical values, so the substitution is never visible.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  type ApprenticeshipMetrics,
  type ApprenticeshipStage,
  CALIBRATED_APPRENTICESHIP_SUITES,
  calculateFadingIndex,
  calculateTacitExtractionRate,
  type CognitiveApprenticeshipSuite,
  determineParticipationLevel,
  type FSRSTacitHeuristicCard,
} from '@learning-hub/core/apprenticeship'
import { Badge, Button, CognitiveApprenticeshipHUD, Panel } from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'
import { getSharedAudioContext } from '@/lib/audio-graph'
import { hapticHeavy, hapticLight, hapticMedium } from '../platform/haptics'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Compass,
  Copy,
  Eye,
  Layers,
  RotateCcw,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'

type StudioTab = 'traces' | 'articulation' | 'reflection' | 'deck'

/** GET /api/apprenticeship — the calibrated suite corpus served by the hub. */
interface SuitesResponse {
  ok: boolean
  suites: Record<string, CognitiveApprenticeshipSuite>
}
/** POST /api/apprenticeship `metrics` — engine telemetry for the session state. */
interface MetricsResponse {
  ok: boolean
  metrics: ApprenticeshipMetrics
}
/** POST /api/apprenticeship `deck` — engine-synthesized FSRS tacit-heuristic cards. */
interface DeckResponse {
  ok: boolean
  cards: readonly FSRSTacitHeuristicCard[]
}

export function CognitiveApprenticeshipStudio() {
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('distributed_consensus_raft')
  const [activeTab, setActiveTab] = useState<StudioTab>('traces')
  const [currentStage, setCurrentStage] = useState<ApprenticeshipStage>('modeling')

  // Suite corpus via the hub API (GET, static content — one-shot fetch per
  // session); the bundled core constant is the initial state and the offline
  // fallback, so rendering is identical while the request is in flight or
  // when the API is unreachable (manual mode, rule 9). API-first effect
  // fetch: the bundled corpus paints synchronously (SSR included).
  const [suites, setSuites] = useState<Record<string, CognitiveApprenticeshipSuite>>(
    CALIBRATED_APPRENTICESHIP_SUITES,
  )
  useEffect(() => {
    let stale = false
    apiGet<SuitesResponse>('/api/apprenticeship')
      .then((res) => {
        if (!stale && res?.suites && Object.keys(res.suites).length > 0) setSuites(res.suites)
      })
      .catch(() => {
        // Manual mode: the bundled calibrated suite corpus remains.
      })
    return () => {
      stale = true
    }
  }, [])

  // Learning progress state
  const [observedTraceIds, setObservedTraceIds] = useState<Set<string>>(new Set())
  const [activeTraceIndex, setActiveTraceIndex] = useState<number>(0)
  const [articulationAnswers, setArticulationAnswers] = useState<
    Record<string, { optionId: string; score: number; principleId?: string }>
  >({})
  const [unlockedPrincipleIds, setUnlockedPrincipleIds] = useState<Set<string>>(new Set())
  const [completedReflectionIds, setCompletedReflectionIds] = useState<Set<string>>(new Set())
  const [openArticulationTexts, setOpenArticulationTexts] = useState<Record<string, string>>({})
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const suite: CognitiveApprenticeshipSuite =
    suites[selectedSuiteId] ??
    suites.distributed_consensus_raft ??
    CALIBRATED_APPRENTICESHIP_SUITES.distributed_consensus_raft

  // Audio tone feedback
  const playTone = (type: 'success' | 'alert' | 'unlock') => {
    void getSharedAudioContext()
      .then((ctx) => {
        if (!ctx) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        const now = ctx.currentTime
        if (type === 'success') {
          osc.frequency.setValueAtTime(523.25, now) // C5
          osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15) // G5
          gain.gain.setValueAtTime(0.12, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
          osc.start(now)
          osc.stop(now + 0.3)
        } else if (type === 'alert') {
          osc.frequency.setValueAtTime(329.63, now) // E4
          osc.frequency.setValueAtTime(293.66, now + 0.1) // D4
          gain.gain.setValueAtTime(0.12, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.25)
        } else {
          // Unlock chord
          osc.frequency.setValueAtTime(440.0, now) // A4
          osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.18) // A5
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
          osc.start(now)
          osc.stop(now + 0.35)
        }
      })
      .catch(() => {})
  }

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3200)
  }

  // Calculated Apprenticeship Metrics — engine evaluation via the hub API
  // (POST `metrics`), with the pure core primitives as the offline fallback.
  // The request body doubles as the query key payload, so every state change
  // re-consults the API while the local value renders instantly meanwhile.
  const metricsRequest = useMemo(
    () => ({
      action: 'metrics' as const,
      suiteId: suite.id,
      stage: currentStage,
      observedTraceIds: [...observedTraceIds].sort(),
      extractedPrincipleIds: [...unlockedPrincipleIds].sort(),
      articulationScores: Object.values(articulationAnswers).map((a) => a.score),
      completedReflectionIds: [...completedReflectionIds].sort(),
    }),
    [
      suite,
      currentStage,
      observedTraceIds,
      articulationAnswers,
      unlockedPrincipleIds,
      completedReflectionIds,
    ],
  )

  // Offline fallback: the same computation chain the studio ran inline before
  // hub-ification (engine primitives over the local session state).
  const localMetrics = useMemo((): ApprenticeshipMetrics => {
    const scores = Object.values(articulationAnswers).map((a) => a.score)
    const tacitRate = calculateTacitExtractionRate(
      unlockedPrincipleIds.size,
      suite.principles.length,
      scores,
    )
    const fading = calculateFadingIndex(
      currentStage,
      Object.keys(articulationAnswers).length,
      suite.prompts.length,
    )
    const partLevel = determineParticipationLevel(fading, tacitRate)

    const meanScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : 0

    return {
      totalTracesObserved: observedTraceIds.size,
      totalArticulationsAttempted: Object.keys(articulationAnswers).length,
      meanArticulationScore: meanScore,
      extractedPrincipleCount: unlockedPrincipleIds.size,
      totalAvailablePrinciples: suite.principles.length,
      tacitExtractionRate: tacitRate,
      completedReflectionsCount: completedReflectionIds.size,
      fadingIndex: fading,
      participationLevel: partLevel,
      stageReadiness: {
        modeling: observedTraceIds.size > 0,
        coaching: observedTraceIds.size >= suite.traces.length,
        scaffolding: Object.keys(articulationAnswers).length > 0,
        articulation: Object.keys(articulationAnswers).length >= suite.prompts.length,
        reflection: completedReflectionIds.size > 0,
        exploration:
          fading >= 0.7 && completedReflectionIds.size >= suite.reflectionContrasts.length,
      },
    }
  }, [
    observedTraceIds.size,
    articulationAnswers,
    unlockedPrincipleIds.size,
    completedReflectionIds.size,
    currentStage,
    suite,
  ])

  // The metrics request is keyed on its serialized request body; a response
  // is applied only while its key still matches the current request, so a
  // stale in-flight response can never render for newer session state — the
  // identical offline engine computation covers the in-flight window.
  const [apiMetrics, setApiMetrics] = useState<{
    key: string
    metrics: ApprenticeshipMetrics
  } | null>(null)
  const metricsKey = JSON.stringify(metricsRequest)
  useEffect(() => {
    let stale = false
    apiSend<MetricsResponse>('/api/apprenticeship', 'POST', metricsRequest)
      .then((res) => {
        if (!stale && res?.metrics) setApiMetrics({ key: metricsKey, metrics: res.metrics })
      })
      .catch(() => {
        // Manual mode: the offline engine computation already rendered.
      })
    return () => {
      stale = true
    }
  }, [metricsKey, metricsRequest])
  const metrics = apiMetrics?.key === metricsKey ? apiMetrics.metrics : localMetrics

  // Reset Session
  const handleReset = () => {
    hapticMedium()
    setObservedTraceIds(new Set())
    setActiveTraceIndex(0)
    setArticulationAnswers({})
    setUnlockedPrincipleIds(new Set())
    setCompletedReflectionIds(new Set())
    setOpenArticulationTexts({})
    setCurrentStage('modeling')
    triggerToast('Apprenticeship workbench reset. Ready to observe expert traces.')
  }

  // Observe active trace
  const handleObserveTrace = (traceId: string) => {
    if (!observedTraceIds.has(traceId)) {
      hapticLight()
      playTone('success')
      setObservedTraceIds((prev) => new Set(prev).add(traceId))
      triggerToast('Expert trace observed and stored in perceptual buffer!')
    }
  }

  // Answer articulation prompt
  const handleSelectArticulation = (promptId: string, optionId: string) => {
    const prompt = suite.prompts.find((p) => p.id === promptId)
    if (!prompt) return
    const opt = prompt.options.find((o) => o.id === optionId)
    if (!opt) return

    setArticulationAnswers((prev) => ({
      ...prev,
      [promptId]: { optionId, score: opt.tacitAlignmentScore, principleId: opt.principleId },
    }))

    if (opt.tacitAlignmentScore >= 0.8) {
      hapticMedium()
      if (opt.principleId && !unlockedPrincipleIds.has(opt.principleId)) {
        playTone('unlock')
        setUnlockedPrincipleIds((prev) => new Set(prev).add(opt.principleId!))
        triggerToast('Tacit Heuristic Unlocked! Principle added to mental model ledger.')
      } else {
        playTone('success')
        triggerToast('High-fidelity cognitive alignment! Articulation verified.')
      }
    } else {
      hapticHeavy()
      playTone('alert')
      triggerToast('Low tacit alignment. Inspect the expert diagnostic contrast.')
    }
  }

  // Toggle reflection completed
  const handleToggleReflection = (contrastId: string) => {
    hapticLight()
    playTone('success')
    setCompletedReflectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(contrastId)) next.delete(contrastId)
      else next.add(contrastId)
      return next
    })
  }

  // Export FSRS flashcards — engine synthesis via the hub API (POST `deck`),
  // with the studio's own builder kept as the offline fallback (it mirrors the
  // engine's `CognitiveApprenticeshipSession.exportFSRSCards` exactly).
  const extractedPrincipleIdList = useMemo(
    () => [...unlockedPrincipleIds].sort(),
    [unlockedPrincipleIds],
  )

  const fallbackCards = useMemo<readonly FSRSTacitHeuristicCard[]>(() => {
    return suite.principles.map((pr) => {
      const isExtracted = unlockedPrincipleIds.has(pr.id)
      const matchingPrompt = suite.prompts.find((p) =>
        p.options.some((o) => o.principleId === pr.id),
      )
      const matchingTrace = matchingPrompt
        ? suite.traces.find((t) => t.id === matchingPrompt.traceStepId)
        : suite.traces[0]

      return {
        id: `fsrs_${suite.id}_${pr.id}`,
        suiteId: suite.id,
        principleId: pr.id,
        stage: currentStage,
        prompt: `[Cognitive Apprenticeship - ${suite.title}]\nHow does an expert model "${pr.name}"?\nCore Maxim: ${pr.coreFormulaOrMaxim}`,
        expertThinkAloudQuote: matchingTrace
          ? matchingTrace.tacitHeuristic
          : 'Expert Heuristic: Focus on invariant boundary conditions.',
        underlyingTacitHeuristic: pr.description,
        commonNoviceTrap: pr.noviceMisconception,
        collinsPedagogicalNote:
          'Collins, Brown & Newman (1989): Articulation makes tacit expert heuristics explicit, transforming fuzzy intuitions into durable mental models.',
        recommendedStabilityMultiplier: isExtracted ? 1.4 : 0.85,
      }
    })
  }, [suite, unlockedPrincipleIds, currentStage])

  // The deck request is keyed on suite | stage | extracted principles; a
  // response is applied only while its key still matches, so a stale
  // in-flight response can never render for a different deck — the offline
  // builder above (which mirrors the engine byte-for-byte) covers the
  // in-flight window and manual mode.
  const [apiDeck, setApiDeck] = useState<{
    key: string
    cards: readonly FSRSTacitHeuristicCard[]
  } | null>(null)
  const deckKey = `${suite.id}|${currentStage}|${extractedPrincipleIdList.join(',')}`
  useEffect(() => {
    let stale = false
    apiSend<DeckResponse>('/api/apprenticeship', 'POST', {
      action: 'deck',
      suiteId: suite.id,
      stage: currentStage,
      extractedPrincipleIds: extractedPrincipleIdList,
    })
      .then((res) => {
        if (!stale && res?.cards) setApiDeck({ key: deckKey, cards: res.cards })
      })
      .catch(() => {
        // Manual mode: the offline builder already rendered this deck.
      })
    return () => {
      stale = true
    }
  }, [deckKey, suite, currentStage, extractedPrincipleIdList])
  const exportedCards = apiDeck?.key === deckKey ? apiDeck.cards : fallbackCards

  const handleCopyDeck = () => {
    navigator.clipboard?.writeText(JSON.stringify(exportedCards, null, 2))
    triggerToast('Copied FSRS tacit heuristic cards to clipboard!')
  }

  const currentTrace = suite.traces[activeTraceIndex] || suite.traces[0]

  return (
    <div className="space-y-6">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2.5 text-xs shadow-lg transition-all">
          {toastMessage}
        </div>
      )}

      {/* Header & Suite Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-200/60 dark:border-(--hub-border)/60 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-strong flex items-center gap-2">
            <Compass className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Cognitive Apprenticeship &amp; Expert Modeling Studio
          </h2>
          <p className="text-xs text-tertiary mt-0.5">
            Allan Collins, John Seely Brown &amp; Susan Newman (1989) • Jean Lave &amp; Etienne
            Wenger (1991) LPP
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="suite-select" className="text-xs font-medium text-tertiary">
            Domain Modeling Suite:
          </label>
          <select
            id="suite-select"
            value={selectedSuiteId}
            onChange={(e) => {
              setSelectedSuiteId(e.target.value)
              handleReset()
            }}
            className="rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) px-3 py-1.5 text-xs font-medium text-strong shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {Object.values(suites).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          <Button variant="ghost" onClick={handleReset} title="Reset session">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Top HUD: Apprenticeship Status & Fading */}
      <CognitiveApprenticeshipHUD
        currentStage={currentStage}
        metrics={metrics}
        onSelectStage={(st) => setCurrentStage(st)}
      />

      {/* Domain Context Banner */}
      <div className="rounded-xl border border-neutral-200/60 dark:border-(--hub-border)/60 bg-neutral-100/30 dark:bg-(--hub-panel-2)/30 p-3.5 sm:p-4 text-xs space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-strong flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            Master Modeler Persona: {suite.expertPersona}
          </span>
          <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 text-[10px]">
            {suite.domain}
          </Badge>
        </div>
        <p className="text-tertiary">{suite.problemContext}</p>
        <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
          Target Outcome: {suite.targetMasteryOutcome}
        </p>
      </div>

      {/* Main Studio Tabs */}
      <div className="flex border-b border-neutral-200/60 dark:border-(--hub-border)/60 gap-2 overflow-x-auto text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('traces')}
          className={`px-3.5 py-2 border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'traces'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-tertiary hover:text-strong'
          }`}
        >
          <Eye className="h-4 w-4" />
          1. Expert Think-Aloud Traces
          <Badge className="ml-1 text-[10px] bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary">
            {suite.traces.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('articulation')}
          className={`px-3.5 py-2 border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'articulation'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-tertiary hover:text-strong'
          }`}
        >
          <Brain className="h-4 w-4" />
          2. Articulation Crucible
          <Badge className="ml-1 text-[10px] bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary">
            {Object.keys(articulationAnswers).length}/{suite.prompts.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reflection')}
          className={`px-3.5 py-2 border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'reflection'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-tertiary hover:text-strong'
          }`}
        >
          <Compass className="h-4 w-4" />
          3. Comparative Reflection
          <Badge className="ml-1 text-[10px] bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary">
            {completedReflectionIds.size}/{suite.reflectionContrasts.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deck')}
          className={`px-3.5 py-2 border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'deck'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-tertiary hover:text-strong'
          }`}
        >
          <Layers className="h-4 w-4" />
          4. FSRS Tacit Deck &amp; Ledger
          <Badge className="ml-1 text-[10px] bg-neutral-100 dark:bg-(--hub-panel-2) text-secondary">
            {unlockedPrincipleIds.size} Maxims
          </Badge>
        </button>
      </div>

      {/* TAB 1: EXPERT THINK-ALOUD TRACES (MODELING) */}
      {activeTab === 'traces' && (
        <div className="space-y-6 animate-fade-in">
          {/* Step Selector Ribbon */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {suite.traces.map((trace, idx) => {
              const isSelected = activeTraceIndex === idx
              const isObserved = observedTraceIds.has(trace.id)
              return (
                <button
                  key={trace.id}
                  type="button"
                  onClick={() => {
                    setActiveTraceIndex(idx)
                    handleObserveTrace(trace.id)
                  }}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    isSelected
                      ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/40'
                      : isObserved
                        ? 'border-emerald-500/30 bg-white dark:bg-(--hub-panel) text-strong hover:bg-neutral-100/40 dark:hover:bg-(--hub-panel-2)/40'
                        : 'border-neutral-200 dark:border-(--hub-border) bg-neutral-100/40 dark:bg-(--hub-panel-2)/40 text-tertiary hover:bg-white dark:hover:bg-(--hub-panel)'
                  }`}
                >
                  <span className="font-bold">Step {trace.stepNumber}</span>
                  <span className="line-clamp-1">{trace.phase}</span>
                  {isObserved && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success-text shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Active Trace Deep-Dive */}
          <Panel className="space-y-5 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/60 dark:border-(--hub-border)/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    Step {currentTrace.stepNumber} • {currentTrace.phase}
                  </span>
                  {observedTraceIds.has(currentTrace.id) ? (
                    <Badge className="bg-emerald-500/10 text-status-success-text border-emerald-500/30 text-[10px]">
                      Observed
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-status-warning-text border-amber-500/30 text-[10px]">
                      Pending Observation
                    </Badge>
                  )}
                </div>
                <h3 className="text-base font-bold text-strong mt-0.5">{currentTrace.title}</h3>
              </div>

              {!observedTraceIds.has(currentTrace.id) && (
                <Button
                  variant="secondary"
                  onClick={() => handleObserveTrace(currentTrace.id)}
                  className="px-2.5 py-1 text-xs"
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Mark as Observed
                </Button>
              )}
            </div>

            {/* Split View: Observable Action vs Hidden Tacit Heuristic */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Observable External Action */}
              <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-white dark:bg-(--hub-panel) p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-strong">
                  <Eye className="h-4 w-4 text-blue-500" />
                  Observable External Action
                </div>
                <p className="text-xs text-tertiary leading-relaxed">
                  {currentTrace.observableAction}
                </p>
              </div>

              {/* Invisible Tacit Heuristic */}
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <Brain className="h-4 w-4" />
                  Invisible Expert Tacit Heuristic (Think-Aloud)
                </div>
                <p className="text-xs text-strong leading-relaxed font-mono bg-neutral-100/50 dark:bg-(--hub-panel-2)/50 p-2.5 rounded-lg border border-indigo-500/20">
                  {currentTrace.tacitHeuristic}
                </p>
              </div>
            </div>

            {/* Tradeoffs Considered */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-strong flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-status-warning-text" />
                Active Tradeoffs Weighed by Master Modeler
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {currentTrace.tradeoffsConsidered.map((t, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-neutral-200/60 dark:border-(--hub-border)/60 bg-neutral-100/20 dark:bg-(--hub-panel-2)/20 p-2.5 text-tertiary flex items-start gap-2"
                  >
                    <ArrowRight className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rejected Alternatives */}
            {currentTrace.rejectedAlternatives.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-danger-text dark:text-danger-text flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Rejected Naive Alternatives &amp; Why They Fail
                </span>
                <div className="space-y-2 text-xs">
                  {currentTrace.rejectedAlternatives.map((rej, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-rose-500/20 bg-rose-50 dark:bg-rose-950/20 p-3 space-y-1 text-xs"
                    >
                      <div className="font-semibold text-danger-text dark:text-danger-text">
                        Alternative: {rej.alternative}
                      </div>
                      <div className="text-secondary leading-relaxed">
                        Fatal Reason: {rej.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metacognitive Self-Correction */}
            {currentTrace.metacognitiveSelfCorrection && (
              <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-white dark:bg-(--hub-panel) p-3.5 space-y-1.5 text-xs">
                <div className="font-semibold text-strong flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-status-warning-text" />
                  Metacognitive Self-Correction &amp; Boundary Guard
                </div>
                <p className="text-tertiary leading-relaxed italic">
                  "{currentTrace.metacognitiveSelfCorrection}"
                </p>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* TAB 2: ARTICULATION CRUCIBLE */}
      {activeTab === 'articulation' && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-xl border border-neutral-200/60 dark:border-(--hub-border)/60 bg-neutral-100/30 dark:bg-(--hub-panel-2)/30 p-4 text-xs space-y-1">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Collins-Brown Method 4: Articulation
            </span>
            <p className="text-tertiary">
              Verbalize and isolate the implicit heuristics witnessed during expert modeling.
              Choosing the deep diagnostic rationale unlocks permanent tacit principles in your
              mastery ledger.
            </p>
          </div>

          <div className="space-y-5">
            {suite.prompts.map((p) => {
              const currentAnswer = articulationAnswers[p.id]

              return (
                <Panel key={p.id} className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/60 dark:border-(--hub-border)/60 pb-2.5">
                    <div>
                      <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                        {p.cognitiveSkillTested}
                      </span>
                      <h4 className="text-sm font-bold text-strong mt-0.5">{p.promptTitle}</h4>
                    </div>

                    {currentAnswer && (
                      <Badge
                        className={`text-[10px] ${
                          currentAnswer.score >= 0.8
                            ? 'bg-emerald-500/10 text-status-success-text border-emerald-500/30'
                            : 'bg-amber-500/10 text-status-warning-text border-amber-500/30'
                        }`}
                      >
                        {Math.round(currentAnswer.score * 100)}% Alignment
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs font-medium text-strong leading-relaxed">{p.question}</p>

                  {/* Options */}
                  <div className="space-y-2">
                    {p.options.map((opt) => {
                      const isSelected = currentAnswer?.optionId === opt.id

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectArticulation(p.id, opt.id)}
                          className={`w-full text-left rounded-lg p-3 border transition-all text-xs ${
                            isSelected
                              ? opt.tacitAlignmentScore >= 0.8
                                ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40 text-strong'
                                : 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40 text-strong'
                              : 'border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) hover:bg-neutral-100/40 dark:hover:bg-(--hub-panel-2)/40 text-strong'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="leading-relaxed">{opt.text}</span>
                            {isSelected && (
                              <CheckCircle2
                                className={`h-4 w-4 shrink-0 mt-0.5 ${
                                  opt.tacitAlignmentScore >= 0.8
                                    ? 'text-status-success-text'
                                    : 'text-status-warning-text'
                                }`}
                              />
                            )}
                          </div>

                          {/* Diagnostic Feedback upon Selection */}
                          {isSelected && (
                            <div className="mt-2.5 pt-2 border-t border-neutral-200/60 dark:border-(--hub-border)/60 text-[11px] text-tertiary leading-relaxed">
                              <span className="font-semibold text-strong">
                                Diagnostic Feedback:{' '}
                              </span>
                              {opt.diagnosticFeedback}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Open Articulation Box */}
                  <div className="pt-2 space-y-1.5">
                    <label
                      htmlFor={`open-art-${p.id}`}
                      className="text-[11px] font-semibold text-tertiary flex items-center gap-1"
                    >
                      <BookOpen className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                      Free-Form Articulation Scaffold:
                    </label>
                    <textarea
                      id={`open-art-${p.id}`}
                      rows={2}
                      value={openArticulationTexts[p.id] || ''}
                      onChange={(e) =>
                        setOpenArticulationTexts((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      placeholder={p.openArticulationScaffold}
                      className="w-full rounded-lg border border-neutral-200 dark:border-(--hub-border) bg-white dark:bg-(--hub-panel) p-2.5 text-xs text-strong placeholder:text-tertiary/60 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </Panel>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 3: COMPARATIVE REFLECTION */}
      {activeTab === 'reflection' && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-xl border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50 dark:bg-(--hub-panel-2) p-4 text-xs space-y-1">
            <span className="font-semibold text-strong flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Collins-Brown Method 5: Reflection
            </span>
            <p className="text-secondary">
              Compare your mental models directly against those of the expert. Notice the shift from
              operational procedural execution to invariant structural reasoning.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {suite.reflectionContrasts.map((rc) => {
              const isDone = completedReflectionIds.has(rc.id)

              return (
                <Panel key={rc.id} className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-2.5">
                    <h4 className="text-sm font-bold text-strong flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-status-warning-text" />
                      Reflection: {rc.aspect}
                    </h4>
                    <Button
                      variant={isDone ? 'secondary' : 'primary'}
                      onClick={() => handleToggleReflection(rc.id)}
                      className="px-2.5 py-1 text-xs"
                    >
                      {isDone ? 'Completed' : 'Mark Reflected'}
                    </Button>
                  </div>

                  {/* Novice vs Expert Contrast Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1.5">
                      <span className="font-semibold text-status-warning-text flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Common Novice Intuition
                      </span>
                      <p className="text-secondary leading-relaxed">{rc.noviceApproach}</p>
                    </div>

                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1.5">
                      <span className="font-semibold text-status-success-text flex items-center gap-1">
                        <Brain className="h-3.5 w-3.5" />
                        Master Modeler Approach
                      </span>
                      <p className="text-strong leading-relaxed font-medium">{rc.expertApproach}</p>
                    </div>
                  </div>

                  {/* Underlying Mental Model Shift */}
                  <div className="rounded-lg border border-neutral-200/80 dark:border-(--hub-border)/80 bg-neutral-50/60 dark:bg-(--hub-panel-2)/60 p-3 text-xs space-y-1">
                    <span className="font-semibold text-strong">
                      Underlying Mental Model Shift:
                    </span>
                    <p className="text-secondary">{rc.underlyingMentalModel}</p>
                  </div>

                  {/* Golden Insight */}
                  <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs space-y-1">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" />
                      Golden Heuristic Insight:
                    </span>
                    <p className="text-strong font-mono">{rc.goldenInsight}</p>
                  </div>
                </Panel>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 4: FSRS TACIT DECK & LEDGER */}
      {activeTab === 'deck' && (
        <div className="space-y-6 animate-fade-in">
          {/* Unlocked Principles Ledger */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-strong flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Tacit Principle Mastery Ledger
              </span>
              <span className="text-tertiary">
                {unlockedPrincipleIds.size} of {suite.principles.length} Unlocked
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {suite.principles.map((pr) => {
                const isUnlocked = unlockedPrincipleIds.has(pr.id)

                return (
                  <div
                    key={pr.id}
                    className={`rounded-xl border p-3.5 space-y-1.5 transition-all ${
                      isUnlocked
                        ? 'border-emerald-500/40 bg-white dark:bg-(--hub-panel) shadow-sm'
                        : 'border-neutral-200/60 dark:border-(--hub-border)/60 bg-neutral-50 dark:bg-(--hub-panel-2) opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-strong">{pr.name}</span>
                      {isUnlocked ? (
                        <Badge className="bg-emerald-500/10 text-status-success-text border-emerald-500/30 text-[10px]">
                          Unlocked
                        </Badge>
                      ) : (
                        <Badge className="bg-neutral-100 dark:bg-neutral-800 text-tertiary border-neutral-200 dark:border-(--hub-border) text-[10px]">
                          Locked
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                      {pr.coreFormulaOrMaxim}
                    </p>
                    <p className="text-secondary text-[11px] line-clamp-2">{pr.description}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* FSRS Flashcards Header & Export */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-200/80 dark:border-(--hub-border)/80 pt-4">
            <div>
              <h3 className="text-sm font-bold text-strong flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                FSRS-6 Tacit Heuristic Flashcards ({exportedCards.length} Cards)
              </h3>
              <p className="text-xs text-secondary">
                Spaced repetition prompts engineered to consolidate expert tacit models into durable
                long-term schemas.
              </p>
            </div>

            <Button variant="secondary" onClick={handleCopyDeck} className="px-2.5 py-1 text-xs">
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy Deck JSON
            </Button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exportedCards.map((card) => (
              <Panel key={card.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-[10px] text-tertiary border-b border-neutral-200/80 dark:border-(--hub-border)/80 pb-1.5">
                  <span className="font-mono">{card.id}</span>
                  <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 text-[10px]">
                    S₀ Multiplier: {card.recommendedStabilityMultiplier}x
                  </Badge>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-strong">Front Prompt:</span>
                  <p className="text-secondary bg-neutral-50 dark:bg-(--hub-panel-2) p-2 rounded border border-neutral-200/60 dark:border-(--hub-border)/60 whitespace-pre-line font-mono text-[11px]">
                    {card.prompt}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    Expert Think-Aloud Quote:
                  </span>
                  <p className="text-strong italic bg-indigo-500/5 p-2 rounded border border-indigo-500/20">
                    "{card.expertThinkAloudQuote}"
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-danger-text dark:text-danger-text">
                    Novice Intuition Trap:
                  </span>
                  <p className="text-secondary text-[11px]">{card.commonNoviceTrap}</p>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
